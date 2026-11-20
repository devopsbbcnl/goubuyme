// PWM Phase 3 (HR side): leave, public holidays, attendance, performance and the HR calendar.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { CURRENT_STATUSES, FORMER_STATUSES, addDays, can, dateOnly, fromYmd, fullName, lagosYmd } from '../../services/pwm/rules';
import { DEFAULT_LEAVE_TYPES, FIXED_HOLIDAYS, balanceOf, entitlement } from '../../services/pwm/timeRules';
import { LeaveError, adjustBalance, cancelLeave, decideLeave, holidaysBetween, submitLeave, yearEnd } from '../../services/pwm/leave';
import { AttendanceError, decideCorrection, decideOvertime, defaultSchedule } from '../../services/pwm/attendance';
import { PerfError, launchCycle } from '../../services/pwm/performance';
import { canSeeEmployee, employeeScope } from '../../services/pwm/people';
import { HttpError, access, fail, handle, int, nameMap, oneOf, reqStr, reqYmd, str, ymd } from './common';

/** Services throw their own error types; turn them into HttpError so `handle` answers cleanly. */
const wrap = async <T,>(fn: () => Promise<T>): Promise<T> => {
  try { return await fn(); } catch (e) {
    if (e instanceof LeaveError || e instanceof AttendanceError || e instanceof PerfError) throw new HttpError(e.status, e.message);
    throw e;
  }
};
const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
void FORMER_STATUSES;

// ── Leave types ──────────────────────────────────────────────────────────────

export const listLeaveTypes = handle(async (_req, res) => apiResponse.success(res, 'Leave types.', (await prisma.pwmLeaveType.findMany({ orderBy: { sortOrder: 'asc' } })).map((t) => ({ ...t, annualDays: num(t.annualDays), carryOverCap: num(t.carryOverCap) }))));

export const seedLeaveTypes = handle(async (req, res) => {
  const have = new Set((await prisma.pwmLeaveType.findMany({ select: { key: true } })).map((t) => t.key));
  const add = DEFAULT_LEAVE_TYPES.filter((t) => !have.has(t.key));
  for (const t of add) await prisma.pwmLeaveType.create({ data: { ...t, approvalChain: [...t.approvalChain] } });
  await pwmAudit(req, { action: 'LEAVE_TYPES_SEEDED', entity: 'PwmLeaveType', entityId: 'seed', after: { added: add.map((t) => t.key) } });
  return apiResponse.success(res, add.length ? `${add.length} leave types added. Have counsel confirm the values against the Labour Act before go-live.` : 'The default leave types already exist.', null);
});

const CHAIN = ['SUPERVISOR', 'DEPT_HEAD', 'HR'];
const typeData = (b: Record<string, unknown>, partial: boolean): Prisma.PwmLeaveTypeUncheckedUpdateInput => {
  const d: Prisma.PwmLeaveTypeUncheckedUpdateInput = {};
  if (!partial || b.name !== undefined) d.name = reqStr(b.name, 'Name', 80);
  if (b.annualDays !== undefined) { const n = Number(b.annualDays); if (!(n >= 0 && n <= 366)) fail(400, 'Annual days must be between 0 and 366.'); d.annualDays = n; }
  if (b.accrual !== undefined) d.accrual = oneOf(b.accrual, ['UPFRONT', 'MONTHLY'] as const, 'Accrual');
  for (const k of ['afterProbationOnly', 'allowHalfDay', 'paid', 'allowNegative', 'setsOnLeaveStatus', 'countsWeekends', 'active'] as const) if (b[k] !== undefined) (d as Record<string, unknown>)[k] = !!b[k];
  if (b.minTenureMonths !== undefined) d.minTenureMonths = int(b.minTenureMonths, 'Minimum service', 0, 120) ?? 0;
  if (b.carryOverCap !== undefined) d.carryOverCap = Math.max(0, Number(b.carryOverCap) || 0);
  if (b.maxConsecutiveDays !== undefined) d.maxConsecutiveDays = int(b.maxConsecutiveDays, 'Maximum days at a time', 1, 366);
  if (b.docAfterDays !== undefined) d.docAfterDays = int(b.docAfterDays, 'Document after days', 0, 366);
  if (b.approvalChain !== undefined) {
    const c = (Array.isArray(b.approvalChain) ? b.approvalChain : []).map(String).filter((x) => CHAIN.includes(x));
    if (!c.length) fail(400, 'Choose at least one approval step.');
    d.approvalChain = [...new Set(c)];
  }
  return d;
};

export const createLeaveType = handle(async (req, res) => {
  const b = req.body ?? {};
  const key = reqStr(b.key ?? b.name, 'Key', 40).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (await prisma.pwmLeaveType.findUnique({ where: { key } })) fail(409, 'A leave type with that key already exists.');
  const d = typeData({ ...b, approvalChain: b.approvalChain ?? ['SUPERVISOR', 'HR'] }, false);
  const t = await prisma.pwmLeaveType.create({ data: { ...(d as Prisma.PwmLeaveTypeUncheckedCreateInput), key } });
  await pwmAudit(req, { action: 'LEAVE_TYPE_CREATED', entity: 'PwmLeaveType', entityId: t.id, after: { key, name: t.name } });
  return apiResponse.success(res, 'Created.', t, 201);
});

