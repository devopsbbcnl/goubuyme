// PWM Phase 2: recruitment and applicant tracking, plus the public careers endpoints.
import { Prisma, PwmApplicationStage, PwmVacancyStatus } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig, nextEmployeeNo, nextNumber } from '../../services/pwm/settings';
import { can, dateOnly, fromYmd, lagosYmd, normalisePhone } from '../../services/pwm/rules';
import { approverUserIds, hrAdminUserIds, startChecklist } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { parseHrReference } from '../../services/objectStorage.service';
import { access, email, fail, handle, int, nameMap, oneOf, reqStr, reqYmd, str, ymd } from './common';

const STAGES: readonly PwmApplicationStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN'];
/** HIRED is only reachable through the hire action, which creates the employee. */
const MANUAL_STAGES = STAGES.filter((s) => s !== 'HIRED');
const OPEN_STAGES: PwmApplicationStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER'];

const deptScope = (a: ReturnType<typeof access>): Prisma.PwmVacancyWhereInput =>
  a.level === 'DEPARTMENT_HEAD' ? { departmentId: { in: a.headedDepartmentIds.length ? a.headedDepartmentIds : ['__none__'] } } : {};

// ── Vacancies ────────────────────────────────────────────────────────────────

// GET /vacancies?status=
export const listVacancies = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const rows = await prisma.pwmVacancy.findMany({
    where: { ...deptScope(a), ...(q.status ? { status: q.status as PwmVacancyStatus } : {}) }, orderBy: { createdAt: 'desc' }, take: 300,
    include: { applications: { select: { stage: true } } },
  });
  const depts = new Map((await prisma.pwmDepartment.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  return apiResponse.success(res, 'Vacancies.', rows.map((v) => ({
    ...v, applications: undefined, department: v.departmentId ? depts.get(v.departmentId) ?? null : null,
    applicants: v.applications.length, active: v.applications.filter((x) => OPEN_STAGES.includes(x.stage)).length, hired: v.applications.filter((x) => x.stage === 'HIRED').length,
  })));
});

const vacancyData = async (b: Record<string, unknown>, partial: boolean) => {
  const cfg = await getPwmConfig();
  const d: Prisma.PwmVacancyUncheckedUpdateInput = {};
  if (!partial || b.title !== undefined) d.title = reqStr(b.title, 'Title', 160);
  if (b.departmentId !== undefined) {
    const id = str(b.departmentId, 60);
    if (id && !(await prisma.pwmDepartment.findFirst({ where: { id, archivedAt: null }, select: { id: true } }))) fail(400, 'Department not found.');
    d.departmentId = id;
  }
  if (!partial || b.employmentType !== undefined) d.employmentType = oneOf(b.employmentType, cfg.employmentTypes, 'Employment type');
  if (b.hiringManagerId !== undefined) d.hiringManagerId = str(b.hiringManagerId, 60);
  for (const k of ['location', 'description', 'requirements'] as const) if (b[k] !== undefined) (d as Record<string, unknown>)[k] = str(b[k], 8000);
  if (b.headcount !== undefined) d.headcount = int(b.headcount, 'Headcount', 1, 100) ?? 1;
  if (b.closingDate !== undefined) { const c = ymd(b.closingDate, 'Closing date'); d.closingDate = c ? fromYmd(c) : null; }
  if (b.isPublic !== undefined) d.isPublic = !!b.isPublic;
  return d;
};

// POST /vacancies
export const createVacancy = handle(async (req, res) => {
  const a = access(req);
  const d = await vacancyData(req.body ?? {}, false);
  const year = new Date().getFullYear();
  const reference = `VAC-${year}-${String(await nextNumber(`vacancy:${year}`)).padStart(4, '0')}`;
  const v = await prisma.pwmVacancy.create({ data: { ...(d as Prisma.PwmVacancyUncheckedCreateInput), reference, createdById: a.userId } });
  await pwmAudit(req, { action: 'VACANCY_CREATED', entity: 'PwmVacancy', entityId: v.id, after: { reference, title: v.title } });
  return apiResponse.success(res, 'Vacancy created.', v, 201);
});

