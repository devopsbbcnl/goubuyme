// Performance: review cycles and their workflow, overdue reminders (PRD 10.12).
import prisma from '../../config/db';
import { pwmAudit } from './audit';
import { hrAdminUserIds } from './people';
import { notifyPwm } from './notify';
import { addDays, dateOnly, daysBetween, fromYmd, fullName, lagosYmd } from './rules';

export class PerfError extends Error { constructor(public status: number, message: string) { super(message); } }
const bad = (status: number, message: string): never => { throw new PerfError(status, message); };

const ELIGIBLE = ['PROBATION', 'ACTIVE', 'RENEWAL_PENDING', 'CONTRACT_ISSUED', 'ON_LEAVE', 'CONTRACT_EXPIRED'] as const;

/** Create one review per eligible employee. The manager (or department head) assesses. Running it twice adds nobody twice. */
export const launchCycle = async (cycleId: string, byUserId: string, departmentIds?: string[]): Promise<{ created: number; withoutReviewer: number }> => {
  const cycle = await prisma.pwmReviewCycle.findUnique({ where: { id: cycleId } });
  if (!cycle || cycle.status !== 'OPEN') return bad(409, 'Only an open cycle can be launched.');
  const emps = await prisma.pwmEmployee.findMany({
    where: { status: { in: [...ELIGIBLE] }, hireDate: { lte: cycle.periodEnd }, ...(departmentIds?.length ? { departmentId: { in: departmentIds } } : {}), archivedAt: null },
    select: { id: true, userId: true, firstName: true, lastName: true, manager: { select: { userId: true } }, department: { select: { head: { select: { userId: true } } } } },
  });
  let created = 0; let withoutReviewer = 0;
  const reviewerNotes = new Map<string, number>();
  for (const e of emps) {
    const reviewer = e.manager?.userId ?? e.department?.head?.userId ?? null;
    const reviewerUserId = reviewer && reviewer !== e.userId ? reviewer : null;
    const r = await prisma.pwmReview.createMany({ data: [{ cycleId, employeeId: e.id, reviewerUserId }], skipDuplicates: true });
    if (!r.count) continue;
    created++;
    if (!reviewerUserId) withoutReviewer++; else reviewerNotes.set(reviewerUserId, (reviewerNotes.get(reviewerUserId) ?? 0) + 1);
    await notifyPwm([e.userId], { title: `Your ${cycle.name} review has started`, body: `Complete your self-assessment by ${dateOnly(cycle.dueDate)}.`, link: '/my-hr/reviews' });
  }
  for (const [uid, n] of reviewerNotes) await notifyPwm([uid], { title: `${n} review${n === 1 ? '' : 's'} to complete: ${cycle.name}`, body: `Assess your team by ${dateOnly(cycle.dueDate)}.`, link: '/my-hr/reviews' });
  if (withoutReviewer) await notifyPwm(await hrAdminUserIds(), { title: `${withoutReviewer} reviews have no reviewer`, body: `Set a reporting manager or department head, then assign the reviewer. Cycle: ${cycle.name}.`, link: '/pwm/performance' });
  await pwmAudit(null, { action: 'REVIEW_CYCLE_LAUNCHED', entity: 'PwmReviewCycle', entityId: cycleId, meta: { created, withoutReviewer }, userId: byUserId });
  return { created, withoutReviewer };
};

/** Who must act next on a review, as a login id. */
export const stepOwner = (r: { status: string; reviewerUserId: string | null }, employeeUserId: string | null): string | null =>
  r.status === 'SELF' ? employeeUserId : r.status === 'MANAGER' ? r.reviewerUserId : r.status === 'DISCUSSION' ? employeeUserId : null;

/** Daily: remind owners a week before the due date and every day once overdue (AC-PRF-01). */
export const reviewSweep = async (now = new Date()): Promise<number> => {
  const today = lagosYmd(now);
  const open = await prisma.pwmReview.findMany({
    where: { status: { not: 'ACKNOWLEDGED' }, cycle: { status: 'OPEN', dueDate: { lte: fromYmd(addDays(today, 7)) } } },
    include: { cycle: { select: { name: true, dueDate: true } }, employee: { select: { userId: true, firstName: true, lastName: true } } }, take: 2000,
  });
  const hr = open.length ? await hrAdminUserIds() : [];
  let n = 0;
  for (const r of open) {
    const left = daysBetween(today, dateOnly(r.cycle.dueDate));
    if (left > 7) continue;
    const owner = stepOwner(r, r.employee.userId);
    const overdue = left < 0;
    const what = r.status === 'SELF' ? 'self-assessment' : r.status === 'MANAGER' ? 'manager assessment' : 'acknowledgement';
    const people = [...new Set([owner, ...(overdue ? hr : [])].filter((x): x is string => !!x))];
    for (const uid of people) {
      const row = await prisma.pwmReminder.createMany({
        data: [{ kind: overdue ? 'REVIEW_OVERDUE' : 'REVIEW_DUE_SOON', employeeId: r.employeeId, tierKey: overdue ? 'OVERDUE' : 'DUE_SOON', severity: overdue ? 'URGENT' : 'ACTION', recipientUserId: uid, recipientRole: uid === owner ? 'STEP_OWNER' : 'HR_ADMIN', channel: 'IN_APP', idempotencyKey: `review|${r.id}|${today}|${uid}`, title: `${overdue ? '[Overdue] ' : ''}Review ${what}: ${fullName(r.employee)} (${r.cycle.name})`, body: overdue ? `Due ${dateOnly(r.cycle.dueDate)}. Please complete it.` : `Due in ${left} day${left === 1 ? '' : 's'}.`, link: uid === owner ? '/my-hr/reviews' : '/pwm/performance', requiresAck: false, nextAttemptAt: now }],
        skipDuplicates: true,
      });
      n += row.count;
    }
  }
  return n;
};
