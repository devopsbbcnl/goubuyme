// My HR, Phase 3: leave, attendance, approvals for managers, performance reviews and objectives.
import { Prisma } from '@prisma/client';
import { RequestHandler, Response } from 'express';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { addDays, dateOnly, fromYmd, fullName, lagosYmd } from '../../services/pwm/rules';
import { balanceOf } from '../../services/pwm/timeRules';
import { LeaveError, cancelLeave, decideLeave, ensureBalance, previewLeave, submitLeave } from '../../services/pwm/leave';
import { AttendanceError, clockIn, clockOut, decideCorrection, decideOvertime, requestCorrection, requestOvertime } from '../../services/pwm/attendance';
import { MyHrRequest } from '../../middleware/myhr.middleware';
import type { PwmRequest } from '../../middleware/pwm.middleware';
import { notifyPwm } from '../../services/pwm/notify';
import { HttpError, fail, int, oneOf, reqStr, reqYmd, str, ymd } from './common';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const my = (fn: (req: MyHrRequest, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => {
  fn(req as MyHrRequest, res).catch((err) => {
    if (err instanceof HttpError || err instanceof LeaveError || err instanceof AttendanceError) return apiResponse.error(res, err.message, (err as { status: number }).status);
    next(err);
  });
};
const me = (r: MyHrRequest) => r.my!;
const audit = (req: MyHrRequest) => req as unknown as PwmRequest;

// ── Leave ────────────────────────────────────────────────────────────────────

// GET /my-hr/leave
export const myLeave = my(async (req, res) => {
  const m = me(req);
  const year = new Date().getFullYear();
  const [types, requests] = await Promise.all([
    prisma.pwmLeaveType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.pwmLeaveRequest.findMany({ where: { employeeId: m.employeeId }, orderBy: { startDate: 'desc' }, take: 60, include: { type: { select: { name: true } }, approvals: { orderBy: { step: 'asc' } } } }),
  ]);
  const balances = await Promise.all(types.map(async (t) => { const b = await ensureBalance(m.employeeId, t.id, year); return { typeId: t.id, name: t.name, entitled: num(b.entitled), carriedOver: num(b.carriedOver), adjusted: num(b.adjusted), used: num(b.used), available: balanceOf({ entitled: num(b.entitled), carriedOver: num(b.carriedOver), adjusted: num(b.adjusted), used: num(b.used) }), allowHalfDay: t.allowHalfDay, docAfterDays: t.docAfterDays, paid: t.paid }; }));
  return apiResponse.success(res, 'Leave.', { year, balances, requests: requests.map((r) => ({ id: r.id, type: r.type.name, status: r.status, startDate: r.startDate, endDate: r.endDate, days: num(r.days), reason: r.reason, waitingOn: r.status === 'PENDING' ? r.approvals.find((a) => a.step === r.currentStep)?.role ?? null : null, canCancel: ['PENDING', 'APPROVED'].includes(r.status) && !(r.status === 'APPROVED' && dateOnly(r.startDate) <= lagosYmd(new Date())) })) });
});

const leaveBody = (req: MyHrRequest) => ({ employeeId: me(req).employeeId, typeId: reqStr(req.body?.typeId, 'Leave type', 60), start: reqYmd(req.body?.start, 'Start date'), end: reqYmd(req.body?.end, 'End date'), startHalf: !!req.body?.startHalf, endHalf: !!req.body?.endHalf, reason: str(req.body?.reason, 500), docUrl: str(req.body?.docUrl, 1000), handoverEmployeeId: str(req.body?.handoverEmployeeId, 60) });

// POST /my-hr/leave/preview : days, balance, clashes and who will approve, before submitting (LEV-02)
export const previewMyLeave = my(async (req, res) => apiResponse.success(res, 'Preview.', await previewLeave(leaveBody(req))));

export const submitMyLeave = my(async (req, res) => {
  const r = await submitLeave({ ...leaveBody(req), requestedById: me(req).userId });
  return apiResponse.success(res, `Request sent (${r.days} day${r.days === 1 ? '' : 's'}).`, r, 201);
});

export const cancelMyLeave = my(async (req, res) => {
  await cancelLeave(req.params.id, { userId: me(req).userId, isHr: false, employeeId: me(req).employeeId }, str(req.body?.reason, 300));
  return apiResponse.success(res, 'Cancelled.', null);
});

// ── Attendance ───────────────────────────────────────────────────────────────

// GET /my-hr/attendance
export const myAttendance = my(async (req, res) => {
  const m = me(req);
  const today = lagosYmd(new Date());
  const [rows, corrections, overtime] = await Promise.all([
    prisma.pwmAttendance.findMany({ where: { employeeId: m.employeeId, date: { gte: fromYmd(addDays(today, -45)) } }, orderBy: { date: 'desc' } }),
    prisma.pwmAttendanceCorrection.findMany({ where: { employeeId: m.employeeId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.pwmOvertime.findMany({ where: { employeeId: m.employeeId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  return apiResponse.success(res, 'Attendance.', { today: rows.find((r) => dateOnly(r.date) === today) ?? null, records: rows, corrections, overtime: overtime.map((o) => ({ ...o, hours: num(o.hours) })) });
});
export const doClockIn = my(async (req, res) => { const r = await clockIn(me(req).employeeId); return apiResponse.success(res, r.status === 'LATE' ? `Clocked in, ${r.minutesLate} minutes late.` : 'Clocked in.', r); });
export const doClockOut = my(async (req, res) => apiResponse.success(res, 'Clocked out.', await clockOut(me(req).employeeId)));

// POST /my-hr/attendance/:id/explain { text }
export const explainAbsence = my(async (req, res) => {
  const rec = await prisma.pwmAttendance.findUnique({ where: { id: req.params.id } });
  if (!rec || rec.employeeId !== me(req).employeeId || rec.status !== 'ABSENT') fail(404, 'No absence found.');
  await prisma.pwmAttendance.update({ where: { id: rec!.id }, data: { explanation: reqStr(req.body?.text, 'Explanation', 500) } });
  return apiResponse.success(res, 'Sent to your supervisor.', null);
});
export const myCorrection = my(async (req, res) => {
  const c = await requestCorrection(me(req).employeeId, reqYmd(req.body?.date, 'Date'), str(req.body?.clockIn, 5), str(req.body?.clockOut, 5), reqStr(req.body?.reason, 'Reason', 300), me(req).userId);
  return apiResponse.success(res, 'Sent for approval. The original times stay on record.', c, 201);
});
export const myOvertime = my(async (req, res) => {
  const o = await requestOvertime(me(req).employeeId, reqYmd(req.body?.date, 'Date'), Number(req.body?.hours), reqStr(req.body?.reason, 'Reason', 300), me(req).userId);
  return apiResponse.success(res, 'Sent for approval.', o, 201);
});

// ── Approvals waiting for me (supervisors and department heads) ──────────────

export const myApprovals = my(async (req, res) => {
  const uid = me(req).userId;
  const [leave, corrections, overtime] = await Promise.all([
    prisma.pwmLeaveApproval.findMany({ where: { approverUserId: uid, decision: null, request: { status: 'PENDING' } }, include: { request: { include: { type: { select: { name: true } }, employee: { select: { firstName: true, lastName: true, employeeNo: true } } } } } }),
    prisma.pwmAttendanceCorrection.findMany({ where: { approverUserId: uid, status: 'PENDING' }, include: { employee: { select: { firstName: true, lastName: true } } } }),
    prisma.pwmOvertime.findMany({ where: { approverUserId: uid, status: 'PENDING' }, include: { employee: { select: { firstName: true, lastName: true } } } }),
  ]);
  const mineNow = leave.filter((a) => a.step === a.request.currentStep);
  // Show who else is away, so the approver can see cover (US-LEV-02).
  const withClashes = await Promise.all(mineNow.map(async (a) => {
    const e = await prisma.pwmEmployee.findUnique({ where: { id: a.request.employeeId }, select: { departmentId: true } });
    const clashes = e?.departmentId ? await prisma.pwmLeaveRequest.findMany({ where: { id: { not: a.request.id }, status: 'APPROVED', startDate: { lte: a.request.endDate }, endDate: { gte: a.request.startDate }, employee: { departmentId: e.departmentId } }, select: { startDate: true, endDate: true, employee: { select: { firstName: true, lastName: true } } }, take: 10 }) : [];
    return { id: a.request.id, employee: fullName(a.request.employee), type: a.request.type.name, startDate: a.request.startDate, endDate: a.request.endDate, days: num(a.request.days), reason: a.request.reason, docUrl: a.request.docUrl, clashes: clashes.map((c) => ({ name: fullName(c.employee), start: dateOnly(c.startDate), end: dateOnly(c.endDate) })) };
  }));
  return apiResponse.success(res, 'Approvals.', {
    leave: withClashes,
    corrections: corrections.map((c) => ({ id: c.id, employee: fullName(c.employee), date: c.date, originalIn: c.originalIn, originalOut: c.originalOut, requestedIn: c.requestedIn, requestedOut: c.requestedOut, reason: c.reason })),
    overtime: overtime.map((o) => ({ id: o.id, employee: fullName(o.employee), date: o.date, hours: num(o.hours), reason: o.reason })),
  });
});

export const decideMy = (kind: 'leave' | 'correction' | 'overtime') => my(async (req, res) => {
  const actor = { userId: me(req).userId, isHr: false };
  const approve = req.body?.approve === true; const note = str(req.body?.note, 500);
  if (kind === 'leave') { const s = await decideLeave(req.params.id, actor, approve, note); return apiResponse.success(res, s === 'APPROVED' ? 'Approved.' : s === 'REJECTED' ? 'Declined.' : 'Approved. It moves to the next approver.', { status: s }); }
  if (kind === 'correction') await decideCorrection(req.params.id, actor, approve, note); else await decideOvertime(req.params.id, actor, approve, note);
  return apiResponse.success(res, approve ? 'Approved.' : 'Declined.', null);
});

// GET /my-hr/calendar?from&to : holidays, my leave and who in my department is away
export const myCalendar = my(async (req, res) => {
  const m = me(req);
  const from = ymd(req.query.from, 'From') ?? lagosYmd(new Date());
  const to = ymd(req.query.to, 'To') ?? addDays(from, 30);
  if (to < from || (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 > 120) fail(400, 'Choose a range of up to 120 days.');
  const [hol, leave, cycles] = await Promise.all([
    prisma.pwmHoliday.findMany({ where: { date: { gte: fromYmd(from), lte: fromYmd(to) } } }),
    prisma.pwmLeaveRequest.findMany({ where: { status: 'APPROVED', startDate: { lte: fromYmd(to) }, endDate: { gte: fromYmd(from) }, OR: [{ employeeId: m.employeeId }, ...(m.departmentId ? [{ employee: { departmentId: m.departmentId } }] : [])] }, select: { startDate: true, endDate: true, employeeId: true, type: { select: { name: true } }, employee: { select: { firstName: true, lastName: true } } }, take: 200 }),
    prisma.pwmReview.findMany({ where: { employeeId: m.employeeId, status: { not: 'ACKNOWLEDGED' }, cycle: { dueDate: { gte: fromYmd(from), lte: fromYmd(to) } } }, select: { cycle: { select: { name: true, dueDate: true } } } }),
  ]);
  const items = [
    ...hol.map((h) => ({ date: dateOnly(h.date), kind: 'HOLIDAY', title: h.name })),
    // Colleagues' leave shows as "away" only, not the type (a sick day is private).
    ...leave.map((l) => ({ date: dateOnly(l.startDate), end: dateOnly(l.endDate), kind: 'LEAVE', title: l.employeeId === m.employeeId ? `You: ${l.type.name}` : `${fullName(l.employee)} is away` })),
    ...cycles.map((c) => ({ date: dateOnly(c.cycle.dueDate), kind: 'REVIEW_DUE', title: `${c.cycle.name}: your review is due` })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return apiResponse.success(res, 'Calendar.', { from, to, items });
});

// ── Performance ──────────────────────────────────────────────────────────────

const reviewRow = (r: { id: string; status: string; cycle: { name: string; dueDate: Date }; employee?: { firstName: string; lastName: string }; managerRating: number | null; selfRating: number | null }, today: string) => ({ id: r.id, status: r.status, cycle: r.cycle.name, dueDate: r.cycle.dueDate, overdue: r.status !== 'ACKNOWLEDGED' && dateOnly(r.cycle.dueDate) < today, employee: r.employee ? fullName(r.employee) : null, managerRating: r.managerRating, selfRating: r.selfRating });

// GET /my-hr/reviews
export const myReviews = my(async (req, res) => {
  const m = me(req);
  const today = lagosYmd(new Date());
  const [mine, toAssess] = await Promise.all([
    prisma.pwmReview.findMany({ where: { employeeId: m.employeeId }, orderBy: { createdAt: 'desc' }, include: { cycle: { select: { name: true, dueDate: true } } } }),
    prisma.pwmReview.findMany({ where: { reviewerUserId: m.userId }, orderBy: { createdAt: 'desc' }, take: 200, include: { cycle: { select: { name: true, dueDate: true } }, employee: { select: { firstName: true, lastName: true } } } }),
  ]);
  return apiResponse.success(res, 'Reviews.', { mine: mine.map((r) => reviewRow(r, today)), toAssess: toAssess.map((r) => reviewRow(r, today)) });
});

const loadReview = async (req: MyHrRequest) => {
  const r = await prisma.pwmReview.findUnique({ where: { id: req.params.id }, include: { cycle: true, employee: { select: { id: true, firstName: true, lastName: true, userId: true } } } });
  if (!r) return fail(404, 'Review not found.') as never;
  const isEmployee = r.employeeId === me(req).employeeId; const isReviewer = r.reviewerUserId === me(req).userId;
  if (!isEmployee && !isReviewer) fail(404, 'Review not found.');
  return { r, isEmployee, isReviewer };
};

// GET /my-hr/reviews/:id : the employee sees their own; the reviewer sees the reports'
export const myReviewDetail = my(async (req, res) => {
  const { r, isEmployee, isReviewer } = await loadReview(req);
  const objectives = await prisma.pwmObjective.findMany({ where: { employeeId: r.employeeId, status: { in: ['ACTIVE', 'ACHIEVED', 'MISSED'] } }, orderBy: { createdAt: 'asc' } });
  // Until the manager has finished, the employee does not see the manager's draft.
  const managerVisible = isReviewer || ['DISCUSSION', 'ACKNOWLEDGED'].includes(r.status);
  return apiResponse.success(res, 'Review.', {
    id: r.id, status: r.status, cycle: r.cycle.name, period: `${dateOnly(r.cycle.periodStart)} to ${dateOnly(r.cycle.periodEnd)}`, dueDate: r.cycle.dueDate, employee: fullName(r.employee), isEmployee, isReviewer,
    selfRating: r.selfRating, selfComment: r.selfComment, discussedAt: r.discussedAt, ackedAt: r.ackedAt, ackComment: r.ackComment,
    ...(managerVisible ? { managerRating: r.managerRating, managerComment: r.managerComment, strengths: r.strengths, improvements: r.improvements, summary: r.summary } : {}),
    objectives: objectives.map((o) => ({ ...o })),
    canSelf: isEmployee && r.status === 'SELF', canManager: isReviewer && ['SELF', 'MANAGER'].includes(r.status), canDiscuss: isReviewer && r.status === 'DISCUSSION' && !r.discussedAt, canAck: isEmployee && r.status === 'DISCUSSION' && !!r.discussedAt,
  });
});

const rating = (v: unknown, label: string) => { const n = int(v, label, 1, 5); if (!n) fail(400, `${label} must be between 1 and 5.`); return n as number; };

export const submitSelf = my(async (req, res) => {
  const { r, isEmployee } = await loadReview(req);
  if (!isEmployee || r.status !== 'SELF') fail(409, 'Your self-assessment is not open.');
  await prisma.pwmReview.update({ where: { id: r.id }, data: { selfRating: rating(req.body?.rating, 'Rating'), selfComment: reqStr(req.body?.comment, 'Comment', 3000), selfAt: new Date(), status: 'MANAGER' } });
  await pwmAudit(audit(req), { action: 'REVIEW_SELF_SUBMITTED', entity: 'PwmEmployee', entityId: r.employeeId, meta: { reviewId: r.id } });
  await notifyPwm([r.reviewerUserId], { title: `${fullName(r.employee)} finished their self-assessment`, body: r.cycle.name, link: '/my-hr/reviews' });
  return apiResponse.success(res, 'Sent to your manager.', null);
});

export const submitManager = my(async (req, res) => {
  const { r, isReviewer } = await loadReview(req);
  if (!isReviewer || !['SELF', 'MANAGER'].includes(r.status)) fail(409, 'This assessment is not open for you.');
  await prisma.pwmReview.update({ where: { id: r.id }, data: { managerRating: rating(req.body?.rating, 'Rating'), managerComment: reqStr(req.body?.comment, 'Assessment', 3000), strengths: str(req.body?.strengths, 2000), improvements: str(req.body?.improvements, 2000), summary: reqStr(req.body?.summary, 'Summary', 1000), managerAt: new Date(), status: 'DISCUSSION' } });
  await pwmAudit(audit(req), { action: 'REVIEW_MANAGER_SUBMITTED', entity: 'PwmEmployee', entityId: r.employeeId, meta: { reviewId: r.id } });
  return apiResponse.success(res, 'Saved. Now hold the discussion and mark it as done.', null);
});

export const markDiscussed = my(async (req, res) => {
  const { r, isReviewer } = await loadReview(req);
  if (!isReviewer || r.status !== 'DISCUSSION') fail(409, 'Nothing to mark.');
  await prisma.pwmReview.update({ where: { id: r.id }, data: { discussedAt: new Date() } });
  await notifyPwm([r.employee.userId], { title: 'Your review is ready to acknowledge', body: `${r.cycle.name}. Read it and add your comment.`, link: '/my-hr/reviews' });
  return apiResponse.success(res, 'Marked. The employee can now acknowledge it.', null);
});

// Acknowledging makes the review read-only; only HR can reopen it (AC-PRF-03).
export const acknowledge = my(async (req, res) => {
  const { r, isEmployee } = await loadReview(req);
  if (!isEmployee || r.status !== 'DISCUSSION' || !r.discussedAt) fail(409, 'This review is not ready to acknowledge.');
  await prisma.pwmReview.update({ where: { id: r.id }, data: { status: 'ACKNOWLEDGED', ackedAt: new Date(), ackComment: str(req.body?.comment, 2000) } });
  await pwmAudit(audit(req), { action: 'REVIEW_ACKNOWLEDGED', entity: 'PwmEmployee', entityId: r.employeeId, meta: { reviewId: r.id } });
  return apiResponse.success(res, 'Thank you. The review is now closed.', null);
});

// ── Objectives, feedback, team ───────────────────────────────────────────────

// GET /my-hr/objectives : mine, plus my department's targets
export const myObjectives = my(async (req, res) => {
  const m = me(req);
  const [mine, dept, notes, pip] = await Promise.all([
    prisma.pwmObjective.findMany({ where: { employeeId: m.employeeId, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } }),
    m.departmentId ? prisma.pwmObjective.findMany({ where: { departmentId: m.departmentId, employeeId: null, status: 'ACTIVE' } }) : Promise.resolve([]),
    prisma.pwmFeedbackNote.findMany({ where: { employeeId: m.employeeId, sharedWithEmployee: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.pwmImprovementPlan.findFirst({ where: { employeeId: m.employeeId, status: 'ACTIVE' } }),
  ]);
  return apiResponse.success(res, 'Objectives.', { mine, department: dept, feedback: notes, plan: pip });
});

export const updateMyObjective = my(async (req, res) => {
  const o = await prisma.pwmObjective.findUnique({ where: { id: req.params.id } });
  if (!o || o.employeeId !== me(req).employeeId) fail(404, 'Objective not found.');
  const progress = int(req.body?.progress, 'Progress', 0, 100);
  if (progress === null) fail(400, 'Give progress from 0 to 100.');
  await prisma.pwmObjective.update({ where: { id: o!.id }, data: { progress: progress as number } });
  return apiResponse.success(res, 'Saved.', null);
});

/** The people who report to me (or sit in a department I head). */
const myReports = async (m: { employeeId: string; userId: string }) => {
  const heads = await prisma.pwmDepartment.findMany({ where: { headEmployeeId: m.employeeId, archivedAt: null }, select: { id: true } });
  return prisma.pwmEmployee.findMany({ where: { id: { not: m.employeeId }, status: { in: ['PROBATION', 'ACTIVE', 'RENEWAL_PENDING', 'CONTRACT_ISSUED', 'ON_LEAVE', 'CONTRACT_EXPIRED'] }, OR: [{ managerId: m.employeeId }, ...(heads.length ? [{ departmentId: { in: heads.map((h) => h.id) } }] : [])] }, select: { id: true, firstName: true, lastName: true, jobTitle: true, status: true }, orderBy: { lastName: 'asc' } });
};

export const myTeam = my(async (req, res) => apiResponse.success(res, 'Team.', await myReports(me(req))));

export const teamObjective = my(async (req, res) => {
  const reports = await myReports(me(req));
  if (!reports.some((x) => x.id === req.params.employeeId)) fail(403, 'You can set objectives for your own team only.');
  const b = req.body ?? {};
  const weight = int(b.weight, 'Weight', 0, 100) ?? 0;
  const used = (await prisma.pwmObjective.aggregate({ where: { employeeId: req.params.employeeId, status: 'ACTIVE' }, _sum: { weight: true } }))._sum.weight ?? 0;
  if (used + weight > 100) fail(409, `Weights would total ${used + weight}%. They can add up to at most 100%.`);
  const due = ymd(b.dueDate, 'Due date');
  const o = await prisma.pwmObjective.create({ data: { employeeId: req.params.employeeId, title: reqStr(b.title, 'Title', 200), description: str(b.description, 2000), measure: str(b.measure, 300), target: str(b.target, 200), weight, dueDate: due ? fromYmd(due) : null, createdById: me(req).userId } });
  await pwmAudit(audit(req), { action: 'OBJECTIVE_CREATED', entity: 'PwmObjective', entityId: o.id, after: { title: o.title, employeeId: req.params.employeeId } });
  return apiResponse.success(res, 'Added.', o, 201);
});

export const teamFeedback = my(async (req, res) => {
  const reports = await myReports(me(req));
  if (!reports.some((x) => x.id === req.params.employeeId)) fail(403, 'You can write notes for your own team only.');
  const n = await prisma.pwmFeedbackNote.create({ data: { employeeId: req.params.employeeId, authorUserId: me(req).userId, kind: oneOf(req.body?.kind ?? 'NOTE', ['PRAISE', 'IMPROVE', 'NOTE'] as const, 'Kind'), text: reqStr(req.body?.text, 'Note', 2000), sharedWithEmployee: !!req.body?.sharedWithEmployee } });
  await pwmAudit(audit(req), { action: 'FEEDBACK_NOTE_ADDED', entity: 'PwmEmployee', entityId: req.params.employeeId, meta: { noteId: n.id, shared: n.sharedWithEmployee } });
  return apiResponse.success(res, 'Saved.', n, 201);
});