// GET /vacancies/:id (with the pipeline)
export const getVacancy = handle(async (req, res) => {
  const a = access(req);
  const v = await prisma.pwmVacancy.findFirst({
    where: { id: req.params.id, ...deptScope(a) },
    include: { applications: { orderBy: { createdAt: 'asc' }, include: { candidate: true, interviews: { orderBy: { scheduledAt: 'asc' } } } } },
  });
  if (!v) fail(404, 'Vacancy not found.');
  const vac = v!;
  const names = await nameMap([vac.approvedById, ...vac.applications.flatMap((x) => x.interviews.flatMap((i) => (i.panelUserIds as string[] | null) ?? []))]);
  const dept = vac.departmentId ? await prisma.pwmDepartment.findUnique({ where: { id: vac.departmentId }, select: { name: true } }) : null;
  const hm = vac.hiringManagerId ? await prisma.pwmEmployee.findUnique({ where: { id: vac.hiringManagerId }, select: { firstName: true, lastName: true } }) : null;
  return apiResponse.success(res, 'Vacancy.', {
    ...vac, department: dept?.name ?? null, hiringManager: hm ? `${hm.firstName} ${hm.lastName}` : null, approvedByName: vac.approvedById ? names.get(vac.approvedById) ?? null : null,
    applications: vac.applications.map((x) => ({
      ...x, interviews: x.interviews.map((i) => ({ ...i, panel: ((i.panelUserIds as string[] | null) ?? []).map((id) => ({ userId: id, name: names.get(id) ?? 'Unknown' })) })),
    })),
    canManage: can(a, 'manageRecruitment'), canApprove: can(a, 'approveVacancies'),
  });
});

// PATCH /vacancies/:id
export const updateVacancy = handle(async (req, res) => {
  const cur = await prisma.pwmVacancy.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Vacancy not found.');
  if (['FILLED', 'CLOSED'].includes(cur!.status)) fail(409, 'A closed vacancy cannot be edited.');
  const d = await vacancyData(req.body ?? {}, true);
  const v = await prisma.pwmVacancy.update({ where: { id: cur!.id }, data: d });
  await pwmAudit(req, { action: 'VACANCY_UPDATED', entity: 'PwmVacancy', entityId: v.id, before: Object.fromEntries(Object.keys(d).map((k) => [k, (cur as Record<string, unknown>)[k]])), after: d });
  return apiResponse.success(res, 'Saved.', v);
});

// POST /vacancies/:id/status { action: submit|approve|reject|hold|reopen|close, note }
export const vacancyAction = handle(async (req, res) => {
  const a = access(req);
  const cfg = await getPwmConfig();
  const v = await prisma.pwmVacancy.findUnique({ where: { id: req.params.id } });
  if (!v) fail(404, 'Vacancy not found.');
  const cur = v!;
  const action = oneOf(req.body?.action, ['submit', 'approve', 'reject', 'hold', 'reopen', 'close'] as const, 'Action');
  const note = str(req.body?.note, 500);
  let status: PwmVacancyStatus | null = null; const data: Prisma.PwmVacancyUncheckedUpdateInput = {};
  if (action === 'submit') {
    if (!can(a, 'manageRecruitment')) fail(403, 'Forbidden. Insufficient permissions.');
    if (cur.status !== 'DRAFT') fail(409, 'Only a draft can be submitted.');
    status = cfg.vacancyApprovalRequired ? 'PENDING_APPROVAL' : 'OPEN';
    if (status === 'OPEN') data.openedAt = new Date();
  } else if (action === 'approve' || action === 'reject') {
    if (!can(a, 'approveVacancies')) fail(403, 'Forbidden. Insufficient permissions.');
    if (cur.status !== 'PENDING_APPROVAL') fail(409, 'This vacancy is not waiting for approval.');
    if (cur.createdById === a.userId && !cfg.allowSelfApproval) fail(403, 'You cannot approve a vacancy you created.');
    if (action === 'reject' && !note) fail(400, 'Say why the vacancy is being returned.');
    status = action === 'approve' ? 'OPEN' : 'DRAFT';
    Object.assign(data, { approvedById: a.userId, approvedAt: new Date(), ...(action === 'approve' ? { openedAt: new Date() } : {}) });
  } else {
    if (!can(a, 'manageRecruitment')) fail(403, 'Forbidden. Insufficient permissions.');
    if (action === 'hold') { if (cur.status !== 'OPEN') fail(409, 'Only an open vacancy can be put on hold.'); status = 'ON_HOLD'; }
    if (action === 'reopen') { if (!['ON_HOLD', 'CLOSED'].includes(cur.status)) fail(409, 'Only a held or closed vacancy can be reopened.'); status = 'OPEN'; }
    if (action === 'close') { if (['FILLED', 'CLOSED'].includes(cur.status)) fail(409, 'Already closed.'); status = 'CLOSED'; }
  }
  const upd = await prisma.pwmVacancy.update({ where: { id: cur.id }, data: { ...data, status: status as PwmVacancyStatus } });
  await pwmAudit(req, { action: `VACANCY_${action.toUpperCase()}`, entity: 'PwmVacancy', entityId: cur.id, before: { status: cur.status }, after: { status }, reason: note ?? undefined });
  if (status === 'PENDING_APPROVAL') await notifyPwm((await approverUserIds()).filter((id) => id !== a.userId), { title: `Vacancy awaiting approval: ${cur.title}`, body: `${cur.reference}. Review and approve before it can be advertised.`, link: `/pwm/recruitment/${cur.id}` });
  if (action === 'reject' || action === 'approve') await notifyPwm([cur.createdById], { title: `Vacancy ${action === 'approve' ? 'approved' : 'returned'}: ${cur.title}`, body: note ?? '', link: `/pwm/recruitment/${cur.id}` });
  return apiResponse.success(res, 'Done.', upd);
});

