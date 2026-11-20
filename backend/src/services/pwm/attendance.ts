// Attendance: clocking, the daily absence sweep, corrections and overtime (PRD 10.10).
// Location is never requested or stored (ATT-08 default, AC-ATT-03).
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { pwmAudit } from './audit';
import { hrAdminUserIds } from './people';
import { notifyPwm } from './notify';
import { CURRENT_STATUSES, addDays, dateOnly, fromYmd, fullName, lagosYmd } from './rules';
import { DEFAULT_SCHEDULE, ScheduleLike, earlyMinutes, isWorkDay, lagosMinutes, lateMinutes, workedMinutes } from './timeRules';
import { holidaysBetween } from './leave';

export class AttendanceError extends Error { constructor(public status: number, message: string) { super(message); } }
const bad = (status: number, message: string): never => { throw new AttendanceError(status, message); };

export const defaultSchedule = async () => {
  const s = await prisma.pwmSchedule.findFirst({ where: { isDefault: true, active: true } });
  return s ?? prisma.pwmSchedule.create({ data: { ...DEFAULT_SCHEDULE } });
};

const scheduleFor = async (employeeId: string): Promise<ScheduleLike & { id: string }> => {
  const e = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { schedule: true } });
  const s = e?.schedule ?? (await defaultSchedule());
  return { id: s.id, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, graceMinutes: s.graceMinutes, workDays: s.workDays as number[] };
};

/** Lagos is UTC+1 all year, so a local time on a date maps to a fixed instant. */
export const toInstant = (ymd: string, hhmm: string): Date => new Date(`${ymd}T${hhmm}:00+01:00`);

export const clockIn = async (employeeId: string, now = new Date()) => {
  const today = lagosYmd(now);
  const [emp, sched] = await Promise.all([prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { status: true, workArrangement: true } }), scheduleFor(employeeId)]);
  if (!emp) bad(404, 'Employee not found.');
  if (!emp || !['ACTIVE', 'PROBATION', 'RENEWAL_PENDING', 'CONTRACT_ISSUED', 'CONTRACT_EXPIRED', 'NOTICE_PERIOD'].includes(emp.status)) bad(409, 'Clocking in is not available for your current status.');
  const existing = await prisma.pwmAttendance.findUnique({ where: { employeeId_date: { employeeId, date: fromYmd(today) } } });
  if (existing?.clockIn) bad(409, 'You have already clocked in today.');
  const leave = await prisma.pwmLeaveRequest.findFirst({ where: { employeeId, status: 'APPROVED', startDate: { lte: fromYmd(today) }, endDate: { gte: fromYmd(today) } }, select: { id: true } });
  if (leave) bad(409, 'You are on approved leave today.');
  const late = lateMinutes(lagosMinutes(now), sched);
  const status = late > 0 ? 'LATE' : emp!.workArrangement === 'REMOTE' ? 'REMOTE' : 'PRESENT';
  return prisma.pwmAttendance.upsert({
    where: { employeeId_date: { employeeId, date: fromYmd(today) } },
    create: { employeeId, date: fromYmd(today), clockIn: now, status, minutesLate: late },
    // A record the absence sweep wrote earlier can still be claimed by a real clock-in.
    update: { clockIn: now, status, minutesLate: late, explanation: null },
  });
};

export const clockOut = async (employeeId: string, now = new Date()) => {
  const today = lagosYmd(now);
  const [rec, sched] = await Promise.all([prisma.pwmAttendance.findUnique({ where: { employeeId_date: { employeeId, date: fromYmd(today) } } }), scheduleFor(employeeId)]);
  if (!rec?.clockIn) return bad(409, 'Clock in first.');
  if (rec.clockOut) bad(409, 'You have already clocked out today.');
  return prisma.pwmAttendance.update({ where: { id: rec.id }, data: { clockOut: now, minutesWorked: workedMinutes(rec.clockIn, now, sched.breakMinutes), minutesEarly: earlyMinutes(lagosMinutes(now), sched) } });
};

/** The person who should hear about and decide on an employee's day-to-day items. */
export const supervisorUserId = async (employeeId: string): Promise<string | null> => {
  const e = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { userId: true, manager: { select: { userId: true } }, department: { select: { head: { select: { userId: true } } } } } });
  const id = e?.manager?.userId ?? e?.department?.head?.userId ?? null;
  return id && id !== e?.userId ? id : null;
};

