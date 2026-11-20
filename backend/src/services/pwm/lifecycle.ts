// Time-driven HR work that is not a reminder: scheduled status changes, contracts whose start date has arrived,
// and alerts for checklist tasks that fall due (including the access-revocation tasks on the last working day).
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { activateContract, commitStatus } from './people';
import { dateOnly, fromYmd, lagosYmd } from './rules';

export interface SweepResult { statusApplied: number; contractsActivated: number; taskAlerts: number }

export const runLifecycleSweep = async (now = new Date()): Promise<SweepResult> => {
  const today = lagosYmd(now);
  const out: SweepResult = { statusApplied: 0, contractsActivated: 0, taskAlerts: 0 };

  // Scheduled status changes whose day has come (STS-04). The employee must still be where the change expects.
  const due = await prisma.pwmStatusChange.findMany({
    where: { appliedAt: null, approvalStatus: { in: ['NOT_REQUIRED', 'APPROVED'] }, effectiveDate: { lte: fromYmd(today) }, bySystem: false },
    include: { employee: { select: { status: true } } }, take: 200,
  });
  for (const c of due) {
    if (c.employee.status !== c.fromStatus) {
      await prisma.pwmStatusChange.update({ where: { id: c.id }, data: { appliedAt: now, decisionNote: `Not applied: the employee was no longer ${c.fromStatus}.` } });
      continue;
    }
    const r = await commitStatus({ existingChangeId: c.id, employeeId: c.employeeId, to: c.toStatus, reason: c.reason, effectiveDate: dateOnly(c.effectiveDate), requestedById: c.requestedById, approvedById: c.approvedById, exitReason: c.reason });
    if (r.ok) out.statusApplied++;
    else await prisma.pwmStatusChange.update({ where: { id: c.id }, data: { appliedAt: now, decisionNote: `Not applied: ${r.reason}` } });
  }

  // Signed contracts take effect on their start date and replace their predecessor (REN-06).
  const signed = await prisma.pwmContract.findMany({ where: { status: 'SIGNED', commencementDate: { lte: fromYmd(today) } }, select: { id: true }, take: 200 });
  for (const c of signed) if (await activateContract(c.id, null, now)) out.contractsActivated++;

  // Tasks due today for a named person: one in-app alert a day until they are done.
  const tasks = await prisma.pwmChecklistTask.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, assigneeUserId: { not: null }, dueDate: { lte: fromYmd(today) }, checklist: { status: 'OPEN' } },
    include: { checklist: { select: { kind: true, employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } } } } }, take: 300,
  });
  for (const t of tasks) {
    const e = t.checklist.employee;
    const overdue = t.dueDate && dateOnly(t.dueDate) < today;
    const r = await prisma.pwmReminder.createMany({
      data: [{
        kind: 'TASK', employeeId: e.id, tierKey: 'TASK', severity: overdue ? 'URGENT' : 'ACTION', recipientUserId: t.assigneeUserId as string, recipientRole: t.ownerRole, channel: 'IN_APP',
        idempotencyKey: `task|${t.id}|${today}`, title: `${overdue ? '[Overdue] ' : ''}${t.checklist.kind === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'} task: ${t.title}`,
        body: `${e.firstName} ${e.lastName} (${e.employeeNo}). Due ${t.dueDate ? dateOnly(t.dueDate) : 'now'}.`, link: `/pwm/checklists/${t.checklistId}`, nextAttemptAt: now,
      }],
      skipDuplicates: true,
    });
    out.taskAlerts += r.count;
  }
  if (out.statusApplied || out.contractsActivated) logger.info(`PWM lifecycle: ${out.statusApplied} status changes, ${out.contractsActivated} contracts activated`);
  return out;
};
