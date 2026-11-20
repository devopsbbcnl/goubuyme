// PWM Phase 4: employee relations (grievances and disciplinary cases), recognition and ER reporting (PRD 10.17).
// Case records are visible only to the people named on the case. Super admins have no routine access: break-glass only.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig, nextNumber } from '../../services/pwm/settings';
import { addDays, addMonths, can, dateOnly, fromYmd, fullName, lagosYmd, checkTransition } from '../../services/pwm/rules';
import { approverUserIds, canSeeEmployee, hrAdminUserIds, managementUserIds } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { access, fail, handle, nameMap, oneOf, reqStr, str, ymd } from './common';

const STAGES = ['INTAKE', 'INVESTIGATION', 'HEARING', 'OUTCOME', 'APPEAL', 'CLOSED'] as const;
const DISCIPLINARY_OUTCOMES = ['NO_ACTION', 'VERBAL_WARNING', 'WRITTEN_WARNING', 'FINAL_WARNING', 'SUSPENSION', 'TERMINATION'] as const;
const GRIEVANCE_OUTCOMES = ['UPHELD', 'PARTLY_UPHELD', 'NOT_UPHELD', 'NO_ACTION'] as const;
const WARNINGS = ['VERBAL_WARNING', 'WRITTEN_WARNING', 'FINAL_WARNING'];

/** A named handler who has not recused. Super admins need an unexpired break-glass entry. */
const loadCase = async (a: ReturnType<typeof access>, id: string) => {
  const c = await prisma.pwmCase.findUnique({ where: { id }, include: { handlers: true, employee: { select: { id: true, userId: true, employeeNo: true, firstName: true, lastName: true, jobTitle: true, departmentId: true, status: true, department: { select: { name: true } } } } } });
  if (!c) return fail(404, 'Case not found.') as never;
  const handler = c.handlers.find((h) => h.userId === a.userId && !h.recusedAt);
  let breakGlass = false;
  if (!handler && a.level === 'SUPER') breakGlass = !!(await prisma.pwmCaseEvent.findFirst({ where: { caseId: id, kind: 'BREAK_GLASS', byUserId: a.userId, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } } }));
  if (!handler && !breakGlass) fail(404, 'Case not found.');
  return { c, handler, breakGlass };
};

const spent = (c: { warningExpiresAt: Date | null }, today: string) => !!c.warningExpiresAt && dateOnly(c.warningExpiresAt) < today;

// GET /cases : only the cases I am named on
export const listCases = handle(async (req, res) => {
  const a = access(req);
  const today = lagosYmd(new Date());
  const rows = await prisma.pwmCase.findMany({ where: { handlers: { some: { userId: a.userId, recusedAt: null } } }, orderBy: { createdAt: 'desc' }, take: 200, include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } }, handlers: { select: { userId: true, role: true } } } });
  return apiResponse.success(res, 'Cases.', rows.map((c) => ({ id: c.id, reference: c.reference, type: c.type, category: c.category, severity: c.severity, stage: c.stage, outcome: c.outcome, employee: { id: c.employee.id, name: fullName(c.employee), employeeNo: c.employee.employeeNo }, responseDue: c.responseDue, hearingAt: c.hearingAt, appealDue: c.appealDue, createdAt: c.createdAt, overdue: c.stage !== 'CLOSED' && !!c.responseDue && dateOnly(c.responseDue) < today && c.stage === 'INTAKE', handlers: c.handlers.length })));
});