/** Days with no clock-in, no approved leave and no holiday become Absent and the supervisor is told (ATT-04). */
export const absenceSweep = async (now = new Date()): Promise<number> => {
  const today = lagosYmd(now);
  const days = [addDays(today, -1), addDays(today, -2), addDays(today, -3)];
  const hol = await holidaysBetween(days[2], days[0]);
  const emps = await prisma.pwmEmployee.findMany({ where: { status: { in: ['ACTIVE', 'PROBATION', 'RENEWAL_PENDING', 'CONTRACT_ISSUED', 'CONTRACT_EXPIRED', 'NOTICE_PERIOD'] }, archivedAt: null }, select: { id: true, firstName: true, lastName: true, hireDate: true, schedule: true }, take: 5000 });
  const dflt = await defaultSchedule();
  const bySup = new Map<string, string[]>();
  let n = 0;
  for (const e of emps) {
    const s = e.schedule ?? dflt;
    const sched: ScheduleLike = { startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, graceMinutes: s.graceMinutes, workDays: s.workDays as number[] };
    for (const d of days) {
      if (d < dateOnly(e.hireDate) || !isWorkDay(d, sched, hol)) continue;
      const exists = await prisma.pwmAttendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date: fromYmd(d) } }, select: { id: true } });
      if (exists) continue;
      const leave = await prisma.pwmLeaveRequest.findFirst({ where: { employeeId: e.id, status: 'APPROVED', startDate: { lte: fromYmd(d) }, endDate: { gte: fromYmd(d) } }, select: { id: true } });
      const created = await prisma.pwmAttendance.create({ data: { employeeId: e.id, date: fromYmd(d), status: leave ? 'ON_LEAVE' : 'ABSENT', source: 'SYSTEM' } }).catch(() => null);
      if (!created || leave) continue;
      n++;
      const sup = await supervisorUserId(e.id);
      if (sup) bySup.set(sup, [...(bySup.get(sup) ?? []), `${fullName(e)} (${d})`]);
    }
  }
  for (const [sup, names] of bySup) await notifyPwm([sup], { title: `${names.length} absence${names.length === 1 ? '' : 's'} with no clock-in or leave`, body: `${names.slice(0, 10).join(', ')}${names.length > 10 ? ` and ${names.length - 10} more` : ''}. The employee can explain in My HR.`, link: '/my-hr/approvals' });
  return n;
};

// ── Corrections ──────────────────────────────────────────────────────────────

export const requestCorrection = async (employeeId: string, date: string, inT: string | null, outT: string | null, reason: string, byUserId: string) => {
  if (date > lagosYmd(new Date())) bad(400, 'You cannot correct a day that has not happened.');
  if (!inT && !outT) bad(400, 'Give the clock-in time, the clock-out time, or both.');
  for (const t of [inT, outT]) if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) bad(400, 'Times must look like 08:05.');
  if (await prisma.pwmAttendanceCorrection.findFirst({ where: { employeeId, date: fromYmd(date), status: 'PENDING' } })) bad(409, 'A correction for that day is already waiting.');
  const cur = await prisma.pwmAttendance.findUnique({ where: { employeeId_date: { employeeId, date: fromYmd(date) } } });
  const approver = await supervisorUserId(employeeId);
  const c = await prisma.pwmAttendanceCorrection.create({
    data: { employeeId, date: fromYmd(date), originalIn: cur?.clockIn ?? null, originalOut: cur?.clockOut ?? null, requestedIn: inT ? toInstant(date, inT) : cur?.clockIn ?? null, requestedOut: outT ? toInstant(date, outT) : cur?.clockOut ?? null, reason, approverUserId: approver },
  });
  const e = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true } });
  await notifyPwm(approver ? [approver] : await hrAdminUserIds(), { title: `Attendance correction to review: ${e ? fullName(e) : ''}`, body: `${date}: ${reason}`, link: '/my-hr/approvals' });
  await pwmAudit(null, { action: 'ATTENDANCE_CORRECTION_REQUESTED', entity: 'PwmEmployee', entityId: employeeId, meta: { date, correctionId: c.id }, reason, userId: byUserId });
  return c;
};