export const updateLeaveType = handle(async (req, res) => {
  const cur = await prisma.pwmLeaveType.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Leave type not found.');
  const d = typeData(req.body ?? {}, true);
  const t = await prisma.pwmLeaveType.update({ where: { id: cur!.id }, data: d });
  await pwmAudit(req, { action: 'LEAVE_TYPE_CHANGED', entity: 'PwmLeaveType', entityId: t.id, before: Object.fromEntries(Object.keys(d).map((k) => [k, (cur as Record<string, unknown>)[k]])), after: d });
  return apiResponse.success(res, 'Saved.', t);
});

// ── Holidays ─────────────────────────────────────────────────────────────────

export const listHolidays = handle(async (req, res) => {
  const year = int(req.query.year, 'Year', 2000, 2100) ?? new Date().getFullYear();
  const rows = await prisma.pwmHoliday.findMany({ where: { date: { gte: fromYmd(`${year}-01-01`), lte: fromYmd(`${year}-12-31`) } }, orderBy: { date: 'asc' } });
  return apiResponse.success(res, 'Holidays.', rows.map((h) => ({ ...h, date: dateOnly(h.date) })));
});
export const addHoliday = handle(async (req, res) => {
  const date = reqYmd(req.body?.date, 'Date'); const name = reqStr(req.body?.name, 'Name', 100);
  const h = await prisma.pwmHoliday.upsert({ where: { date_name: { date: fromYmd(date), name } }, create: { date: fromYmd(date), name }, update: {} });
  await pwmAudit(req, { action: 'HOLIDAY_ADDED', entity: 'PwmHoliday', entityId: h.id, after: { date, name } });
  return apiResponse.success(res, 'Added.', h, 201);
});
export const seedHolidays = handle(async (req, res) => {
  const year = int(req.body?.year, 'Year', 2000, 2100) ?? new Date().getFullYear();
  let n = 0;
  for (const h of FIXED_HOLIDAYS) { const r = await prisma.pwmHoliday.upsert({ where: { date_name: { date: fromYmd(`${year}-${h.md}`), name: h.name } }, create: { date: fromYmd(`${year}-${h.md}`), name: h.name }, update: {} }); if (r) n++; }
  await pwmAudit(req, { action: 'HOLIDAYS_SEEDED', entity: 'PwmHoliday', entityId: `seed-${year}` });
  return apiResponse.success(res, `Fixed-date federal holidays for ${year} are in. Add Good Friday, Easter Monday and the Eid holidays when they are announced.`, { count: n });
});
export const deleteHoliday = handle(async (req, res) => {
  const h = await prisma.pwmHoliday.findUnique({ where: { id: req.params.id } });
  if (!h) fail(404, 'Holiday not found.');
  await prisma.pwmHoliday.delete({ where: { id: h!.id } });
  await pwmAudit(req, { action: 'HOLIDAY_REMOVED', entity: 'PwmHoliday', entityId: h!.id, before: { date: dateOnly(h!.date), name: h!.name } });
  return apiResponse.success(res, 'Removed.', null);
});

// ── Leave requests ───────────────────────────────────────────────────────────

const reqInclude = {
  type: { select: { name: true, key: true } }, employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, department: { select: { name: true } } } }, approvals: { orderBy: { step: 'asc' as const } },
} satisfies Prisma.PwmLeaveRequestInclude;

// GET /leave/requests?status=&departmentId=&from=&to=
export const listLeaveRequests = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const rows = await prisma.pwmLeaveRequest.findMany({
    where: { employee: { AND: [employeeScope(a), ...(q.departmentId ? [{ departmentId: q.departmentId }] : [])] }, ...(q.status ? { status: q.status as never } : {}), ...(q.from ? { endDate: { gte: fromYmd(q.from) } } : {}), ...(q.to ? { startDate: { lte: fromYmd(q.to) } } : {}) },
    orderBy: { createdAt: 'desc' }, take: 300, include: reqInclude,
  });
  const names = await nameMap(rows.flatMap((r) => r.approvals.flatMap((x) => [x.approverUserId, x.actedById])));
  return apiResponse.success(res, 'Leave requests.', rows.map((r) => ({
    id: r.id, status: r.status, type: r.type.name, employee: r.employee, startDate: r.startDate, endDate: r.endDate, days: num(r.days), reason: r.reason, docUrl: r.docUrl, createdAt: r.createdAt, currentStep: r.currentStep,
    approvals: r.approvals.map((x) => ({ step: x.step, role: x.role, approverName: x.approverUserId ? names.get(x.approverUserId) ?? null : 'HR', decision: x.decision, note: x.note, actedByName: x.actedById ? names.get(x.actedById) ?? null : null })),
    waitingOn: r.status === 'PENDING' ? r.approvals.find((x) => x.step === r.currentStep)?.role ?? null : null,
  })));
});

// POST /leave/requests : HR records leave for an employee
export const createLeaveForEmployee = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const e = await prisma.pwmEmployee.findUnique({ where: { id: reqStr(b.employeeId, 'Employee', 60) }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const r = await wrap(() => submitLeave({ employeeId: e!.id, typeId: reqStr(b.typeId, 'Leave type', 60), start: reqYmd(b.start, 'Start date'), end: reqYmd(b.end, 'End date'), startHalf: !!b.startHalf, endHalf: !!b.endHalf, reason: str(b.reason, 500), docUrl: str(b.docUrl, 1000), requestedById: a.userId }));
  return apiResponse.success(res, `Request submitted (${r.days} days).`, r, 201);
});