// POST /cases { type, employeeId, category, severity, summary, handlerUserIds }
export const createCase = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const type = oneOf(b.type, ['GRIEVANCE', 'DISCIPLINARY'] as const, 'Type');
  const e = await prisma.pwmEmployee.findUnique({ where: { id: reqStr(b.employeeId, 'Employee', 60) }, select: { id: true, userId: true, departmentId: true, firstName: true, lastName: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const extra = [...new Set<string>((Array.isArray(b.handlerUserIds) ? b.handlerUserIds : []).map(String))].filter((u) => u !== a.userId);
  if (e!.userId && (extra.includes(e!.userId) || e!.userId === a.userId)) fail(409, 'Someone cannot handle a case about themselves.');
  const year = new Date().getFullYear();
  const reference = `${type === 'GRIEVANCE' ? 'GRV' : 'DSC'}-${year}-${String(await nextNumber(`case:${year}`)).padStart(4, '0')}`;
  const c = await prisma.pwmCase.create({
    data: { reference, type, employeeId: e!.id, category: reqStr(b.category, 'Category', 80), severity: oneOf(b.severity ?? 'MEDIUM', ['LOW', 'MEDIUM', 'HIGH'] as const, 'Severity'), summary: reqStr(b.summary, 'Summary', 2000), raisedByUserId: a.userId, handlers: { create: [{ userId: a.userId, role: 'HANDLER', addedById: a.userId }, ...extra.map((u) => ({ userId: u, role: 'HANDLER', addedById: a.userId }))] }, events: { create: { kind: 'STAGE', text: 'Case opened.', byUserId: a.userId } } },
    select: { id: true, reference: true },
  });
  // The audit line carries the reference and type only; what the case is about stays inside the case.
  await pwmAudit(req, { action: 'CASE_OPENED', entity: 'PwmCase', entityId: c.id, meta: { reference, type } });
  await notifyPwm(extra, { title: `You have been named on case ${reference}`, body: 'Open Employee Relations to see it.', link: '/pwm/cases' });
  return apiResponse.success(res, `Case ${reference} opened.`, c, 201);
});

// GET /cases/:id : every view is logged (ERL-03)
export const getCase = handle(async (req, res) => {
  const a = access(req);
  const { c, breakGlass } = await loadCase(a, req.params.id);
  const events = await prisma.pwmCaseEvent.findMany({ where: { caseId: c.id }, orderBy: { createdAt: 'asc' } });
  const names = await nameMap([...events.map((e) => e.byUserId), ...c.handlers.map((h) => h.userId)]);
  await pwmAudit(req, { action: 'CASE_VIEWED', entity: 'PwmCase', entityId: c.id, meta: { reference: c.reference, breakGlass } });
  const today = lagosYmd(new Date());
  return apiResponse.success(res, 'Case.', {
    ...c, employee: { ...c.employee, name: fullName(c.employee) }, warningSpent: spent(c, today), breakGlass,
    handlers: c.handlers.map((h) => ({ ...h, name: names.get(h.userId) ?? 'Unknown' })),
    events: events.map((e) => ({ ...e, byName: e.byUserId ? names.get(e.byUserId) ?? null : null })),
    myRole: c.handlers.find((h) => h.userId === a.userId && !h.recusedAt)?.role ?? null,
  });
});

// POST /cases/:id/break-glass { reason } : super admin emergency access, 24 hours, alerts HR and management
export const breakGlass = handle(async (req, res) => {
  const a = access(req);
  if (a.level !== 'SUPER') fail(403, 'Forbidden. Insufficient permissions.');
  const reason = reqStr(req.body?.reason, 'Reason', 400);
  if (reason.length < 15) fail(400, 'Give a full reason. It is recorded and shown to HR and management.');
  const c = await prisma.pwmCase.findUnique({ where: { id: req.params.id }, select: { id: true, reference: true } });
  if (!c) fail(404, 'Case not found.');
  await prisma.pwmCaseEvent.create({ data: { caseId: c!.id, kind: 'BREAK_GLASS', text: `Emergency access: ${reason}`, byUserId: a.userId } });
  await pwmAudit(req, { action: 'CASE_BREAK_GLASS', entity: 'PwmCase', entityId: c!.id, reason, meta: { reference: c!.reference } });
  await notifyPwm([...(await hrAdminUserIds()), ...(await managementUserIds())].filter((id) => id !== a.userId), { title: `Emergency access to case ${c!.reference}`, body: `A super admin opened this case for 24 hours. Reason given: ${reason}`, link: '/pwm/activity' });
  return apiResponse.success(res, 'Access granted for 24 hours. HR and management have been told.', null);
});

// POST /cases/:id/handlers { userId, role }
export const addHandler = handle(async (req, res) => {
  const a = access(req);
  const { c } = await loadCase(a, req.params.id);
  const userId = reqStr(req.body?.userId, 'Person', 60);
  if (c.employee.userId === userId) fail(409, 'Someone cannot handle a case about themselves.');
  const role = oneOf(req.body?.role ?? 'HANDLER', ['HANDLER', 'INVESTIGATOR', 'PANEL'] as const, 'Role');
  await prisma.pwmCaseHandler.upsert({ where: { caseId_userId: { caseId: c.id, userId } }, create: { caseId: c.id, userId, role, addedById: a.userId }, update: { role, recusedAt: null, recusalReason: null } });
  await pwmAudit(req, { action: 'CASE_HANDLER_ADDED', entity: 'PwmCase', entityId: c.id, meta: { userId, role } });
  await notifyPwm([userId], { title: `You have been named on case ${c.reference}`, body: 'Open Employee Relations to see it.', link: '/pwm/cases' });
  return apiResponse.success(res, 'Added.', null);
});

// POST /cases/:id/recuse { reason } : conflict of interest (ERL-03)
export const recuse = handle(async (req, res) => {
  const a = access(req);
  const { c, handler } = await loadCase(a, req.params.id);
  if (!handler) fail(403, 'Only a named handler can recuse.');
  const reason = reqStr(req.body?.reason, 'Reason', 300);
  const remaining = c.handlers.filter((h) => !h.recusedAt && h.userId !== a.userId).length;
  if (!remaining) fail(409, 'You are the only handler. Add someone else before recusing.');
  await prisma.pwmCaseHandler.update({ where: { id: handler!.id }, data: { recusedAt: new Date(), recusalReason: reason } });
  await prisma.pwmCaseEvent.create({ data: { caseId: c.id, kind: 'STAGE', text: 'A handler recused themselves (conflict of interest).', byUserId: a.userId } });
  await pwmAudit(req, { action: 'CASE_RECUSAL', entity: 'PwmCase', entityId: c.id, reason });
  return apiResponse.success(res, 'You no longer have access to this case.', null);
});

// POST /cases/:id/events { kind, text, fileUrl }
export const addCaseEvent = handle(async (req, res) => {
  const a = access(req);
  const { c } = await loadCase(a, req.params.id);
  if (c.stage === 'CLOSED') fail(409, 'This case is closed.');
  const url = str(req.body?.fileUrl, 1000);
  if (url && !/^https:\/\//i.test(url)) fail(400, 'The file must be uploaded first.');
  const e = await prisma.pwmCaseEvent.create({ data: { caseId: c.id, kind: oneOf(req.body?.kind ?? 'NOTE', ['NOTE', 'EVIDENCE', 'RESPONSE'] as const, 'Kind'), text: reqStr(req.body?.text, 'Note', 4000), fileUrl: url, byUserId: a.userId } });
  await pwmAudit(req, { action: 'CASE_EVENT_ADDED', entity: 'PwmCase', entityId: c.id, meta: { kind: e.kind } });
  return apiResponse.success(res, 'Added to the case file.', e, 201);
});

// POST /cases/:id/query { text, responseDays } : disciplinary query, employee must respond by the deadline
export const issueQuery = handle(async (req, res) => {
  const a = access(req);
  const { c } = await loadCase(a, req.params.id);
  if (c.type !== 'DISCIPLINARY') fail(409, 'A query is part of a disciplinary case.');
  if (c.stage === 'CLOSED') fail(409, 'This case is closed.');
  const days = Math.min(30, Math.max(1, Math.floor(Number(req.body?.responseDays ?? 3)) || 3));
  const due = addDays(lagosYmd(new Date()), days);
  await prisma.pwmCase.update({ where: { id: c.id }, data: { responseDue: fromYmd(due), stage: c.stage === 'INTAKE' ? 'INTAKE' : c.stage } });
  await prisma.pwmCaseEvent.create({ data: { caseId: c.id, kind: 'QUERY', text: reqStr(req.body?.text, 'Query', 4000), byUserId: a.userId } });
  await pwmAudit(req, { action: 'CASE_QUERY_ISSUED', entity: 'PwmCase', entityId: c.id, meta: { responseDue: due } });
  await notifyPwm([c.employee.userId], { title: 'You have been sent a query', body: `Please respond by ${due}. Open My HR → My cases.`, link: '/my-hr/cases' });
  return apiResponse.success(res, `Query recorded. The employee must respond by ${due}.`, { responseDue: due });
});

// POST /cases/:id/stage { stage, hearingAt, minutes }
export const setStage = handle(async (req, res) => {
  const a = access(req);
  const { c } = await loadCase(a, req.params.id);
  const stage = oneOf(req.body?.stage, STAGES, 'Stage');
  if (stage === 'CLOSED') fail(400, 'Use Close to finish a case.');
  if (stage === 'OUTCOME' || stage === 'APPEAL') fail(400, 'Record the outcome to move there.');
  if (c.stage === 'CLOSED') fail(409, 'This case is closed.');
  const data: Prisma.PwmCaseUncheckedUpdateInput = { stage };
  let text = `Moved to ${stage.toLowerCase()}.`;
  if (stage === 'HEARING') {
    const when = new Date(String(req.body?.hearingAt));
    if (Number.isNaN(when.getTime())) fail(400, 'Set the hearing date and time.');
    data.hearingAt = when; text = `Hearing set for ${when.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}.`;
    await notifyPwm([c.employee.userId, ...c.handlers.filter((h) => !h.recusedAt).map((h) => h.userId)], { title: `Hearing scheduled: ${c.reference}`, body: when.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }), link: '/pwm/cases' });
  }
  await prisma.pwmCase.update({ where: { id: c.id }, data });
  await prisma.pwmCaseEvent.create({ data: { caseId: c.id, kind: stage === 'HEARING' ? 'HEARING' : 'STAGE', text: `${text}${str(req.body?.minutes, 4000) ? ` Minutes: ${str(req.body?.minutes, 4000)}` : ''}`, byUserId: a.userId } });
  await pwmAudit(req, { action: 'CASE_STAGE', entity: 'PwmCase', entityId: c.id, meta: { stage } });
  return apiResponse.success(res, 'Updated.', null);
});