export const decideCorrection = async (id: string, actor: { userId: string; isHr: boolean }, approve: boolean, note: string | null) => {
  const c = await prisma.pwmAttendanceCorrection.findUnique({ where: { id }, include: { employee: { select: { userId: true, id: true } } } });
  if (!c || c.status !== 'PENDING') return bad(404, 'No pending correction found.');
  if (c.employee.userId === actor.userId) bad(403, 'You cannot decide your own correction.');
  if (c.approverUserId !== actor.userId && !actor.isHr) bad(403, 'This is waiting for someone else.');
  if (!approve && !note) bad(400, 'Say why it is declined.');
  const sched = await scheduleFor(c.employeeId);
  await prisma.$transaction(async (tx) => {
    await tx.pwmAttendanceCorrection.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), note } });
    if (!approve) return;
    const day = dateOnly(c.date);
    const inAt = c.requestedIn; const outAt = c.requestedOut;
    const late = inAt ? lateMinutes(lagosMinutes(inAt), sched) : 0;
    const data: Prisma.PwmAttendanceUncheckedUpdateInput = {
      clockIn: inAt, clockOut: outAt, status: inAt ? (late > 0 ? 'LATE' : 'PRESENT') : 'ABSENT', minutesLate: late,
      minutesWorked: inAt && outAt ? workedMinutes(inAt, outAt, sched.breakMinutes) : 0, minutesEarly: outAt ? earlyMinutes(lagosMinutes(outAt), sched) : 0, source: 'CORRECTED', explanation: null,
    };
    await tx.pwmAttendance.upsert({ where: { employeeId_date: { employeeId: c.employeeId, date: fromYmd(day) } }, create: { ...(data as Prisma.PwmAttendanceUncheckedCreateInput), employeeId: c.employeeId, date: fromYmd(day) }, update: data });
  });
  await pwmAudit(null, { action: approve ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_DECLINED', entity: 'PwmEmployee', entityId: c.employeeId, reason: note ?? undefined, meta: { date: dateOnly(c.date), correctionId: id, originalIn: c.originalIn, originalOut: c.originalOut, requestedIn: c.requestedIn, requestedOut: c.requestedOut }, userId: actor.userId });
  await notifyPwm([c.employee.userId], { title: `Attendance correction ${approve ? 'approved' : 'declined'}`, body: `${dateOnly(c.date)}${note ? `: ${note}` : ''}`, link: '/my-hr/attendance' });
};

// ── Overtime ─────────────────────────────────────────────────────────────────

export const requestOvertime = async (employeeId: string, date: string, hours: number, reason: string, byUserId: string) => {
  if (!(hours > 0 && hours <= 12)) bad(400, 'Overtime hours must be between 0.5 and 12.');
  if (date > lagosYmd(new Date())) bad(400, 'Overtime is requested for work already done.');
  const approver = await supervisorUserId(employeeId);
  const o = await prisma.pwmOvertime.create({ data: { employeeId, date: fromYmd(date), hours, reason, approverUserId: approver } });
  const e = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true } });
  await notifyPwm(approver ? [approver] : await hrAdminUserIds(), { title: `Overtime to approve: ${e ? fullName(e) : ''}`, body: `${hours} hours on ${date}. ${reason}`, link: '/my-hr/approvals' });
  await pwmAudit(null, { action: 'OVERTIME_REQUESTED', entity: 'PwmEmployee', entityId: employeeId, meta: { date, hours }, userId: byUserId });
  return o;
};

export const decideOvertime = async (id: string, actor: { userId: string; isHr: boolean }, approve: boolean, note: string | null) => {
  const o = await prisma.pwmOvertime.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
  if (!o || o.status !== 'PENDING') return bad(404, 'No pending overtime request found.');
  if (o.employee.userId === actor.userId) bad(403, 'You cannot approve your own overtime.');
  if (o.approverUserId !== actor.userId && !actor.isHr) bad(403, 'This is waiting for someone else.');
  if (!approve && !note) bad(400, 'Say why it is declined.');
  await prisma.pwmOvertime.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), note } });
  await pwmAudit(null, { action: approve ? 'OVERTIME_APPROVED' : 'OVERTIME_DECLINED', entity: 'PwmEmployee', entityId: o.employeeId, reason: note ?? undefined, meta: { overtimeId: id }, userId: actor.userId });
  await notifyPwm([o.employee.userId], { title: `Overtime ${approve ? 'approved' : 'declined'}`, body: `${dateOnly(o.date)}, ${Number(o.hours)} hours${note ? `: ${note}` : ''}`, link: '/my-hr/attendance' });
};

export { CURRENT_STATUSES };
