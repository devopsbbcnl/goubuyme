// PWM Phase 2: exit clearance, exit interviews, org chart.
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { CURRENT_STATUSES, can, fromYmd, addDays, lagosYmd } from '../../services/pwm/rules';
import { canSeeEmployee, employeeScope } from '../../services/pwm/people';
import { access, fail, handle, nameMap, oneOf, reqStr, str } from './common';

const REASONS = ['BETTER_PAY', 'CAREER_GROWTH', 'MANAGEMENT', 'WORK_ENVIRONMENT', 'RELOCATION', 'PERSONAL', 'STUDY', 'CONTRACT_ENDED', 'DISMISSAL', 'OTHER'] as const;

// GET /employees/:id/exit
export const getExit = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true, employmentEpisode: true, status: true, exitType: true, exitDate: true, finalWorkingDay: true, rehireEligible: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const emp = e!;
  const [clearance, interview] = await Promise.all([
    prisma.pwmClearance.findMany({ where: { employeeId: emp.id, episode: emp.employmentEpisode }, orderBy: { area: 'asc' } }),
    prisma.pwmExitInterview.findUnique({ where: { employeeId_episode: { employeeId: emp.id, episode: emp.employmentEpisode } } }),
  ]);
  const names = await nameMap([...clearance.map((c) => c.signedById), interview?.conductedById]);
  const mayRead = !interview || !interview.confidential || can(a, 'viewExitInterviews') || interview.conductedById === a.userId;
  return apiResponse.success(res, 'Exit.', {
    employee: emp,
    clearance: clearance.map((c) => ({ ...c, signedByName: c.signedById ? names.get(c.signedById) ?? null : null, canSign: canSignArea(a, c.area, emp.departmentId) })),
    interview: interview ? (mayRead ? { ...interview, conductedByName: interview.conductedById ? names.get(interview.conductedById) ?? null : null } : { exists: true, confidential: true }) : null,
    canRecordInterview: can(a, 'manageChecklists'),
  });
});

const canSignArea = (a: ReturnType<typeof access>, area: string, departmentId: string | null): boolean => {
  const hr = a.level === 'SUPER' || a.level === 'HR_ADMIN' || a.level === 'HR_OFFICER';
  switch (area) {
    case 'HR': return a.level === 'SUPER' || a.level === 'HR_ADMIN';
    case 'FINANCE': return a.level === 'SUPER' || a.level === 'FINANCE';
    case 'DEPARTMENT': return hr || (a.level === 'DEPARTMENT_HEAD' && !!departmentId && a.headedDepartmentIds.includes(departmentId));
    default: return hr; // IT and ASSETS are signed by HR on the owner's confirmation until those roles have their own logins
  }
};

// POST /clearance/:id/sign { status: CLEARED|BLOCKED|PENDING, note }
export const signClearance = handle(async (req, res) => {
  const a = access(req);
  const c = await prisma.pwmClearance.findUnique({ where: { id: req.params.id } });
  if (!c) fail(404, 'Clearance item not found.');
  const emp = await prisma.pwmEmployee.findUnique({ where: { id: c!.employeeId }, select: { id: true, departmentId: true } });
  if (!emp || !canSeeEmployee(a, emp)) fail(404, 'Employee not found.');
  if (a.employeeId === emp!.id) fail(403, 'You cannot sign off your own clearance.');
  if (!canSignArea(a, c!.area, emp!.departmentId)) fail(403, 'Forbidden. This area is signed by someone else.');
  const status = oneOf(req.body?.status, ['CLEARED', 'BLOCKED', 'PENDING'] as const, 'Status');
  const note = str(req.body?.note, 500);
  if (status === 'CLEARED' && c!.area === 'ASSETS') {
    const held = await prisma.pwmAssetAssignment.findMany({ where: { employeeId: emp!.id, status: 'ACTIVE' }, include: { asset: { select: { tag: true, name: true } } } });
    if (held.length) fail(409, `Still outstanding: ${held.map((h) => `${h.asset.name} (${h.asset.tag})`).join(', ')}. Record the return, or an approved write-off or charge, first.`);
  }
  if (status === 'BLOCKED' && !note) fail(400, 'Say what is outstanding.');
  const u = await prisma.pwmClearance.update({ where: { id: c!.id }, data: { status, note, signedById: status === 'PENDING' ? null : a.userId, signedAt: status === 'PENDING' ? null : new Date() } });
  await pwmAudit(req, { action: `CLEARANCE_${status}`, entity: 'PwmEmployee', entityId: emp!.id, reason: note ?? undefined, meta: { area: c!.area } });
  return apiResponse.success(res, 'Recorded.', u);
});

// PUT /employees/:id/exit-interview { reasonCategory, wouldRecommend, answers, confidential }
export const saveExitInterview = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true, employmentEpisode: true, status: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  if (!['NOTICE_PERIOD', 'RESIGNED', 'TERMINATED', 'ARCHIVED'].includes(e!.status)) fail(409, 'Exit interviews are held once someone is leaving.');
  const answers = (Array.isArray(b.answers) ? b.answers : []).slice(0, 20).map((x: { question?: unknown; answer?: unknown }) => ({ question: String(x.question ?? '').slice(0, 300), answer: String(x.answer ?? '').slice(0, 3000) })).filter((x: { question: string }) => x.question);
  const data = { reasonCategory: b.reasonCategory ? oneOf(b.reasonCategory, REASONS, 'Reason') : null, wouldRecommend: typeof b.wouldRecommend === 'boolean' ? b.wouldRecommend : null, answers, confidential: b.confidential !== false, conductedById: a.userId, conductedAt: new Date() };
  const row = await prisma.pwmExitInterview.upsert({ where: { employeeId_episode: { employeeId: e!.id, episode: e!.employmentEpisode } }, create: { employeeId: e!.id, episode: e!.employmentEpisode, ...data }, update: data });
  await pwmAudit(req, { action: 'EXIT_INTERVIEW_RECORDED', entity: 'PwmEmployee', entityId: e!.id, meta: { confidential: data.confidential } });
  return apiResponse.success(res, 'Saved.', { id: row.id });
});

// GET /reports/exit-reasons : counts only, never individual answers
export const exitReasons = handle(async (_req, res) => {
  const since = fromYmd(addDays(lagosYmd(new Date()), -365));
  const rows = await prisma.pwmExitInterview.groupBy({ by: ['reasonCategory'], where: { conductedAt: { gte: since } }, _count: true });
  const total = rows.reduce((s, r) => s + r._count, 0);
  return apiResponse.success(res, 'Exit reasons.', { total, reasons: rows.map((r) => ({ reason: r.reasonCategory ?? 'NOT_GIVEN', count: r._count })).sort((x, y) => y.count - x.count) });
});

// GET /org-chart : who reports to whom, current employees only
export const orgChart = handle(async (req, res) => {
  const a = access(req);
  const rows = await prisma.pwmEmployee.findMany({
    where: { AND: [employeeScope(a).OR ? {} : employeeScope(a), { status: { in: [...CURRENT_STATUSES] } }] },
    select: { id: true, firstName: true, lastName: true, jobTitle: true, managerId: true, photoUrl: true, status: true, department: { select: { id: true, name: true } } }, orderBy: { lastName: 'asc' }, take: 3000,
  });
  return apiResponse.success(res, 'Org chart.', rows);
});