// POST /leave/requests/:id/decide { approve, note }
export const decideLeaveRequest = handle(async (req, res) => {
  const a = access(req);
  const status = await wrap(() => decideLeave(req.params.id, { userId: a.userId, isHr: can(a, 'manageLeave') }, req.body?.approve === true, str(req.body?.note, 500)));
  return apiResponse.success(res, status === 'APPROVED' ? 'Approved.' : status === 'REJECTED' ? 'Declined.' : 'Step approved. It moves to the next approver.', { status });
});

export const cancelLeaveRequest = handle(async (req, res) => {
  const a = access(req);
  await wrap(() => cancelLeave(req.params.id, { userId: a.userId, isHr: can(a, 'manageLeave'), employeeId: a.employeeId }, str(req.body?.reason, 300)));
  return apiResponse.success(res, 'Cancelled.', null);
});

// GET /leave/balances?year=&departmentId= : read-only, nothing is written by looking
export const listBalances = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const year = int(q.year, 'Year', 2000, 2100) ?? new Date().getFullYear();
  const today = lagosYmd(new Date());
  const [types, emps] = await Promise.all([
    prisma.pwmLeaveType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.pwmEmployee.findMany({ where: { AND: [employeeScope(a), { status: { in: [...CURRENT_STATUSES] } }, ...(q.departmentId ? [{ departmentId: q.departmentId }] : [])] }, orderBy: { lastName: 'asc' }, take: 1000, select: { id: true, employeeNo: true, firstName: true, lastName: true, hireDate: true, exitDate: true, department: { select: { name: true } } } }),
  ]);
  const rows = await prisma.pwmLeaveBalance.findMany({ where: { year, employeeId: { in: emps.map((e) => e.id) } } });
  const by = new Map(rows.map((r) => [`${r.employeeId}|${r.typeId}`, r]));
  return apiResponse.success(res, 'Balances.', {
    year, types: types.map((t) => ({ id: t.id, name: t.name, key: t.key })),
    employees: emps.map((e) => ({
      id: e.id, employeeNo: e.employeeNo, name: fullName(e), department: e.department?.name ?? null,
      balances: types.map((t) => {
        const b = by.get(`${e.id}|${t.id}`);
        const entitled = entitlement({ annualDays: num(t.annualDays), accrual: t.accrual as 'UPFRONT' | 'MONTHLY', year, hire: dateOnly(e.hireDate), exit: e.exitDate ? dateOnly(e.exitDate) : null, asOf: today });
        const row = { entitled, carriedOver: num(b?.carriedOver), adjusted: num(b?.adjusted), used: num(b?.used) };
        return { typeId: t.id, ...row, available: balanceOf(row) };
      }),
    })),
  });
});

// POST /leave/adjust { employeeId, typeId, year, delta, reason }
export const adjust = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const delta = Number(b.delta);
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 366) fail(400, 'Give a non-zero adjustment in days.');
  await wrap(() => adjustBalance(reqStr(b.employeeId, 'Employee', 60), reqStr(b.typeId, 'Leave type', 60), int(b.year, 'Year', 2000, 2100) ?? new Date().getFullYear(), delta, reqStr(b.reason, 'Reason', 300), a.userId));
  return apiResponse.success(res, 'Balance adjusted and logged.', null);
});

// POST /leave/year-end { year, apply }
export const runYearEnd = handle(async (req, res) => {
  const a = access(req);
  const year = int(req.body?.year, 'Year', 2000, 2100);
  if (!year) fail(400, 'Choose the year that is ending.');
  const rows = await wrap(() => yearEnd(year as number, req.body?.apply === true, a.userId));
  return apiResponse.success(res, req.body?.apply === true ? `Carry-over applied to ${(year as number) + 1}.` : 'Preview only. Nothing was changed.', { applied: req.body?.apply === true, rows });
});

// GET /leave/report?year=
export const leaveReport = handle(async (req, res) => {
  const a = access(req);
  const year = int(req.query.year, 'Year', 2000, 2100) ?? new Date().getFullYear();
  const reqs = await prisma.pwmLeaveRequest.findMany({ where: { status: 'APPROVED', startDate: { lte: fromYmd(`${year}-12-31`) }, endDate: { gte: fromYmd(`${year}-01-01`) }, employee: employeeScope(a) }, select: { days: true, type: { select: { name: true } }, employee: { select: { department: { select: { name: true } } } } } });
  const sum = (key: (r: (typeof reqs)[number]) => string) => Object.entries(reqs.reduce<Record<string, number>>((m, r) => { const k = key(r); m[k] = (m[k] ?? 0) + num(r.days); return m; }, {})).map(([name, days]) => ({ name, days })).sort((x, y) => y.days - x.days);
  return apiResponse.success(res, 'Leave report.', { year, byType: sum((r) => r.type.name), byDepartment: sum((r) => r.employee.department?.name ?? 'No department'), totalDays: reqs.reduce((s, r) => s + num(r.days), 0), requests: reqs.length });
});

// ── Attendance ───────────────────────────────────────────────────────────────

const SCHED_DAYS = [1, 2, 3, 4, 5, 6, 7];
const schedData = (b: Record<string, unknown>, partial: boolean): Prisma.PwmScheduleUncheckedUpdateInput => {
  const d: Prisma.PwmScheduleUncheckedUpdateInput = {};
  const time = (v: unknown, label: string) => { const s = String(v ?? ''); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) fail(400, `${label} must look like 08:00.`); return s; };
  if (!partial || b.name !== undefined) d.name = reqStr(b.name, 'Name', 80);
  if (!partial || b.startTime !== undefined) d.startTime = time(b.startTime, 'Start time');
  if (!partial || b.endTime !== undefined) d.endTime = time(b.endTime, 'End time');
  if (b.breakMinutes !== undefined) d.breakMinutes = int(b.breakMinutes, 'Break', 0, 240) ?? 0;
  if (b.graceMinutes !== undefined) d.graceMinutes = int(b.graceMinutes, 'Grace period', 0, 120) ?? 0;
  if (!partial || b.workDays !== undefined) { const w = (Array.isArray(b.workDays) ? b.workDays : []).map(Number).filter((n) => SCHED_DAYS.includes(n)); if (!w.length) fail(400, 'Choose at least one work day.'); d.workDays = [...new Set(w)]; }
  if (b.active !== undefined) d.active = !!b.active;
  return d;
};