// POST /cases/:id/outcome { outcome, note }
export const recordOutcome = handle(async (req, res) => {
  const a = access(req);
  const cfg = await getPwmConfig();
  const { c } = await loadCase(a, req.params.id);
  if (!['INVESTIGATION', 'HEARING', 'INTAKE'].includes(c.stage)) fail(409, 'An outcome is already recorded.');
  const outcome = oneOf(req.body?.outcome, (c.type === 'DISCIPLINARY' ? DISCIPLINARY_OUTCOMES : GRIEVANCE_OUTCOMES) as readonly string[], 'Outcome');
  const note = reqStr(req.body?.note, 'Reasoning', 4000);
  const today = lagosYmd(new Date());
  const data: Prisma.PwmCaseUncheckedUpdateInput = { outcome, outcomeNote: note, stage: 'OUTCOME', appealDue: fromYmd(addDays(today, 7)), ...(WARNINGS.includes(outcome) ? { warningExpiresAt: fromYmd(addMonths(today, cfg.warningValidityMonths)) } : {}) };
  await prisma.pwmCase.update({ where: { id: c.id }, data });
  await prisma.pwmCaseEvent.create({ data: { caseId: c.id, kind: 'OUTCOME', text: `Outcome: ${outcome.replace(/_/g, ' ').toLowerCase()}. ${note}`, byUserId: a.userId } });
  let message = 'Outcome recorded. The employee has seven days to appeal.';
  // Suspension or termination never change status here: they become an approval request for management (ERL-06, AC-ERL-02).
  if (outcome === 'SUSPENSION' || outcome === 'TERMINATION') {
    const to = outcome === 'SUSPENSION' ? 'SUSPENDED' : 'TERMINATED';
    const check = checkTransition(c.employee.status, to);
    if (check.ok) {
      await prisma.pwmStatusChange.create({ data: { employeeId: c.employeeId, fromStatus: c.employee.status, toStatus: to, effectiveDate: fromYmd(today), reason: `Disciplinary outcome (case ${c.reference})`, requestedById: a.userId, approvalStatus: 'PENDING' } });
      await notifyPwm((await approverUserIds()).filter((id) => id !== a.userId), { title: `Status change awaiting approval (case ${c.reference})`, body: `${outcome === 'TERMINATION' ? 'Termination' : 'Suspension'} recommended. Details are in the case file for the named handlers.`, link: '/pwm/approvals' });
      message = `Outcome recorded. A ${to === 'TERMINATED' ? 'termination' : 'suspension'} request has gone to management; the employee's status does not change until it is approved.`;
    } else message = `Outcome recorded, but the status change is not allowed from the employee's current status (${check.reason}).`;
  }
  await notifyPwm([c.employee.userId], { title: `An outcome has been recorded: ${c.reference}`, body: 'Open My HR → My cases to read it and see how to appeal.', link: '/my-hr/cases' });
  await pwmAudit(req, { action: 'CASE_OUTCOME', entity: 'PwmCase', entityId: c.id, meta: { reference: c.reference, outcome } });
  return apiResponse.success(res, message, null);
});

