// Leave: balances, approval chains and the request lifecycle (PRD 10.11). Used by both the HR screens and My HR.
import { Prisma, PwmLeaveStatus } from '@prisma/client';
import prisma from '../../config/db';
import { pwmAudit } from './audit';
import { getPwmConfig } from './settings';
import { applyStatus, hrAdminUserIds } from './people';
import { notifyPwm } from './notify';
import { CURRENT_STATUSES, dateOnly, fromYmd, fullName, lagosYmd } from './rules';
import { balanceOf, carryOver, daysInYear, entitlement, leaveDays, leaveEligibility } from './timeRules';

export class LeaveError extends Error { constructor(public status: number, message: string) { super(message); } }
const bad = (status: number, message: string): never => { throw new LeaveError(status, message); };

type Db = Prisma.TransactionClient | typeof prisma;
const num = (d: Prisma.Decimal | number | null | undefined): number => (d === null || d === undefined ? 0 : Number(d));

/** Public holidays from the calendar table plus any listed in settings. */
export const holidaysBetween = async (from: string, to: string): Promise<string[]> => {
  const [rows, cfg] = await Promise.all([prisma.pwmHoliday.findMany({ where: { date: { gte: fromYmd(from), lte: fromYmd(to) } }, select: { date: true } }), getPwmConfig()]);
  return [...new Set([...rows.map((r) => dateOnly(r.date)), ...cfg.holidays.filter((h) => h >= from && h <= to)])];
};

/** The balance row for a year, with entitlement refreshed from the policy and the person's service dates. */
export const ensureBalance = async (employeeId: string, typeId: string, year: number, db: Db = prisma) => {
  const [type, emp] = await Promise.all([db.pwmLeaveType.findUnique({ where: { id: typeId } }), db.pwmEmployee.findUnique({ where: { id: employeeId }, select: { hireDate: true, exitDate: true } })]);
  if (!type || !emp) return bad(404, 'Leave type or employee not found.');
  const earned = entitlement({ annualDays: num(type.annualDays), accrual: type.accrual as 'UPFRONT' | 'MONTHLY', year, hire: dateOnly(emp.hireDate), exit: emp.exitDate ? dateOnly(emp.exitDate) : null, asOf: lagosYmd(new Date()) });
  return db.pwmLeaveBalance.upsert({ where: { employeeId_typeId_year: { employeeId, typeId, year } }, create: { employeeId, typeId, year, entitled: earned }, update: { entitled: earned } });
};

/** Days already promised to requests still waiting for approval. */
const pendingDays = async (employeeId: string, typeId: string, year: number): Promise<number> => {
  const reqs = await prisma.pwmLeaveRequest.findMany({ where: { employeeId, typeId, status: 'PENDING' }, select: { startDate: true, endDate: true, startHalf: true, endHalf: true, days: true, type: { select: { countsWeekends: true } } } });
  if (!reqs.length) return 0;
  const hol = await holidaysBetween(`${year - 1}-12-01`, `${year + 1}-01-31`);
  return reqs.reduce((s, r) => s + daysInYear({ start: dateOnly(r.startDate), end: dateOnly(r.endDate), startHalf: r.startHalf, endHalf: r.endHalf, holidays: hol, countsWeekends: r.type.countsWeekends }, year), 0);
};

export interface LeaveInput { employeeId: string; typeId: string; start: string; end: string; startHalf?: boolean; endHalf?: boolean; reason?: string | null; docUrl?: string | null; handoverEmployeeId?: string | null; requestedById: string }

export interface Preview { days: number; available: number | null; warnings: string[]; conflicts: { name: string; start: string; end: string; status: string }[]; chain: { role: string; name: string | null }[] }

const personName = async (userId: string | null): Promise<string | null> => (userId ? (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? null : null);

/** Who must approve, in order. Steps that resolve to nobody are dropped; the requester never approves themself; HR is the fallback. */
export const resolveChain = async (employeeId: string, chain: string[]): Promise<{ role: string; approverUserId: string | null }[]> => {
  const e = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { userId: true, departmentId: true, manager: { select: { userId: true } }, department: { select: { head: { select: { userId: true } } } } } });
  const steps: { role: string; approverUserId: string | null }[] = [];
  for (const role of chain) {
    let id: string | null = null;
    if (role === 'SUPERVISOR') id = e?.manager?.userId ?? null;
    else if (role === 'DEPT_HEAD') id = e?.department?.head?.userId ?? null;
    else if (role === 'HR') { steps.push({ role, approverUserId: null }); continue; }
    if (!id || id === e?.userId) continue;
    if (steps.some((s) => s.approverUserId === id)) continue; // the same person never approves twice
    steps.push({ role, approverUserId: id });
  }
  return steps.length ? steps : [{ role: 'HR', approverUserId: null }];
};