export const listSchedules = handle(async (_req, res) => { await defaultSchedule(); const rows = await prisma.pwmSchedule.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { employees: true } } } }); return apiResponse.success(res, 'Schedules.', rows.map((s) => ({ ...s, assigned: s._count.employees, _count: undefined }))); });
export const createSchedule = handle(async (req, res) => {
  const d = schedData(req.body ?? {}, false);
  if (await prisma.pwmSchedule.findUnique({ where: { name: d.name as string } })) fail(409, 'A schedule with that name exists.');
  const s = await prisma.pwmSchedule.create({ data: d as Prisma.PwmScheduleUncheckedCreateInput });
  await pwmAudit(req, { action: 'SCHEDULE_CREATED', entity: 'PwmSchedule', entityId: s.id, after: d });
  return apiResponse.success(res, 'Created.', s, 201);
});
export const updateSchedule = handle(async (req, res) => {
  const cur = await prisma.pwmSchedule.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Schedule not found.');
  const d = schedData(req.body ?? {}, true);
  const s = await prisma.pwmSchedule.update({ where: { id: cur!.id }, data: d });
  await pwmAudit(req, { action: 'SCHEDULE_CHANGED', entity: 'PwmSchedule', entityId: s.id, before: cur, after: d });
  return apiResponse.success(res, 'Saved.', s);
});
// POST /schedules/:id/assign { employeeIds, departmentId }
export const assignSchedule = handle(async (req, res) => {
  const s = await prisma.pwmSchedule.findUnique({ where: { id: req.params.id } });
  if (!s) fail(404, 'Schedule not found.');
  const ids = (Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : []).map(String);
  const dept = str(req.body?.departmentId, 60);
  if (!ids.length && !dept) fail(400, 'Choose employees or a department.');
  const r = await prisma.pwmEmployee.updateMany({ where: { OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...(dept ? [{ departmentId: dept }] : [])], status: { in: [...CURRENT_STATUSES, 'PENDING_ONBOARDING'] } }, data: { scheduleId: s!.id } });
  await pwmAudit(req, { action: 'SCHEDULE_ASSIGNED', entity: 'PwmSchedule', entityId: s!.id, meta: { count: r.count, departmentId: dept } });
  return apiResponse.success(res, `${r.count} people moved to ${s!.name}.`, { count: r.count });
});

// GET /attendance/register?date=
export const register = handle(async (req, res) => {
  const a = access(req);
  const date = ymd(req.query.date, 'Date') ?? lagosYmd(new Date());
  const emps = await prisma.pwmEmployee.findMany({ where: { AND: [employeeScope(a), { status: { in: [...CURRENT_STATUSES] } }, { hireDate: { lte: fromYmd(date) } }] }, orderBy: { lastName: 'asc' }, take: 1000, select: { id: true, employeeNo: true, firstName: true, lastName: true, department: { select: { name: true } }, attendance: { where: { date: fromYmd(date) }, take: 1 } } });
  const rows = emps.map((e) => ({ employeeId: e.id, employeeNo: e.employeeNo, name: fullName(e), department: e.department?.name ?? null, record: e.attendance[0] ? { id: e.attendance[0].id, status: e.attendance[0].status, clockIn: e.attendance[0].clockIn, clockOut: e.attendance[0].clockOut, minutesLate: e.attendance[0].minutesLate, minutesWorked: e.attendance[0].minutesWorked, explanation: e.attendance[0].explanation, source: e.attendance[0].source } : null }));
  const hol = await holidaysBetween(date, date);
  return apiResponse.success(res, 'Register.', { date, holiday: hol.length > 0, rows });
});

// GET /attendance/summary?from&to
export const attendanceSummary = handle(async (req, res) => {
  const a = access(req);
  const to = ymd(req.query.to, 'To') ?? lagosYmd(new Date());
  const from = ymd(req.query.from, 'From') ?? addDays(to, -29);
  const recs = await prisma.pwmAttendance.findMany({ where: { date: { gte: fromYmd(from), lte: fromYmd(to) }, employee: employeeScope(a) }, select: { status: true, minutesLate: true, minutesWorked: true, employee: { select: { department: { select: { name: true } } } } } });
  const ot = await prisma.pwmOvertime.findMany({ where: { status: 'APPROVED', date: { gte: fromYmd(from), lte: fromYmd(to) }, employee: employeeScope(a) }, select: { hours: true, employee: { select: { department: { select: { name: true } } } } } });
  const depts = new Map<string, { present: number; late: number; absent: number; remote: number; leave: number; lateMinutes: number; overtimeHours: number }>();
  const get = (n: string) => { if (!depts.has(n)) depts.set(n, { present: 0, late: 0, absent: 0, remote: 0, leave: 0, lateMinutes: 0, overtimeHours: 0 }); return depts.get(n)!; };
  for (const r of recs) { const d = get(r.employee.department?.name ?? 'No department'); if (r.status === 'PRESENT') d.present++; else if (r.status === 'LATE') { d.late++; d.lateMinutes += r.minutesLate; } else if (r.status === 'ABSENT') d.absent++; else if (r.status === 'REMOTE') d.remote++; else if (r.status === 'ON_LEAVE') d.leave++; }
  for (const o of ot) get(o.employee.department?.name ?? 'No department').overtimeHours += num(o.hours);
  const out = [...depts.entries()].map(([name, d]) => { const worked = d.present + d.late + d.absent + d.remote; return { name, ...d, absenteeismPct: worked ? Math.round((d.absent / worked) * 1000) / 10 : null, avgLateMinutes: d.late ? Math.round(d.lateMinutes / d.late) : null }; }).sort((x, y) => (y.absenteeismPct ?? 0) - (x.absenteeismPct ?? 0));
  return apiResponse.success(res, 'Attendance summary.', { from, to, departments: out });
});