// ── Candidates and applications ──────────────────────────────────────────────

// POST /vacancies/:id/applications { firstName, lastName, email, phone, source, cvUrl, notes }
export const addApplication = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const v = await prisma.pwmVacancy.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
  if (!v) fail(404, 'Vacancy not found.');
  if (!['OPEN', 'ON_HOLD'].includes(v!.status)) fail(409, 'Applications can only be added to an open vacancy.');
  const mail = email(b.email, 'Email');
  if (!mail) fail(400, 'Email is required.');
  const phoneRaw = str(b.phone, 40);
  const cand = await prisma.pwmCandidate.upsert({
    where: { email: mail! },
    create: { firstName: reqStr(b.firstName, 'First name', 80), lastName: reqStr(b.lastName, 'Last name', 80), email: mail!, phone: phoneRaw ? normalisePhone(phoneRaw) : null, source: str(b.source, 80) ?? 'Recruiter', cvUrl: str(b.cvUrl, 1000), notes: str(b.notes, 2000), consentAt: b.consentGiven ? new Date() : null },
    update: { ...(str(b.cvUrl, 1000) ? { cvUrl: str(b.cvUrl, 1000) } : {}) },
  });
  if (cand.anonymisedAt) fail(409, 'This person was anonymised at their request or after the retention period. Ask them to apply again themselves.');
  const dupe = await prisma.pwmApplication.findUnique({ where: { vacancyId_candidateId: { vacancyId: v!.id, candidateId: cand.id } } });
  if (dupe) fail(409, 'This candidate has already applied for this vacancy.');
  const app = await prisma.pwmApplication.create({ data: { vacancyId: v!.id, candidateId: cand.id, coverNote: str(b.coverNote, 3000) } });
  await pwmAudit(req, { action: 'APPLICATION_ADDED', entity: 'PwmVacancy', entityId: v!.id, after: { applicationId: app.id, candidateId: cand.id } });
  return apiResponse.success(res, 'Candidate added.', app, 201);
});

// PATCH /applications/:id { stage, rating, notes, rejectionReason, offerNotes }
export const updateApplication = handle(async (req, res) => {
  const b = req.body ?? {};
  const app = await prisma.pwmApplication.findUnique({ where: { id: req.params.id }, include: { vacancy: { select: { id: true, status: true, title: true } } } });
  if (!app) fail(404, 'Application not found.');
  const cur = app!;
  if (cur.stage === 'HIRED') fail(409, 'This candidate has already been hired.');
  const data: Prisma.PwmApplicationUncheckedUpdateInput = {};
  if (b.stage !== undefined) {
    const stage = oneOf(b.stage, MANUAL_STAGES, 'Stage');
    if (stage === 'REJECTED' && !str(b.rejectionReason, 500)) fail(400, 'Record a reason for rejecting this candidate.');
    if (stage === 'OFFER' && !str(b.offerNotes, 1000) && !cur.offerNotes) fail(400, 'Record the offer terms (not salary) before moving to Offer.');
    data.stage = stage; data.stageChangedAt = new Date();
    if (stage === 'OFFER') data.offeredAt = new Date();
    if (stage === 'REJECTED') data.rejectionReason = str(b.rejectionReason, 500);
  }
  if (b.rating !== undefined) data.rating = int(b.rating, 'Rating', 1, 5);
  if (b.notes !== undefined) data.notes = str(b.notes, 4000);
  if (b.offerNotes !== undefined) data.offerNotes = str(b.offerNotes, 1000);
  const upd = await prisma.pwmApplication.update({ where: { id: cur.id }, data });
  if (data.stage) await pwmAudit(req, { action: 'APPLICATION_STAGE', entity: 'PwmVacancy', entityId: cur.vacancyId, before: { stage: cur.stage }, after: { stage: data.stage }, reason: str(b.rejectionReason, 500) ?? undefined, meta: { applicationId: cur.id } });
  return apiResponse.success(res, 'Saved.', upd);
});