export const previewLeave = async (i: Omit<LeaveInput, 'requestedById'>): Promise<Preview> => {
  const [type, emp] = await Promise.all([prisma.pwmLeaveType.findUnique({ where: { id: i.typeId } }), prisma.pwmEmployee.findUnique({ where: { id: i.employeeId }, include: { department: { select: { id: true } } } })]);
  if (!type || !type.active) return bad(404, 'That leave type is not available.');
  if (!emp) return bad(404, 'Employee not found.');
  if (i.end < i.start) bad(400, 'The end date is before the start date.');
  if ((i.startHalf || i.endHalf) && !type.allowHalfDay) bad(400, `${type.name} cannot be taken in half days.`);
  const hol = await holidaysBetween(i.start, i.end);
  const days = leaveDays({ start: i.start, end: i.end, startHalf: i.startHalf, endHalf: i.endHalf, holidays: hol, countsWeekends: type.countsWeekends });
  const warnings: string[] = [];
  if (days <= 0) bad(400, 'No working days fall in that period (weekends and public holidays are not leave).');
  const why = leaveEligibility({ afterProbationOnly: type.afterProbationOnly, minTenureMonths: type.minTenureMonths, hire: dateOnly(emp.hireDate), probationEnd: emp.probationEndDate ? dateOnly(emp.probationEndDate) : null, start: i.start, status: emp.status });
  if (why) bad(409, why);
  if (type.maxConsecutiveDays && days > type.maxConsecutiveDays) bad(409, `${type.name} is limited to ${type.maxConsecutiveDays} days at a time.`);
  if (type.docAfterDays !== null && days > type.docAfterDays && !i.docUrl) warnings.push(`A supporting document is needed for ${type.name} longer than ${type.docAfterDays} days.`);

  // Balance, year by year (a request can straddle New Year).
  const years = [...new Set([+i.start.slice(0, 4), +i.end.slice(0, 4)])];
  let available: number | null = null;
  for (const y of years) {
    const need = daysInYear({ start: i.start, end: i.end, startHalf: i.startHalf, endHalf: i.endHalf, holidays: hol, countsWeekends: type.countsWeekends }, y);
    if (!need) continue;
    const b = await ensureBalance(emp.id, type.id, y);
    const left = balanceOf({ entitled: num(b.entitled), carriedOver: num(b.carriedOver), adjusted: num(b.adjusted), used: num(b.used) }) - (await pendingDays(emp.id, type.id, y));
    available = available === null ? left : Math.min(available, left);
    if (left < need && !type.allowNegative) bad(409, `You have ${left} day${left === 1 ? '' : 's'} of ${type.name} left in ${y} and this needs ${need}.`);
  }

  const mine = await prisma.pwmLeaveRequest.findMany({ where: { employeeId: emp.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: fromYmd(i.end) }, endDate: { gte: fromYmd(i.start) } }, select: { startDate: true, endDate: true } });
  if (mine.length) bad(409, `You already have leave from ${dateOnly(mine[0].startDate)} to ${dateOnly(mine[0].endDate)} that overlaps this.`);

  const conflicts = emp.departmentId ? (await prisma.pwmLeaveRequest.findMany({
    where: { employeeId: { not: emp.id }, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: fromYmd(i.end) }, endDate: { gte: fromYmd(i.start) }, employee: { departmentId: emp.departmentId } },
    select: { startDate: true, endDate: true, status: true, employee: { select: { firstName: true, lastName: true } } }, take: 20,
  })).map((r) => ({ name: fullName(r.employee), start: dateOnly(r.startDate), end: dateOnly(r.endDate), status: r.status })) : [];
  if (conflicts.length) warnings.push(`${conflicts.length} colleague${conflicts.length === 1 ? ' is' : 's are'} also away in your department during this time.`);

  const steps = await resolveChain(emp.id, (type.approvalChain as string[]) ?? ['HR']);
  const chain = await Promise.all(steps.map(async (s) => ({ role: s.role, name: s.approverUserId ? await personName(s.approverUserId) : 'HR' })));
  return { days, available, warnings, conflicts, chain };
};