// POST /attendance/:id/excuse { note }
export const excuseAbsence = handle(async (req, res) => {
  const rec = await prisma.pwmAttendance.findUnique({ where: { id: req.params.id } });
  if (!rec || rec.status !== 'ABSENT') fail(404, 'No absence found.');
  const note = reqStr(req.body?.note, 'Reason', 300);
  await prisma.pwmAttendance.update({ where: { id: rec!.id }, data: { status: 'EXCUSED', explanation: note } });
  await pwmAudit(req, { action: 'ABSENCE_EXCUSED', entity: 'PwmEmployee', entityId: rec!.employeeId, reason: note, meta: { date: dateOnly(rec!.date) } });
  return apiResponse.success(res, 'Marked as excused.', null);
});

// GET /attendance/corrections?status= and /overtime?status=
export const listCorrections = handle(async (req, res) => {
  const a = access(req);
  const rows = await prisma.pwmAttendanceCorrection.findMany({ where: { status: (req.query.status as never) ?? 'PENDING', employee: employeeScope(a) }, orderBy: { createdAt: 'desc' }, take: 200, include: { employee: { select: { employeeNo: true, firstName: true, lastName: true } } } });
  return apiResponse.success(res, 'Corrections.', rows.map((r) => ({ ...r, employee: { ...r.employee, name: fullName(r.employee) } })));
});
export const decideCorrectionReq = handle(async (req, res) => {
  const a = access(req);
  await wrap(() => decideCorrection(req.params.id, { userId: a.userId, isHr: can(a, 'manageAttendance') }, req.body?.approve === true, str(req.body?.note, 300)));
  return apiResponse.success(res, req.body?.approve === true ? 'Correction applied. The original times are kept in the history.' : 'Declined.', null);
});
export const listOvertime = handle(async (req, res) => {
  const a = access(req);
  const rows = await prisma.pwmOvertime.findMany({ where: { status: (req.query.status as never) ?? 'PENDING', employee: employeeScope(a) }, orderBy: { createdAt: 'desc' }, take: 200, include: { employee: { select: { employeeNo: true, firstName: true, lastName: true } } } });
  return apiResponse.success(res, 'Overtime.', rows.map((r) => ({ ...r, hours: num(r.hours), employee: { ...r.employee, name: fullName(r.employee) } })));
});
export const decideOvertimeReq = handle(async (req, res) => {
  const a = access(req);
  await wrap(() => decideOvertime(req.params.id, { userId: a.userId, isHr: can(a, 'manageAttendance') }, req.body?.approve === true, str(req.body?.note, 300)));
  return apiResponse.success(res, 'Recorded.', null);
});

// ── Performance ──────────────────────────────────────────────────────────────

const CYCLE_TYPES = ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'PROBATION', 'RENEWAL', 'ADHOC'] as const;

export const listCycles = handle(async (_req, res) => {
  const rows = await prisma.pwmReviewCycle.findMany({ orderBy: { dueDate: 'desc' }, take: 50, include: { reviews: { select: { status: true } } } });
  const today = lagosYmd(new Date());
  return apiResponse.success(res, 'Cycles.', rows.map((c) => ({ ...c, reviews: undefined, total: c.reviews.length, completed: c.reviews.filter((r) => r.status === 'ACKNOWLEDGED').length, overdue: dateOnly(c.dueDate) < today && c.status === 'OPEN' ? c.reviews.filter((r) => r.status !== 'ACKNOWLEDGED').length : 0 })));
});
export const createCycle = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const start = reqYmd(b.periodStart, 'Period start'); const end = reqYmd(b.periodEnd, 'Period end'); const due = reqYmd(b.dueDate, 'Due date');
  if (end < start) fail(400, 'The period ends before it starts.');
  if (due < start) fail(400, 'The due date is before the period starts.');
  const c = await prisma.pwmReviewCycle.create({ data: { name: reqStr(b.name, 'Name', 100), type: oneOf(b.type, CYCLE_TYPES, 'Type'), periodStart: fromYmd(start), periodEnd: fromYmd(end), dueDate: fromYmd(due), createdById: a.userId } });
  await pwmAudit(req, { action: 'REVIEW_CYCLE_CREATED', entity: 'PwmReviewCycle', entityId: c.id, after: { name: c.name } });
  return apiResponse.success(res, 'Cycle created. Launch it to start the reviews.', c, 201);
});
export const launch = handle(async (req, res) => {
  const a = access(req);
  const r = await wrap(() => launchCycle(req.params.id, a.userId, (Array.isArray(req.body?.departmentIds) ? req.body.departmentIds : []).map(String)));
  return apiResponse.success(res, `${r.created} reviews started${r.withoutReviewer ? `; ${r.withoutReviewer} have no reviewer yet` : ''}.`, r);
});
export const closeCycle = handle(async (req, res) => {
  const c = await prisma.pwmReviewCycle.findUnique({ where: { id: req.params.id } });
  if (!c) fail(404, 'Cycle not found.');
  await prisma.pwmReviewCycle.update({ where: { id: c!.id }, data: { status: 'CLOSED' } });
  await pwmAudit(req, { action: 'REVIEW_CYCLE_CLOSED', entity: 'PwmReviewCycle', entityId: c!.id });
  return apiResponse.success(res, 'Closed.', null);
});