// POST /applications/:id/interviews { scheduledAt, mode, location, panelUserIds }
export const scheduleInterview = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const app = await prisma.pwmApplication.findUnique({ where: { id: req.params.id }, include: { candidate: { select: { firstName: true, lastName: true } }, vacancy: { select: { title: true, id: true } } } });
  if (!app) fail(404, 'Application not found.');
  const when = new Date(String(b.scheduledAt));
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 3_600_000) fail(400, 'Choose a date and time in the future.');
  const panel: string[] = [...new Set<string>((Array.isArray(b.panelUserIds) ? b.panelUserIds : []).map(String))].slice(0, 8);
  const i = await prisma.pwmInterview.create({ data: { applicationId: app!.id, scheduledAt: when, mode: oneOf(b.mode ?? 'IN_PERSON', ['IN_PERSON', 'PHONE', 'VIDEO'] as const, 'Mode'), location: str(b.location, 200), panelUserIds: panel, createdById: a.userId } });
  if (app!.stage === 'APPLIED' || app!.stage === 'SCREENING') await prisma.pwmApplication.update({ where: { id: app!.id }, data: { stage: 'INTERVIEW', stageChangedAt: new Date() } });
  await pwmAudit(req, { action: 'INTERVIEW_SCHEDULED', entity: 'PwmVacancy', entityId: app!.vacancy.id, meta: { applicationId: app!.id, at: when.toISOString() } });
  await notifyPwm(panel, { title: `Interview: ${app!.candidate.firstName} ${app!.candidate.lastName}`, body: `${app!.vacancy.title}, ${when.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}${i.location ? `, ${i.location}` : ''}.`, link: `/pwm/recruitment/${app!.vacancy.id}` });
  return apiResponse.success(res, 'Interview scheduled and the panel notified.', i, 201);
});

// POST /interviews/:id/feedback { score, notes } (a panel member) or { status: CANCELLED }
export const interviewFeedback = handle(async (req, res) => {
  const a = access(req);
  const i = await prisma.pwmInterview.findUnique({ where: { id: req.params.id } });
  if (!i) fail(404, 'Interview not found.');
  const iv = i!;
  const panel = (iv.panelUserIds as string[] | null) ?? [];
  if (req.body?.status === 'CANCELLED') {
    if (!can(a, 'manageRecruitment')) fail(403, 'Forbidden. Insufficient permissions.');
    await prisma.pwmInterview.update({ where: { id: iv.id }, data: { status: 'CANCELLED' } });
    return apiResponse.success(res, 'Cancelled.', null);
  }
  if (!panel.includes(a.userId) && !can(a, 'manageRecruitment')) fail(403, 'Only the interview panel can give feedback.');
  const score = int(req.body?.score, 'Score', 1, 5);
  if (!score) fail(400, 'Give a score from 1 to 5.');
  const fb = ((iv.feedback as { userId: string; score: number; notes: string | null }[] | null) ?? []).filter((x) => x.userId !== a.userId);
  fb.push({ userId: a.userId, score: score!, notes: str(req.body?.notes, 2000) });
  await prisma.pwmInterview.update({ where: { id: iv.id }, data: { feedback: fb, status: 'COMPLETED' } });
  return apiResponse.success(res, 'Feedback recorded.', null);
});

