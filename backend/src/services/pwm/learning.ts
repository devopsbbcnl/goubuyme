// Learning: budgets, enrolment approval, mandatory-training compliance (PRD 10.13).
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { pwmAudit } from './audit';
import { supervisorUserId } from './attendance';
import { hrAdminUserIds } from './people';
import { notifyPwm } from './notify';
import { CURRENT_STATUSES, addMonths, dateOnly, fullName, lagosYmd } from './rules';

export class LearningError extends Error { constructor(public status: number, message: string) { super(message); } }
const bad = (status: number, message: string): never => { throw new LearningError(status, message); };
const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

export interface BudgetStatus { amount: number; committed: number; actual: number; remaining: number }

/** Budget, what is promised (approved but not finished) and what is spent (completed) for a department in a year. */
export const budgetFor = async (departmentId: string | null, year: number): Promise<BudgetStatus> => {
  const b = await prisma.pwmTrainingBudget.findFirst({ where: { departmentId, year } });
  const range = { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) };
  const scope: Prisma.PwmEnrolmentWhereInput = { createdAt: range, ...(departmentId ? { employee: { departmentId } } : {}) };
  const [committed, actual] = await Promise.all([
    prisma.pwmEnrolment.aggregate({ where: { ...scope, status: 'APPROVED' }, _sum: { cost: true } }),
    prisma.pwmEnrolment.aggregate({ where: { ...scope, status: 'COMPLETED' }, _sum: { cost: true } }),
  ]);
  const amount = num(b?.amount); const c = num(committed._sum.cost); const a = num(actual._sum.cost);
  return { amount, committed: c, actual: a, remaining: amount - c - a };
};

export const requestEnrolment = async (courseId: string, employeeId: string, byUserId: string, assigned = false) => {
  const [course, emp] = await Promise.all([prisma.pwmCourse.findUnique({ where: { id: courseId } }), prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, userId: true, firstName: true, lastName: true } })]);
  if (!course || !course.active) return bad(404, 'That course is not available.');
  if (!emp) return bad(404, 'Employee not found.');
  if (await prisma.pwmEnrolment.findFirst({ where: { courseId, employeeId, status: { in: ['REQUESTED', 'APPROVED'] } } })) bad(409, 'There is already an open enrolment for this course.');
  const approver = assigned ? null : await supervisorUserId(employeeId);
  const e = await prisma.pwmEnrolment.create({ data: { courseId, employeeId, cost: course.cost, assigned, status: assigned ? 'APPROVED' : 'REQUESTED', requestedById: byUserId, approverUserId: approver, ...(assigned ? { decidedById: byUserId, decidedAt: new Date() } : {}) } });
  await pwmAudit(null, { action: assigned ? 'TRAINING_ASSIGNED' : 'TRAINING_REQUESTED', entity: 'PwmEmployee', entityId: employeeId, meta: { course: course.title, enrolmentId: e.id }, userId: byUserId });
  if (assigned) await notifyPwm([emp.userId], { title: `Training assigned: ${course.title}`, body: course.mandatory ? 'This training is mandatory.' : 'Open My HR → Learning for details.', link: '/my-hr/learning' });
  else await notifyPwm(approver ? [approver] : await hrAdminUserIds(), { title: `Training request: ${fullName(emp)}`, body: `${course.title}${num(course.cost) ? `, cost ₦${num(course.cost).toLocaleString('en-NG')}` : ''}.`, link: '/my-hr/approvals' });
  return e;
};

export const decideEnrolment = async (id: string, actor: { userId: string; isHr: boolean }, approve: boolean, note: string | null): Promise<{ status: string; overBudget: boolean }> => {
  const e = await prisma.pwmEnrolment.findUnique({ where: { id }, include: { course: true, employee: { select: { userId: true, departmentId: true } } } });
  if (!e || e.status !== 'REQUESTED') return bad(404, 'No pending request found.');
  if (e.employee.userId === actor.userId) bad(403, 'You cannot decide your own request.');
  if (e.approverUserId !== actor.userId && !actor.isHr) bad(403, 'This is waiting for someone else.');
  if (!approve && !note) bad(400, 'Say why it is declined.');
  const year = new Date().getFullYear();
  const bud = await budgetFor(e.employee.departmentId, year);
  const over = bud.amount > 0 && num(e.cost) > bud.remaining;
  await prisma.pwmEnrolment.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), note } });
  await pwmAudit(null, { action: approve ? 'TRAINING_APPROVED' : 'TRAINING_DECLINED', entity: 'PwmEmployee', entityId: e.employeeId, reason: note ?? undefined, meta: { course: e.course.title, overBudget: over }, userId: actor.userId });
  await notifyPwm([e.employee.userId], { title: `Training request ${approve ? 'approved' : 'declined'}: ${e.course.title}`, body: note ?? '', link: '/my-hr/learning' });
  return { status: approve ? 'APPROVED' : 'REJECTED', overBudget: approve && over };
};

export interface ComplianceRow { courseId: string; course: string; recurrenceMonths: number | null; total: number; compliant: number; overdue: { id: string; name: string; employeeNo: string; lastDone: string | null }[] }

/** For each mandatory course, who is up to date. Recurring courses lapse after their interval. */
export const mandatoryCompliance = async (departmentIds?: string[]): Promise<ComplianceRow[]> => {
  const courses = await prisma.pwmCourse.findMany({ where: { mandatory: true, active: true } });
  if (!courses.length) return [];
  const emps = await prisma.pwmEmployee.findMany({ where: { status: { in: [...CURRENT_STATUSES] }, archivedAt: null, ...(departmentIds ? { departmentId: { in: departmentIds } } : {}) }, select: { id: true, employeeNo: true, firstName: true, lastName: true } });
  const done = await prisma.pwmEnrolment.findMany({ where: { courseId: { in: courses.map((c) => c.id) }, status: 'COMPLETED', employeeId: { in: emps.map((e) => e.id) } }, select: { courseId: true, employeeId: true, completedAt: true } });
  const today = lagosYmd(new Date());
  return courses.map((c) => {
    const overdue: ComplianceRow['overdue'] = []; let compliant = 0;
    for (const e of emps) {
      const last = done.filter((d) => d.courseId === c.id && d.employeeId === e.id && d.completedAt).map((d) => dateOnly(d.completedAt as Date)).sort().pop() ?? null;
      const ok = !!last && (!c.recurrenceMonths || addMonths(last, c.recurrenceMonths) >= today);
      if (ok) compliant++; else overdue.push({ id: e.id, name: fullName(e), employeeNo: e.employeeNo, lastDone: last });
    }
    return { courseId: c.id, course: c.title, recurrenceMonths: c.recurrenceMonths, total: emps.length, compliant, overdue };
  });
};

/** Give a mandatory course to everyone who is not up to date and has nothing open for it. */
export const assignMandatory = async (courseId: string, byUserId: string): Promise<number> => {
  const rows = (await mandatoryCompliance()).find((r) => r.courseId === courseId);
  if (!rows) return bad(404, 'That course is not a mandatory course.');
  let n = 0;
  for (const o of rows.overdue) {
    try { await requestEnrolment(courseId, o.id, byUserId, true); n++; } catch (e) { if (!(e instanceof LearningError)) throw e; }
  }
  return n;
};
