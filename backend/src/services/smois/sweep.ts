// Scheduled SMOIS housekeeping: recurring task generation, deadline/overdue alerts,
// stalled-approval reminders and due-to-publish alerts. Every step is idempotent.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { approverUserIds, getSettings, managementUserIds, notifyMany } from '../../controllers/smois/common';
import { occurrenceDue, TASK_DONE } from './workflow';
import { negativeSpike } from './community';
import { detectAnomaly } from './predict';
import { targetActual } from './insights';
import { smoisAudit } from './audit';
import { claimJobRun } from '../../utils/jobLock';
import { lastFinishedPeriodStart } from '../../controllers/smois/report.controller';
import { lagosYmd } from '../../controllers/smois/common';

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

/**
 * Weekly reports are due on Monday for the week just ended; the monthly department report on the 1st.
 * One reminder per period (claimed in JobLock so several workers can't double-send), only to people who haven't filed.
 */
export const sweepReportsDue = async (now = new Date()): Promise<void> => {
  const today = lagosYmd(now);
  const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  const dom = Number(today.slice(8, 10));

  if (dow === 0) {
    const week = lastFinishedPeriodStart('WEEKLY_MANAGER', today);
    if (await claimJobRun('smois-weekly-due:' + week)) {
      const members = await prisma.smoisMember.findMany({ where: { isActive: true, role: { in: ['MANAGER', 'MANAGEMENT'] } }, select: { userId: true } });
      const filed = await prisma.smoisReport.findMany({ where: { type: 'WEEKLY_MANAGER', periodStart: new Date(week + 'T00:00:00Z'), status: { in: ['SUBMITTED', 'APPROVED'] } }, select: { authorId: true } });
      const done = new Set(filed.map((f) => f.authorId));
      await notifyMany(members.map((m) => m.userId).filter((id) => !done.has(id)), { title: 'Weekly report due', body: 'Your report for the week starting ' + week + ' is due. The figures are pre-filled; add your commentary.', data: { link: '/smois/reports' } });
    }
  }
  if (dom === 1) {
    const month = lastFinishedPeriodStart('MONTHLY_DEPARTMENT', today);
    if (await claimJobRun('smois-monthly-due:' + month)) {
      await notifyMany(await managementUserIds(), { title: 'Monthly report due', body: 'The department report for the month starting ' + month + ' is ready to generate.', data: { link: '/smois/reports' } });
    }
  }
};