// POST /applications/:id/hire { hireDate, departmentId, jobTitle, confirmNotDuplicate }
export const hire = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const cfg = await getPwmConfig();
  const app = await prisma.pwmApplication.findUnique({ where: { id: req.params.id }, include: { candidate: true, vacancy: true } });
  if (!app) fail(404, 'Application not found.');
  const ap = app!;
  if (ap.stage !== 'OFFER') fail(409, 'Only a candidate at the Offer stage can be hired.');
  if (ap.candidate.anonymisedAt) fail(409, 'This candidate has been anonymised.');
  const hireDate = reqYmd(b.hireDate, 'Start date');
  const departmentId = str(b.departmentId, 60) ?? ap.vacancy.departmentId;
  if (!departmentId) fail(400, 'Choose a department.');
  const dupes = await prisma.pwmEmployee.findMany({ where: { OR: [{ personalEmail: ap.candidate.email }, { firstName: { equals: ap.candidate.firstName, mode: 'insensitive' }, lastName: { equals: ap.candidate.lastName, mode: 'insensitive' } }] }, select: { id: true, employeeNo: true, firstName: true, lastName: true, status: true }, take: 5 });
  if (dupes.length && !b.confirmNotDuplicate) return apiResponse.error(res, 'Someone with this name or email is already on record. A returning employee should be rehired, not created again.', 409, dupes);

  const emp = await prisma.$transaction(async (tx) => {
    const employeeNo = await nextEmployeeNo(cfg.employeeIdPrefix, Number(hireDate.slice(0, 4)));
    const e = await tx.pwmEmployee.create({
      data: { employeeNo, firstName: ap.candidate.firstName, lastName: ap.candidate.lastName, personalEmail: ap.candidate.email, phone: ap.candidate.phone, departmentId, jobTitle: str(b.jobTitle, 120) ?? ap.vacancy.title, employmentType: ap.vacancy.employmentType, location: ap.vacancy.location, hireDate: fromYmd(hireDate), originalHireDate: fromYmd(hireDate), status: 'PENDING_ONBOARDING', managerId: ap.vacancy.hiringManagerId, createdById: a.userId },
      select: { id: true, employeeNo: true },
    });
    await tx.pwmApplication.update({ where: { id: ap.id }, data: { stage: 'HIRED', stageChangedAt: new Date(), hiredEmployeeId: e.id } });
    const hired = await tx.pwmApplication.count({ where: { vacancyId: ap.vacancyId, stage: 'HIRED' } });
    if (hired >= ap.vacancy.headcount) await tx.pwmVacancy.update({ where: { id: ap.vacancyId }, data: { status: 'FILLED' } });
    await pwmAudit(req, { action: 'CANDIDATE_HIRED', entity: 'PwmEmployee', entityId: e.id, after: { employeeNo: e.employeeNo, vacancy: ap.vacancy.reference, hireDate } }, tx);
    return e;
  });
  // ONB-01: a converted candidate starts onboarding with due dates counted from the start date.
  await startChecklist(emp.id, 'ONBOARDING', hireDate, a.userId).catch(() => undefined);
  return apiResponse.success(res, `Hired as ${emp.employeeNo}. Onboarding has started.`, emp, 201);
});

// POST /candidates/:id/anonymise (NDPA: erase a person's details but keep the statistics)
export const anonymiseCandidate = handle(async (req, res) => {
  const c = await prisma.pwmCandidate.findUnique({ where: { id: req.params.id }, include: { applications: { select: { stage: true } } } });
  if (!c) fail(404, 'Candidate not found.');
  if (c!.applications.some((x) => OPEN_STAGES.includes(x.stage))) fail(409, 'This candidate still has an open application. Close it first.');
  await anonymise(c!.id);
  await pwmAudit(req, { action: 'CANDIDATE_ANONYMISED', entity: 'PwmCandidate', entityId: c!.id, reason: str(req.body?.reason, 300) ?? undefined });
  return apiResponse.success(res, 'Anonymised.', null);
});

export const anonymise = async (candidateId: string): Promise<void> => {
  await prisma.pwmCandidate.update({ where: { id: candidateId }, data: { firstName: 'Anonymised', lastName: 'Candidate', email: `anonymised+${candidateId}@invalid.local`, phone: null, cvUrl: null, notes: null, source: null, anonymisedAt: new Date() } });
  await prisma.pwmApplication.updateMany({ where: { candidateId }, data: { notes: null, coverNote: null } });
};

/** Candidates not hired and untouched past the retention period are anonymised automatically. */
export const sweepCandidates = async (now = new Date()): Promise<number> => {
  const cfg = await getPwmConfig();
  const cutoff = new Date(now.getTime() - cfg.candidateRetentionDays * 86_400_000);
  const stale = await prisma.pwmCandidate.findMany({
    where: { anonymisedAt: null, createdAt: { lt: cutoff }, applications: { every: { stage: { in: ['REJECTED', 'WITHDRAWN'] }, stageChangedAt: { lt: cutoff } } } },
    select: { id: true }, take: 200,
  });
  for (const c of stale) await anonymise(c.id);
  if (stale.length) await pwmAudit(null, { action: 'CANDIDATES_RETENTION_SWEEP', entity: 'PwmCandidate', entityId: 'sweep', meta: { anonymised: stale.length }, userId: null });
  return stale.length;
};