// POST /cases/:id/close
export const closeCase = handle(async (req, res) => {
  const a = access(req);
  const { c } = await loadCase(a, req.params.id);
  if (c.stage === 'CLOSED') fail(409, 'Already closed.');
  if (!c.outcome) fail(409, 'Record an outcome before closing.');
  await prisma.pwmCase.update({ where: { id: c.id }, data: { stage: 'CLOSED', closedAt: new Date() } });
  await prisma.pwmCaseEvent.create({ data: { caseId: c.id, kind: 'STAGE', text: 'Case closed.', byUserId: a.userId } });
  await pwmAudit(req, { action: 'CASE_CLOSED', entity: 'PwmCase', entityId: c.id, meta: { reference: c.reference } });
  return apiResponse.success(res, 'Closed.', null);
});

// GET /employees/:id/warnings : live and spent warnings, outcome type only (HR administrators and executives)
export const employeeWarnings = handle(async (req, res) => {
  const a = access(req);
  if (!(a.level === 'HR_ADMIN' || a.level === 'EXECUTIVE')) fail(403, 'Forbidden. Insufficient permissions.');
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const rows = await prisma.pwmCase.findMany({ where: { employeeId: e!.id, outcome: { in: WARNINGS } }, orderBy: { createdAt: 'desc' }, select: { reference: true, outcome: true, warningExpiresAt: true, createdAt: true } });
  const today = lagosYmd(new Date());
  await pwmAudit(req, { action: 'WARNINGS_VIEWED', entity: 'PwmEmployee', entityId: e!.id });
  return apiResponse.success(res, 'Warnings.', rows.map((r) => ({ ...r, spent: spent(r, today) })));
});