/** Conversations that passed their response target with no reply. Each is flagged once, to its owner or to management. */
export const sweepResponseTargets = async (now = new Date()): Promise<void> => {
  const late = await prisma.smoisConversation.findMany({
    where: { status: { in: ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'] }, firstResponseAt: null, slaDueAt: { lt: now }, slaBreachNotifiedAt: null },
    select: { id: true, number: true, priority: true, assignedMemberId: true, account: { select: { name: true } } }, take: 100,
  });
  if (!late.length) return;
  const mgmt = await managementUserIds();
  for (const c of late) {
    await prisma.smoisConversation.update({ where: { id: c.id }, data: { slaBreachNotifiedAt: now } });
    const owner = c.assignedMemberId ? await prisma.smoisMember.findUnique({ where: { id: c.assignedMemberId }, select: { userId: true } }) : null;
    await smoisAudit(null, { action: 'RESPONSE_TARGET_MISSED', entity: 'SmoisConversation', entityId: c.id, userId: null, meta: { priority: c.priority } });
    await notifyMany(owner ? [owner.userId, ...(c.priority === 'HIGH' ? mgmt : [])] : mgmt, { title: 'Response target missed', body: '#' + c.number + ' on ' + c.account.name + ' (' + c.priority.toLowerCase() + ') has had no reply.', data: { link: '/smois/inbox?open=' + c.id } });
  }
};

/** Library assets whose usage rights end within two weeks (or already have): tell the uploader and management once. */
export const sweepAssetExpiry = async (now = new Date()): Promise<void> => {
  const soon = new Date(now.getTime() + 14 * 86_400_000);
  const assets = await prisma.smoisAsset.findMany({ where: { archivedAt: null, expiresAt: { lte: soon }, expiryNotifiedAt: null }, select: { id: true, name: true, expiresAt: true, uploadedById: true }, take: 100 });
  if (!assets.length) return;
  const mgmt = await managementUserIds();
  for (const a of assets) {
    await prisma.smoisAsset.update({ where: { id: a.id }, data: { expiryNotifiedAt: now } });
    const expired = !!a.expiresAt && a.expiresAt <= now;
    await notifyMany([a.uploadedById, ...mgmt], { title: expired ? 'Library asset expired' : 'Library asset expiring', body: '"' + a.name + '" ' + (expired ? 'has expired and can no longer be attached to content.' : 'expires on ' + a.expiresAt!.toLocaleDateString('en-NG') + '. Renew it or replace it.'), data: { link: '/smois/media' } });
  }
};

/** A sudden run of negative mentions: tell management once a day. */
export const sweepReputation = async (now = new Date()): Promise<void> => {
  const day = 86_400_000;
  const [last, prev] = await Promise.all([
    prisma.smoisMention.count({ where: { sentiment: 'NEGATIVE', occurredAt: { gte: new Date(now.getTime() - day) } } }),
    prisma.smoisMention.count({ where: { sentiment: 'NEGATIVE', occurredAt: { gte: new Date(now.getTime() - 8 * day), lt: new Date(now.getTime() - day) } } }),
  ]);
  const spike = negativeSpike(last, prev);
  if (!spike.spike) return;
  if (!(await claimJobRun('smois-negative-spike:' + lagosYmd(now)))) return;
  await notifyMany(await managementUserIds(), { title: 'Reputation alert', body: last + ' negative mentions in the last 24 hours (usual: about ' + spike.avgDaily + ' a day). Mentions are logged by staff, so check the listening page.', data: { link: '/smois/listening' } });
};

/** Tell people when a target becomes at risk, is achieved or exceeded, or is missed. Each change is announced once. */
export const sweepTargetStatus = async (now = new Date()): Promise<void> => {
  const targets = await prisma.smoisTarget.findMany({ where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }, take: 200 });
  if (!targets.length) return;
  const mgmt = await managementUserIds();
  for (const t of targets) {
    const p = await targetActual(t, now);
    if (p.status === t.lastNotifiedStatus) continue;
    await prisma.smoisTarget.update({ where: { id: t.id }, data: { lastNotifiedStatus: p.status } });
    if (!['AT_RISK', 'ACHIEVED', 'EXCEEDED', 'MISSED'].includes(p.status)) continue; // quiet states just reset the memory
    const member = t.memberId ? await prisma.smoisMember.findUnique({ where: { id: t.memberId }, select: { userId: true } }) : null;
    const label = p.status === 'AT_RISK' ? 'at risk' : p.status.toLowerCase();
    await notifyMany([member?.userId, t.supervisorId, ...mgmt], { title: 'Target ' + label, body: t.name + (p.percent !== null ? ' (' + p.percent + '% of the goal)' : ''), data: { link: '/smois/targets' }, email: p.status !== 'AT_RISK' });
  }
};

/** A reading far outside an account's recent pattern: tell management and the people assigned to it, once a day. */
export const sweepUnusualPerformance = async (now = new Date()): Promise<void> => {
  const today = lagosYmd(now);
  const since = new Date(now.getTime() - 20 * 86_400_000);
  const accounts = await prisma.smoisAccount.findMany({
    where: { archivedAt: null }, select: { id: true, name: true, assignments: { where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { member: { select: { userId: true } } } }, snapshots: { where: { snapshotDate: { gte: since } }, orderBy: { snapshotDate: 'asc' }, select: { snapshotDate: true, reach: true, engagement: true } } },
  });
  const mgmt = await managementUserIds();
  for (const a of accounts) {
    const latest = a.snapshots[a.snapshots.length - 1];
    if (!latest || (now.getTime() - latest.snapshotDate.getTime()) / 86_400_000 > 2.5) continue; // only react to fresh readings
    for (const metric of ['reach', 'engagement'] as const) {
      const series = a.snapshots.map((s) => s[metric]).filter((v): v is number => v !== null);
      const r = detectAnomaly(series);
      if (!r.flagged) continue;
      if (!(await claimJobRun('smois-anomaly:' + a.id + ':' + metric + ':' + today))) continue;
      await smoisAudit(null, { action: 'UNUSUAL_PERFORMANCE', entity: 'SmoisAccount', entityId: a.id, userId: null, meta: { metric, last: r.last, mean: r.mean, pctChange: r.pctChange } });
      await notifyMany([...a.assignments.map((x) => x.member.userId), ...mgmt], { title: 'Unusual ' + metric + ' on ' + a.name, body: 'Latest reading ' + r.last + ' is ' + r.reason + ' (usual about ' + r.mean + '). Readings are entered by staff, so check the figure first.', data: { link: '/smois/analytics' }, email: false });
    }
  }
};