export const submitLeave = async (i: LeaveInput): Promise<{ id: string; days: number; warnings: string[] }> => {
  const pre = await previewLeave(i);
  const type = (await prisma.pwmLeaveType.findUnique({ where: { id: i.typeId } }))!;
  if (type.docAfterDays !== null && pre.days > type.docAfterDays && !i.docUrl) bad(400, `Attach the supporting document for ${type.name} longer than ${type.docAfterDays} days.`);
  const steps = await resolveChain(i.employeeId, (type.approvalChain as string[]) ?? ['HR']);
  const req = await prisma.pwmLeaveRequest.create({
    data: {
      employeeId: i.employeeId, typeId: i.typeId, startDate: fromYmd(i.start), endDate: fromYmd(i.end), startHalf: !!i.startHalf, endHalf: !!i.endHalf, days: pre.days, reason: i.reason ?? null, docUrl: i.docUrl ?? null,
      handoverEmployeeId: i.handoverEmployeeId ?? null, requestedById: i.requestedById, approvals: { create: steps.map((s, idx) => ({ step: idx, role: s.role, approverUserId: s.approverUserId })) },
    },
    select: { id: true },
  });
  const emp = await prisma.pwmEmployee.findUnique({ where: { id: i.employeeId }, select: { firstName: true, lastName: true, employeeNo: true } });
  await pwmAudit(null, { action: 'LEAVE_REQUESTED', entity: 'PwmLeave', entityId: req.id, after: { employee: emp?.employeeNo, type: type.key, start: i.start, end: i.end, days: pre.days }, userId: i.requestedById });
  await notifyStep(req.id);
  return { id: req.id, days: pre.days, warnings: pre.warnings };
};

/** Tell whoever must act on the current step. HR steps go to the HR administrators. */
const notifyStep = async (requestId: string): Promise<void> => {
  const r = await prisma.pwmLeaveRequest.findUnique({ where: { id: requestId }, include: { approvals: true, type: { select: { name: true } }, employee: { select: { firstName: true, lastName: true, employeeNo: true } } } });
  if (!r || r.status !== 'PENDING') return;
  const step = r.approvals.find((a) => a.step === r.currentStep);
  if (!step) return;
  const to = step.approverUserId ? [step.approverUserId] : await hrAdminUserIds();
  await notifyPwm(to, { title: `Leave request to review: ${fullName(r.employee)}`, body: `${r.type.name}, ${dateOnly(r.startDate)} to ${dateOnly(r.endDate)} (${num(r.days)} days).${r.reason ? ` Reason: ${r.reason}` : ''}`, link: '/my-hr/approvals' });
};

export interface Actor { userId: string; isHr: boolean }