// GET /recruitment/summary
export const recruitmentSummary = handle(async (req, res) => {
  const a = access(req);
  const where = deptScope(a);
  const [open, pending, active, hiredYear] = await Promise.all([
    prisma.pwmVacancy.count({ where: { ...where, status: 'OPEN' } }), prisma.pwmVacancy.count({ where: { ...where, status: 'PENDING_APPROVAL' } }),
    prisma.pwmApplication.count({ where: { stage: { in: OPEN_STAGES }, vacancy: where } }), prisma.pwmApplication.count({ where: { stage: 'HIRED', stageChangedAt: { gte: fromYmd(`${lagosYmd(new Date()).slice(0, 4)}-01-01`) }, vacancy: where } }),
  ]);
  return apiResponse.success(res, 'Summary.', { openVacancies: open, pendingApproval: pending, activeCandidates: active, hiredThisYear: hiredYear });
});

// ── Public careers endpoints (no login) ──────────────────────────────────────

// GET /pwm-public/vacancies
export const publicVacancies = async (_req: Request, res: Response) => {
  const today = fromYmd(lagosYmd(new Date()));
  const rows = await prisma.pwmVacancy.findMany({ where: { status: 'OPEN', isPublic: true, OR: [{ closingDate: null }, { closingDate: { gte: today } }] }, orderBy: { openedAt: 'desc' }, take: 100 });
  const depts = new Map((await prisma.pwmDepartment.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  return apiResponse.success(res, 'Open roles.', rows.map((v) => ({ id: v.id, reference: v.reference, title: v.title, department: v.departmentId ? depts.get(v.departmentId) ?? null : null, employmentType: v.employmentType, location: v.location, description: v.description, requirements: v.requirements, closingDate: v.closingDate ? dateOnly(v.closingDate) : null })));
};

// POST /pwm-public/vacancies/:id/apply
export const publicApply = async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const v = await prisma.pwmVacancy.findFirst({ where: { id: req.params.id, status: 'OPEN', isPublic: true }, select: { id: true } });
    if (!v) return apiResponse.error(res, 'This role is no longer open.', 404);
    if (b.consent !== true) return apiResponse.error(res, 'Please agree to us keeping your details for this application.', 400);
    const mail = email(b.email, 'Email');
    const first = reqStr(b.firstName, 'First name', 80); const last = reqStr(b.lastName, 'Last name', 80);
    if (!mail) return apiResponse.error(res, 'Email is required.', 400);
    const cv = str(b.cvUrl, 1000);
    if (cv && !(parseHrReference(cv) || /^https:\/\/res\.cloudinary\.com\//i.test(cv))) return apiResponse.error(res, 'The CV link must come from the upload form.', 400);
    const phoneRaw = str(b.phone, 40);
    const cand = await prisma.pwmCandidate.upsert({
      where: { email: mail },
      create: { firstName: first, lastName: last, email: mail, phone: phoneRaw ? normalisePhone(phoneRaw) : null, source: 'Careers page', cvUrl: cv, consentAt: new Date() },
      update: { consentAt: new Date(), ...(cv ? { cvUrl: cv } : {}) },
    });
    if (cand.anonymisedAt) { await prisma.pwmCandidate.update({ where: { id: cand.id }, data: { firstName: first, lastName: last, anonymisedAt: null } }); }
    const dupe = await prisma.pwmApplication.findUnique({ where: { vacancyId_candidateId: { vacancyId: v.id, candidateId: cand.id } } });
    if (dupe) return apiResponse.success(res, 'You have already applied for this role. Thank you.', null);
    const app = await prisma.pwmApplication.create({ data: { vacancyId: v.id, candidateId: cand.id, coverNote: str(b.coverNote, 3000) } });
    await pwmAudit(null, { action: 'APPLICATION_RECEIVED', entity: 'PwmVacancy', entityId: v.id, meta: { applicationId: app.id, source: 'careers page' }, userId: null });
    return apiResponse.success(res, 'Thank you. Your application has been received.', null, 201);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status) return apiResponse.error(res, (err as Error).message, status);
    throw err;
  }
};
