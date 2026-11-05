// Scheduled SMOIS housekeeping: recurring task generation, deadline/overdue alerts,
// stalled-approval reminders and due-to-publish alerts. Every step is idempotent.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { approverUserIds, getSettings, managementUserIds, notifyMany } from '../../controllers/smois/common';
import { occurrenceDue, TASK_DONE } from './workflow';
import { smoisAudit } from './audit';

export const generateRecurringTasks = async (now = new Date()): Promise<number> => {
  const rules = await prisma.smoisRecurringRule.findMany({ where: { isActive: true } });
  let made = 0;
  for (const rule of rules) {
    const key = occurrenceDue(rule, now);
    if (!key || rule.lastGeneratedKey === key) continue;
    try {
      const task = await prisma.smoisTask.create({
        data: {
          title: rule.title, description: rule.description, type: rule.type, priority: rule.priority,
          assigneeId: rule.assigneeId, accountId: rule.accountId, createdById: rule.createdById,
          expectedDeliverable: rule.expectedDeliverable, startsAt: now,
          deadline: new Date(now.getTime() + rule.dueAfterHours * 3600_000),
          ruleId: rule.id, occurrenceKey: key,
          history: { create: { toStatus: 'PENDING', note: `Generated (${rule.recurrence.toLowerCase()})` } },
        },
        select: { id: true, assignee: { select: { userId: true } } },
      });
      await prisma.smoisRecurringRule.update({ where: { id: rule.id }, data: { lastGeneratedKey: key } });
      await smoisAudit(null, { action: 'TASK_CREATED', entity: 'SmoisTask', entityId: task.id, userId: null, meta: { rule: rule.id, occurrence: key } });
      await notifyMany([task.assignee?.userId], { title: 'Recurring task', body: rule.title, data: { link: `/smois/tasks?open=${task.id}` } });
      made++;
    } catch (err) {
      // The (ruleId, occurrenceKey) unique index means another worker already made it.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }
  return made;
};

export const sweepTaskDeadlines = async (now = new Date()): Promise<void> => {
  const soon = new Date(now.getTime() + 24 * 3600_000);
  const dueSoon = await prisma.smoisTask.findMany({
    where: { status: { notIn: TASK_DONE }, deadline: { gt: now, lte: soon }, reminderSentAt: null, assigneeId: { not: null } },
    select: { id: true, title: true, deadline: true, assignee: { select: { userId: true } } },
  });
  for (const t of dueSoon) {
    await prisma.smoisTask.update({ where: { id: t.id }, data: { reminderSentAt: now } });
    await notifyMany([t.assignee?.userId], { title: 'Task deadline approaching', body: `${t.title} is due ${t.deadline!.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}.`, data: { link: `/smois/tasks?open=${t.id}` } });
  }
  const overdue = await prisma.smoisTask.findMany({
    where: { status: { notIn: TASK_DONE }, deadline: { lt: now }, overdueNotifiedAt: null },
    select: { id: true, title: true, createdById: true, assignee: { select: { userId: true } } },
  });
  for (const t of overdue) {
    await prisma.smoisTask.update({ where: { id: t.id }, data: { overdueNotifiedAt: now } });
    await smoisAudit(null, { action: 'TASK_OVERDUE', entity: 'SmoisTask', entityId: t.id, userId: null, meta: { title: t.title } });
    await notifyMany([t.assignee?.userId, t.createdById], { title: 'Task overdue', body: t.title, data: { link: `/smois/tasks?open=${t.id}` } });
  }
};

export const sweepApprovals = async (now = new Date()): Promise<void> => {
  const { approvalReminderHours } = await getSettings();
  const cutoff = new Date(now.getTime() - approvalReminderHours * 3600_000);
  const stale = await prisma.smoisVariant.findMany({
    where: { status: { in: ['SUBMITTED', 'RESUBMITTED'] }, submittedAt: { lt: cutoff }, OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }] },
    select: { id: true, assignedReviewerId: true, content: { select: { title: true } }, account: { select: { name: true } } },
    take: 100,
  });
  if (!stale.length) return;
  const fallback = await approverUserIds();
  for (const v of stale) {
    await prisma.smoisVariant.update({ where: { id: v.id }, data: { lastReminderAt: now } });
    await notifyMany(v.assignedReviewerId ? [v.assignedReviewerId] : fallback, { title: 'Approval pending', body: `"${v.content.title}" (${v.account.name}) has waited over ${approvalReminderHours}h for review.`, data: { link: '/smois/approvals' } });
  }
};

/** Scheduled posts whose time has passed. Nothing posts them automatically yet, so say so. */
export const sweepDuePublishing = async (now = new Date()): Promise<void> => {
  const due = await prisma.smoisVariant.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lt: now }, lastReminderAt: null },
    select: { id: true, creatorId: true, content: { select: { title: true } }, account: { select: { name: true } } },
    take: 100,
  });
  if (!due.length) return;
  const mgmt = await managementUserIds();
  for (const v of due) {
    await prisma.smoisVariant.update({ where: { id: v.id }, data: { lastReminderAt: now } });
    await notifyMany([v.creatorId, ...mgmt], { title: 'Scheduled post is due', body: `"${v.content.title}" on ${v.account.name} was due. Post it on the platform and record it as published.`, data: { link: '/smois/publishing?status=SCHEDULED' } });
  }
};