export const decideLeave = async (requestId: string, actor: Actor, approve: boolean, note: string | null): Promise<PwmLeaveStatus> => {
  const r = await prisma.pwmLeaveRequest.findUnique({ where: { id: requestId }, include: { approvals: { orderBy: { step: 'asc' } }, type: true, employee: { select: { id: true, userId: true, firstName: true, lastName: true, employeeNo: true } } } });
  if (!r || r.status !== 'PENDING') return bad(404, 'No pending leave request found.');
  if (r.employee.userId === actor.userId) bad(403, 'You cannot decide your own leave request.');
  const step = r.approvals.find((a) => a.step === r.currentStep);
  if (!step) return bad(409, 'This request has no step waiting.');
  const allowed = step.approverUserId === actor.userId || (step.role === 'HR' && actor.isHr) || (actor.isHr && !step.approverUserId);
  if (!allowed) bad(403, 'This request is waiting for someone else.');
  if (!approve && !note) bad(400, 'Say why the request is being declined.');
  await prisma.pwmLeaveApproval.update({ where: { id: step.id }, data: { decision: approve ? 'APPROVED' : 'REJECTED', note, actedById: actor.userId, actedAt: new Date() } });

  if (!approve) {
    await prisma.pwmLeaveRequest.update({ where: { id: r.id }, data: { status: 'REJECTED', decidedAt: new Date() } });
    await pwmAudit(null, { action: 'LEAVE_REJECTED', entity: 'PwmLeave', entityId: r.id, reason: note ?? undefined, userId: actor.userId });
    await notifyPwm([r.employee.userId], { title: 'Your leave request was declined', body: `${r.type.name}, ${dateOnly(r.startDate)} to ${dateOnly(r.endDate)}.${note ? ` ${note}` : ''}`, link: '/my-hr/leave' });
    return 'REJECTED';
  }
  const last = !r.approvals.some((a) => a.step > r.currentStep);
  if (!last) {
    await prisma.pwmLeaveRequest.update({ where: { id: r.id }, data: { currentStep: r.currentStep + 1 } });
    await notifyStep(r.id);
    await pwmAudit(null, { action: 'LEAVE_STEP_APPROVED', entity: 'PwmLeave', entityId: r.id, meta: { step: step.role }, userId: actor.userId });
    return 'PENDING';
  }
  // Final approval: the balance drops now and the absence shows on the calendar (AC-LEV-03).
  const hol = await holidaysBetween(dateOnly(r.startDate), dateOnly(r.endDate));
  await prisma.$transaction(async (tx) => {
    await tx.pwmLeaveRequest.update({ where: { id: r.id }, data: { status: 'APPROVED', decidedAt: new Date() } });
    for (const y of new Set([+dateOnly(r.startDate).slice(0, 4), +dateOnly(r.endDate).slice(0, 4)])) {
      const d = daysInYear({ start: dateOnly(r.startDate), end: dateOnly(r.endDate), startHalf: r.startHalf, endHalf: r.endHalf, holidays: hol, countsWeekends: r.type.countsWeekends }, y);
      if (!d) continue;
      await ensureBalance(r.employeeId, r.typeId, y, tx);
      await tx.pwmLeaveBalance.update({ where: { employeeId_typeId_year: { employeeId: r.employeeId, typeId: r.typeId, year: y } }, data: { used: { increment: d } } });
    }
  });
  await pwmAudit(null, { action: 'LEAVE_APPROVED', entity: 'PwmLeave', entityId: r.id, after: { employee: r.employee.employeeNo, days: num(r.days) }, userId: actor.userId });
  await notifyPwm([r.employee.userId], { title: 'Your leave is approved', body: `${r.type.name}, ${dateOnly(r.startDate)} to ${dateOnly(r.endDate)} (${num(r.days)} days).`, link: '/my-hr/leave' });
  return 'APPROVED';
};

/** Cancel a request. Approved leave gives its days back (LEV-05). The employee may cancel their own; HR may cancel any. */
export const cancelLeave = async (requestId: string, actor: Actor & { employeeId?: string | null }, reason: string | null): Promise<void> => {
  const r = await prisma.pwmLeaveRequest.findUnique({ where: { id: requestId }, include: { type: true, employee: { select: { id: true, userId: true, firstName: true, lastName: true } } } });
  if (!r || !['PENDING', 'APPROVED'].includes(r.status)) return bad(404, 'No open leave request found.');
  const own = actor.employeeId === r.employeeId;
  if (!own && !actor.isHr) bad(403, 'You can only cancel your own leave.');
  if (own && !actor.isHr && r.status === 'APPROVED' && dateOnly(r.startDate) <= lagosYmd(new Date())) bad(409, 'Leave that has already started can only be cancelled by HR.');
  const hol = await holidaysBetween(dateOnly(r.startDate), dateOnly(r.endDate));
  await prisma.$transaction(async (tx) => {
    await tx.pwmLeaveRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED', cancelReason: reason, decidedAt: new Date() } });
    if (r.status === 'APPROVED') {
      for (const y of new Set([+dateOnly(r.startDate).slice(0, 4), +dateOnly(r.endDate).slice(0, 4)])) {
        const d = daysInYear({ start: dateOnly(r.startDate), end: dateOnly(r.endDate), startHalf: r.startHalf, endHalf: r.endHalf, holidays: hol, countsWeekends: r.type.countsWeekends }, y);
        if (d) await tx.pwmLeaveBalance.updateMany({ where: { employeeId: r.employeeId, typeId: r.typeId, year: y }, data: { used: { decrement: d } } });
      }
    }
  });
  await pwmAudit(null, { action: 'LEAVE_CANCELLED', entity: 'PwmLeave', entityId: r.id, reason: reason ?? undefined, userId: actor.userId });
  if (!own) await notifyPwm([r.employee.userId], { title: 'Your leave was cancelled', body: `${r.type.name}, ${dateOnly(r.startDate)} to ${dateOnly(r.endDate)}.${reason ? ` ${reason}` : ''}`, link: '/my-hr/leave' });
};