// GET /performance/reviews?cycleId=&status=&overdue=1
export const listReviews = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const today = lagosYmd(new Date());
  const rows = await prisma.pwmReview.findMany({
    where: { employee: employeeScope(a), ...(q.cycleId ? { cycleId: q.cycleId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.overdue ? { status: { not: 'ACKNOWLEDGED' }, cycle: { status: 'OPEN', dueDate: { lt: fromYmd(today) } } } : {}) },
    orderBy: { createdAt: 'desc' }, take: 500, include: { cycle: { select: { name: true, dueDate: true } }, employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, department: { select: { name: true } } } } },
  });
  const names = await nameMap(rows.map((r) => r.reviewerUserId));
  return apiResponse.success(res, 'Reviews.', rows.map((r) => ({ id: r.id, status: r.status, cycle: r.cycle.name, dueDate: r.cycle.dueDate, overdue: r.status !== 'ACKNOWLEDGED' && dateOnly(r.cycle.dueDate) < today, employee: { ...r.employee, name: fullName(r.employee) }, reviewerName: r.reviewerUserId ? names.get(r.reviewerUserId) ?? null : null, managerRating: r.managerRating, selfRating: r.selfRating })));
});

// GET /performance/reviews/:id
export const getReview = handle(async (req, res) => {
  const a = access(req);
  const r = await prisma.pwmReview.findUnique({ where: { id: req.params.id }, include: { cycle: true, employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, departmentId: true } } } });
  if (!r || !canSeeEmployee(a, r.employee)) fail(404, 'Review not found.');
  return apiResponse.success(res, 'Review.', { ...r, employee: { ...r!.employee, name: fullName(r!.employee) }, canReopen: can(a, 'managePerformance') && r!.status === 'ACKNOWLEDGED' });
});

// POST /performance/reviews/:id/reopen { reason }  |  /reviewer { reviewerUserId }
export const reopenReview = handle(async (req, res) => {
  const reason = reqStr(req.body?.reason, 'Reason', 300);
  const r = await prisma.pwmReview.findUnique({ where: { id: req.params.id } });
  if (!r || r.status !== 'ACKNOWLEDGED') fail(409, 'Only an acknowledged review needs reopening.');
  await prisma.pwmReview.update({ where: { id: r!.id }, data: { status: 'MANAGER', ackedAt: null, ackComment: null, reopenedAt: new Date(), reopenReason: reason } });
  await pwmAudit(req, { action: 'REVIEW_REOPENED', entity: 'PwmEmployee', entityId: r!.employeeId, reason, meta: { reviewId: r!.id } });
  return apiResponse.success(res, 'Reopened for the manager to amend.', null);
});
export const setReviewer = handle(async (req, res) => {
  const r = await prisma.pwmReview.findUnique({ where: { id: req.params.id } });
  if (!r) fail(404, 'Review not found.');
  const uid = reqStr(req.body?.reviewerUserId, 'Reviewer', 60);
  await prisma.pwmReview.update({ where: { id: r!.id }, data: { reviewerUserId: uid } });
  await pwmAudit(req, { action: 'REVIEWER_ASSIGNED', entity: 'PwmEmployee', entityId: r!.employeeId, meta: { reviewId: r!.id, reviewerUserId: uid } });
  return apiResponse.success(res, 'Assigned.', null);
});

// GET /performance/report?cycleId=
export const performanceReport = handle(async (req, res) => {
  const a = access(req);
  const cycleId = str(req.query.cycleId, 60);
  const rows = await prisma.pwmReview.findMany({ where: { employee: employeeScope(a), ...(cycleId ? { cycleId } : {}) }, select: { status: true, managerRating: true, employee: { select: { department: { select: { name: true } } } } } });
  const dist = [1, 2, 3, 4, 5].map((n) => ({ rating: n, count: rows.filter((r) => r.managerRating === n && r.status === 'ACKNOWLEDGED').length }));
  const depts = new Map<string, { total: number; done: number; sum: number; rated: number }>();
  for (const r of rows) { const k = r.employee.department?.name ?? 'No department'; const d = depts.get(k) ?? { total: 0, done: 0, sum: 0, rated: 0 }; d.total++; if (r.status === 'ACKNOWLEDGED') { d.done++; if (r.managerRating) { d.sum += r.managerRating; d.rated++; } } depts.set(k, d); }
  return apiResponse.success(res, 'Performance report.', { total: rows.length, completed: rows.filter((r) => r.status === 'ACKNOWLEDGED').length, distribution: dist, departments: [...depts.entries()].map(([name, d]) => ({ name, total: d.total, completed: d.done, completionPct: Math.round((d.done / d.total) * 100), averageRating: d.rated ? Math.round((d.sum / d.rated) * 10) / 10 : null })) });
});