// GET /er/report : anonymised counts for management (ERL-09)
export const erReport = handle(async (_req, res) => {
  const since = fromYmd(addDays(lagosYmd(new Date()), -365));
  const rows = await prisma.pwmCase.findMany({ where: { createdAt: { gte: since } }, select: { type: true, category: true, severity: true, outcome: true, stage: true, createdAt: true, closedAt: true, employee: { select: { department: { select: { name: true } } } } } });
  const tally = (key: (r: (typeof rows)[number]) => string | null) => Object.entries(rows.reduce<Record<string, number>>((m, r) => { const k = key(r); if (k) m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count);
  const closed = rows.filter((r) => r.closedAt);
  // Departments with fewer than five cases are folded together so one person cannot be identified.
  const byDept = tally((r) => r.employee.department?.name ?? 'No department');
  const small = byDept.filter((d) => d.count < 5).reduce((s, d) => s + d.count, 0);
  return apiResponse.success(res, 'ER report.', {
    total: rows.length, open: rows.filter((r) => r.stage !== 'CLOSED').length, byType: tally((r) => r.type), byCategory: tally((r) => r.category), byOutcome: tally((r) => r.outcome), bySeverity: tally((r) => r.severity),
    byDepartment: [...byDept.filter((d) => d.count >= 5), ...(small ? [{ name: 'Other departments (fewer than 5 each)', count: small }] : [])],
    averageDaysToClose: closed.length ? Math.round(closed.reduce((s, r) => s + ((r.closedAt as Date).getTime() - r.createdAt.getTime()) / 86_400_000, 0) / closed.length) : null,
  });
});

// ── Recognition ──────────────────────────────────────────────────────────────

// POST /employees/:id/recognition { kind, title, citation, date, announce }
export const giveRecognition = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true, firstName: true, lastName: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  if (e!.userId === a.userId) fail(403, 'You cannot recognise yourself.');
  const r = await prisma.pwmRecognition.create({ data: { employeeId: e!.id, kind: oneOf(b.kind ?? 'COMMENDATION', ['AWARD', 'COMMENDATION', 'MILESTONE'] as const, 'Kind'), title: reqStr(b.title, 'Title', 160), citation: str(b.citation, 1000), date: fromYmd(ymd(b.date, 'Date') ?? lagosYmd(new Date())), givenById: a.userId, announced: !!b.announce } });
  if (b.announce) await prisma.pwmAnnouncement.create({ data: { title: `Well done, ${fullName(e!)}`, body: `${r.title}${r.citation ? `: ${r.citation}` : ''}`, createdById: a.userId } });
  await notifyPwm([e!.userId], { title: `Recognition: ${r.title}`, body: r.citation ?? 'Congratulations.', link: '/my-hr' });
  await pwmAudit(req, { action: 'RECOGNITION_GIVEN', entity: 'PwmEmployee', entityId: e!.id, after: { title: r.title, kind: r.kind } });
  return apiResponse.success(res, 'Recorded.', r, 201);
});
export const employeeRecognition = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  return apiResponse.success(res, 'Recognition.', { items: await prisma.pwmRecognition.findMany({ where: { employeeId: e!.id }, orderBy: { date: 'desc' } }), canGive: can(a, 'manageRecognition') });
});