/** HR adjusts a balance with a reason (LEV-10). */
export const adjustBalance = async (employeeId: string, typeId: string, year: number, delta: number, reason: string, byUserId: string): Promise<void> => {
  await ensureBalance(employeeId, typeId, year);
  await prisma.$transaction([
    prisma.pwmLeaveBalance.update({ where: { employeeId_typeId_year: { employeeId, typeId, year } }, data: { adjusted: { increment: delta } } }),
    prisma.pwmLeaveAdjustment.create({ data: { employeeId, typeId, year, delta, reason, byUserId } }),
  ]);
  await pwmAudit(null, { action: 'LEAVE_BALANCE_ADJUSTED', entity: 'PwmEmployee', entityId: employeeId, after: { typeId, year, delta }, reason, userId: byUserId });
};

export interface YearEndRow { employee: string; employeeNo: string; type: string; remaining: number; carried: number; forfeited: number }

/** Move balances into the next year: up to the cap carries over, the rest is forfeited. Safe to preview first and to repeat (it sets, not adds). */
export const yearEnd = async (year: number, apply: boolean, byUserId: string): Promise<YearEndRow[]> => {
  const types = await prisma.pwmLeaveType.findMany({ where: { active: true, carryOverCap: { gt: 0 } } });
  const emps = await prisma.pwmEmployee.findMany({ where: { status: { in: [...CURRENT_STATUSES] } }, select: { id: true, firstName: true, lastName: true, employeeNo: true } });
  const out: YearEndRow[] = [];
  for (const t of types) {
    for (const e of emps) {
      const b = await ensureBalance(e.id, t.id, year);
      const remaining = balanceOf({ entitled: num(b.entitled), carriedOver: num(b.carriedOver), adjusted: num(b.adjusted), used: num(b.used) });
      const { carried, forfeited } = carryOver(remaining, num(t.carryOverCap));
      out.push({ employee: fullName(e), employeeNo: e.employeeNo, type: t.name, remaining, carried, forfeited });
      if (apply) {
        await ensureBalance(e.id, t.id, year + 1);
        await prisma.pwmLeaveBalance.update({ where: { employeeId_typeId_year: { employeeId: e.id, typeId: t.id, year: year + 1 } }, data: { carriedOver: carried } });
      }
    }
  }
  if (apply) await pwmAudit(null, { action: 'LEAVE_YEAR_END', entity: 'PwmLeaveType', entityId: `year-${year}`, meta: { rows: out.length, carried: out.reduce((s, r) => s + r.carried, 0), forfeited: out.reduce((s, r) => s + r.forfeited, 0) }, userId: byUserId });
  return out;
};

/** Long leave (maternity etc.) puts the employee On leave for the period and back to Active afterwards (LEV-11). */
export const leaveStatusSweep = async (now = new Date()): Promise<number> => {
  const today = lagosYmd(now);
  let changed = 0;
  const current = await prisma.pwmLeaveRequest.findMany({ where: { status: 'APPROVED', type: { setsOnLeaveStatus: true }, startDate: { lte: fromYmd(today) }, endDate: { gte: fromYmd(today) } }, select: { employeeId: true, type: { select: { name: true } }, employee: { select: { status: true } } } });
  for (const r of current) {
    if (['ACTIVE', 'PROBATION'].includes(r.employee.status)) {
      const res = await applyStatus({ employeeId: r.employeeId, to: 'ON_LEAVE', reason: `Approved leave: ${r.type.name}`, bySystem: true, workflow: true });
      if (res.ok) changed++;
    }
  }
  const onLeave = await prisma.pwmEmployee.findMany({ where: { status: 'ON_LEAVE' }, select: { id: true, probationEndDate: true, statusLog: { orderBy: { createdAt: 'desc' }, take: 1, select: { reason: true } } } });
  const stillAway = new Set(current.map((c) => c.employeeId));
  for (const e of onLeave) {
    if (stillAway.has(e.id) || !e.statusLog[0]?.reason.startsWith('Approved leave:')) continue; // only reverse what leave itself set
    const res = await applyStatus({ employeeId: e.id, to: e.probationEndDate ? 'PROBATION' : 'ACTIVE', reason: 'Approved leave has ended', bySystem: true, workflow: true });
    if (res.ok) changed++;
  }
  return changed;
};