// GET /employees/:id/performance : history and trend (PRF-09)
export const employeePerformance = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const [reviews, objectives, notes, pips] = await Promise.all([
    prisma.pwmReview.findMany({ where: { employeeId: e!.id }, orderBy: { cycle: { periodEnd: 'desc' } }, include: { cycle: { select: { name: true, type: true, periodEnd: true } } } }),
    prisma.pwmObjective.findMany({ where: { employeeId: e!.id }, orderBy: { createdAt: 'desc' } }),
    prisma.pwmFeedbackNote.findMany({ where: { employeeId: e!.id }, orderBy: { createdAt: 'desc' }, take: 40 }),
    can(a, 'managePerformance') || a.level === 'EXECUTIVE' ? prisma.pwmImprovementPlan.findMany({ where: { employeeId: e!.id }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
  ]);
  const names = await nameMap(notes.map((n) => n.authorUserId));
  return apiResponse.success(res, 'Performance.', { reviews, objectives, notes: notes.map((n) => ({ ...n, authorName: names.get(n.authorUserId) ?? null })), pips, canManage: can(a, 'managePerformance') });
});

// Objectives
export const createObjective = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const employeeId = str(b.employeeId, 60); const departmentId = str(b.departmentId, 60);
  if (!employeeId && !departmentId) fail(400, 'An objective belongs to an employee or a department.');
  if (employeeId) { const e = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, departmentId: true } }); if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.'); if (a.level !== 'DEPARTMENT_HEAD' && !can(a, 'managePerformance')) fail(403, 'Forbidden. Insufficient permissions.'); }
  else if (!can(a, 'managePerformance') && !(a.level === 'DEPARTMENT_HEAD' && a.headedDepartmentIds.includes(departmentId as string))) fail(403, 'Forbidden. Insufficient permissions.');
  const weight = int(b.weight, 'Weight', 0, 100) ?? 0;
  if (employeeId) {
    const used = (await prisma.pwmObjective.aggregate({ where: { employeeId, status: 'ACTIVE' }, _sum: { weight: true } }))._sum.weight ?? 0;
    if (used + weight > 100) fail(409, `Weights would total ${used + weight}%. Active objectives for one person can add up to at most 100%.`);
  }
  const due = ymd(b.dueDate, 'Due date');
  const o = await prisma.pwmObjective.create({ data: { employeeId, departmentId, parentId: str(b.parentId, 60), title: reqStr(b.title, 'Title', 200), description: str(b.description, 2000), measure: str(b.measure, 300), target: str(b.target, 200), weight, dueDate: due ? fromYmd(due) : null, createdById: a.userId } });
  await pwmAudit(req, { action: 'OBJECTIVE_CREATED', entity: 'PwmObjective', entityId: o.id, after: { title: o.title, employeeId, departmentId } });
  return apiResponse.success(res, 'Added.', o, 201);
});
export const listDepartmentObjectives = handle(async (req, res) => {
  const a = access(req);
  const rows = await prisma.pwmObjective.findMany({ where: { departmentId: { not: null }, ...(a.level === 'DEPARTMENT_HEAD' ? { departmentId: { in: a.headedDepartmentIds.length ? a.headedDepartmentIds : ['__none__'] } } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  const depts = new Map((await prisma.pwmDepartment.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  return apiResponse.success(res, 'Department objectives.', rows.map((o) => ({ ...o, department: depts.get(o.departmentId as string) ?? null })));
});
export const updateObjective = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const o = await prisma.pwmObjective.findUnique({ where: { id: req.params.id }, include: { employee: { select: { id: true, departmentId: true } } } });
  if (!o || (o.employee && !canSeeEmployee(a, o.employee))) fail(404, 'Objective not found.');
  const data: Prisma.PwmObjectiveUncheckedUpdateInput = {};
  if (b.progress !== undefined) data.progress = int(b.progress, 'Progress', 0, 100) ?? 0;
  if (b.status !== undefined) data.status = oneOf(b.status, ['ACTIVE', 'ACHIEVED', 'MISSED', 'CANCELLED'] as const, 'Status');
  for (const k of ['title', 'description', 'measure', 'target'] as const) if (b[k] !== undefined) (data as Record<string, unknown>)[k] = str(b[k], 2000);
  const u = await prisma.pwmObjective.update({ where: { id: o!.id }, data });
  await pwmAudit(req, { action: 'OBJECTIVE_UPDATED', entity: 'PwmObjective', entityId: o!.id, after: data });
  return apiResponse.success(res, 'Saved.', u);
});

// Feedback notes and improvement plans
export const addFeedback = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const n = await prisma.pwmFeedbackNote.create({ data: { employeeId: e!.id, authorUserId: a.userId, kind: oneOf(req.body?.kind ?? 'NOTE', ['PRAISE', 'IMPROVE', 'NOTE'] as const, 'Kind'), text: reqStr(req.body?.text, 'Note', 2000), sharedWithEmployee: !!req.body?.sharedWithEmployee } });
  await pwmAudit(req, { action: 'FEEDBACK_NOTE_ADDED', entity: 'PwmEmployee', entityId: e!.id, meta: { noteId: n.id, shared: n.sharedWithEmployee } });
  return apiResponse.success(res, 'Saved.', n, 201);
});
export const createPip = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true, userId: true } });
  if (!e) fail(404, 'Employee not found.');
  if (await prisma.pwmImprovementPlan.findFirst({ where: { employeeId: e!.id, status: 'ACTIVE' } })) fail(409, 'This person already has an active plan.');
  const start = reqYmd(b.startDate, 'Start date'); const review = reqYmd(b.reviewDate, 'Review date');
  if (review <= start) fail(400, 'The review date must be after the start.');
  const p = await prisma.pwmImprovementPlan.create({ data: { employeeId: e!.id, reason: reqStr(b.reason, 'Reason', 1000), startDate: fromYmd(start), reviewDate: fromYmd(review), objectives: reqStr(b.objectives, 'Objectives', 3000), support: str(b.support, 2000), milestones: (Array.isArray(b.milestones) ? b.milestones : []).slice(0, 12).map((m: { title?: unknown; dueDate?: unknown }) => ({ title: String(m.title ?? '').slice(0, 200), dueDate: String(m.dueDate ?? '').slice(0, 10), done: false })).filter((m: { title: string }) => m.title), createdById: a.userId } });
  await pwmAudit(req, { action: 'PIP_STARTED', entity: 'PwmEmployee', entityId: e!.id, meta: { pipId: p.id }, reason: p.reason });
  return apiResponse.success(res, 'Plan started.', p, 201);
});
export const closePip = handle(async (req, res) => {
  const p = await prisma.pwmImprovementPlan.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'ACTIVE') fail(404, 'No active plan found.');
  const status = oneOf(req.body?.status, ['PASSED', 'EXTENDED', 'FAILED'] as const, 'Outcome');
  const note = reqStr(req.body?.note, 'Outcome note', 1000);
  // A failed plan is information for management. It never ends employment by itself.
  await prisma.pwmImprovementPlan.update({ where: { id: p!.id }, data: status === 'EXTENDED' ? { reviewDate: fromYmd(reqYmd(req.body?.newReviewDate, 'New review date')), outcomeNote: note } : { status, outcomeNote: note, closedAt: new Date() } });
  await pwmAudit(req, { action: `PIP_${status}`, entity: 'PwmEmployee', entityId: p!.employeeId, reason: note });
  return apiResponse.success(res, 'Recorded.', null);
});

// ── HR calendar ──────────────────────────────────────────────────────────────

// GET /calendar?from&to
export const calendar = handle(async (req, res) => {
  const a = access(req);
  const from = ymd(req.query.from, 'From') ?? lagosYmd(new Date());
  const to = ymd(req.query.to, 'To') ?? addDays(from, 30);
  if (to < from || (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 > 120) fail(400, 'Choose a range of up to 120 days.');
  const scope = employeeScope(a);
  const items: { date: string; end?: string; kind: string; title: string; link?: string }[] = [];
  const [hol, leave, contracts, probation, cycles, interviews] = await Promise.all([
    prisma.pwmHoliday.findMany({ where: { date: { gte: fromYmd(from), lte: fromYmd(to) } } }),
    can(a, 'viewLeave') ? prisma.pwmLeaveRequest.findMany({ where: { status: 'APPROVED', startDate: { lte: fromYmd(to) }, endDate: { gte: fromYmd(from) }, employee: scope }, select: { startDate: true, endDate: true, type: { select: { name: true } }, employee: { select: { id: true, firstName: true, lastName: true } } }, take: 300 }) : [],
    prisma.pwmContract.findMany({ where: { expiryDate: { gte: fromYmd(from), lte: fromYmd(to) }, status: { in: ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'] }, employee: scope }, select: { id: true, reference: true, expiryDate: true, employee: { select: { firstName: true, lastName: true } } }, take: 200 }),
    prisma.pwmEmployee.findMany({ where: { AND: [scope, { status: 'PROBATION', probationEndDate: { gte: fromYmd(from), lte: fromYmd(to) } }] }, select: { id: true, firstName: true, lastName: true, probationEndDate: true }, take: 100 }),
    prisma.pwmReviewCycle.findMany({ where: { status: 'OPEN', dueDate: { gte: fromYmd(from), lte: fromYmd(to) } } }),
    can(a, 'viewRecruitment') ? prisma.pwmInterview.findMany({ where: { status: 'SCHEDULED', scheduledAt: { gte: fromYmd(from), lte: new Date(`${to}T23:59:59Z`) } }, select: { scheduledAt: true, application: { select: { vacancyId: true, candidate: { select: { firstName: true, lastName: true } } } } }, take: 100 }) : [],
  ]);
  for (const h of hol) items.push({ date: dateOnly(h.date), kind: 'HOLIDAY', title: h.name });
  for (const l of leave) items.push({ date: dateOnly(l.startDate), end: dateOnly(l.endDate), kind: 'LEAVE', title: `${fullName(l.employee)}: ${l.type.name}`, link: `/pwm/employees/${l.employee.id}` });
  for (const c of contracts) items.push({ date: dateOnly(c.expiryDate as Date), kind: 'CONTRACT_EXPIRY', title: `${fullName(c.employee)}: ${c.reference} expires`, link: `/pwm/contracts/${c.id}` });
  for (const p of probation) items.push({ date: dateOnly(p.probationEndDate as Date), kind: 'PROBATION', title: `${fullName(p)}: probation ends`, link: `/pwm/employees/${p.id}` });
  for (const c of cycles) items.push({ date: dateOnly(c.dueDate), kind: 'REVIEW_DUE', title: `${c.name}: reviews due`, link: '/pwm/performance' });
  for (const i of interviews) items.push({ date: lagosYmd(i.scheduledAt), kind: 'INTERVIEW', title: `Interview: ${fullName(i.application.candidate)}`, link: `/pwm/recruitment/${i.application.vacancyId}` });
  items.sort((x, y) => x.date.localeCompare(y.date));
  return apiResponse.success(res, 'Calendar.', { from, to, items });
});
