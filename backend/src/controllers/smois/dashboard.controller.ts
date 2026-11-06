// SMOIS dashboard and activity log.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { PERIOD_KEYS, PeriodKey, resolvePeriod } from '../../services/smois/period';
import { TASK_DONE, can } from '../../services/smois/workflow';
import { smoisAudit } from '../../services/smois/audit';
import { access, date, fail, handle, lagosYmd, nameMap, oneOf, visibleAccountIds } from './common';
import { accountSummaries, loadSlaConfig, rollup } from '../../services/smois/insights';
import { responseMinutes } from '../../services/smois/community';

// GET /dashboard?period=month&from&to&platform&accountId&employeeId(userId)&categoryId&scope=mine
export const getDashboard = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const period = resolvePeriod(q.period ? oneOf(q.period, PERIOD_KEYS, 'Period') : 'month', new Date(), { from: date(q.from, 'From'), to: date(q.to, 'To') });
  if (period.from > period.to) fail(400, 'The start date is after the end date.');
  const mine = q.scope === 'mine' || !can(a, 'viewAll');
  const now = new Date();
  const inPeriod = { gte: period.from, lte: period.to };

  const employeeUserId = mine ? a.userId : q.employeeId || null;
  const employeeMember = employeeUserId ? await prisma.smoisMember.findUnique({ where: { userId: employeeUserId }, select: { id: true } }) : null;

  const vBase: Prisma.SmoisVariantWhereInput = {
    ...(q.accountId ? { accountId: q.accountId } : {}),
    ...(q.platform ? { account: { platform: q.platform as never } } : {}),
    ...(q.categoryId ? { content: { categoryId: q.categoryId } } : {}),
    ...(employeeUserId ? { creatorId: employeeUserId } : {}),
  };
  const tBase: Prisma.SmoisTaskWhereInput = {
    ...(q.accountId ? { accountId: q.accountId } : {}),
    ...(employeeUserId ? { assigneeId: employeeMember?.id ?? '__none__' } : {}),
  };
  const aBase: Prisma.SmoisAccountWhereInput = { archivedAt: null, ...(q.platform ? { platform: q.platform as never } : {}), ...(q.accountId ? { id: q.accountId } : {}) };

  const [
    accounts, byPlatform, byConnection, unassigned,
    created, awaiting, approved, scheduled, published, failed, rejected, dueNotPublished,
    managers, assigned, completed, pending, overdue, awaitingReview,
    upcoming, mineFeedback, mySubmissions,
  ] = await Promise.all([
    prisma.smoisAccount.count({ where: aBase }),
    prisma.smoisAccount.groupBy({ by: ['platform'], where: aBase, _count: true }),
    prisma.smoisAccount.groupBy({ by: ['connectionStatus'], where: aBase, _count: true }),
    prisma.smoisAccount.count({ where: { ...aBase, assignments: { none: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] } } } }),

    prisma.smoisVariant.count({ where: { ...vBase, createdAt: inPeriod } }),
    prisma.smoisVariant.count({ where: { ...vBase, status: { in: ['SUBMITTED', 'RESUBMITTED'] } } }),
    prisma.smoisVariant.count({ where: { ...vBase, approvedAt: inPeriod } }),
    prisma.smoisVariant.count({ where: { ...vBase, status: 'SCHEDULED', scheduledAt: { gte: now } } }),
    prisma.smoisVariant.count({ where: { ...vBase, status: 'PUBLISHED', publishedAt: inPeriod } }),
    prisma.smoisVariant.count({ where: { ...vBase, status: 'PUBLISH_FAILED' } }),
    prisma.smoisReview.count({ where: { decision: 'REJECTED', createdAt: inPeriod, variant: vBase } }),
    prisma.smoisVariant.count({ where: { ...vBase, status: { in: ['SCHEDULED', 'APPROVED'] }, OR: [{ scheduledAt: { lt: now } }, { scheduledAt: null, plannedAt: { lt: now } }] } }),

    prisma.smoisMember.count({ where: { isActive: true, role: 'MANAGER' } }),
    prisma.smoisTask.count({ where: { ...tBase, createdAt: inPeriod } }),
    prisma.smoisTask.count({ where: { ...tBase, status: 'COMPLETED', completedAt: inPeriod } }),
    prisma.smoisTask.count({ where: { ...tBase, status: { notIn: TASK_DONE } } }),
    prisma.smoisTask.count({ where: { ...tBase, status: { notIn: TASK_DONE }, deadline: { lt: now } } }),
    prisma.smoisTask.count({ where: { ...tBase, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),

    prisma.smoisVariant.findMany({
      where: { ...vBase, status: { in: ['SCHEDULED', 'APPROVED', 'SUBMITTED', 'RESUBMITTED'] }, OR: [{ scheduledAt: { gte: now } }, { scheduledAt: null, plannedAt: { gte: now } }] },
      select: { id: true, status: true, scheduledAt: true, plannedAt: true, content: { select: { id: true, title: true } }, account: { select: { name: true, platform: true } } },
      orderBy: [{ scheduledAt: 'asc' }, { plannedAt: 'asc' }], take: 8,
    }),
    prisma.smoisVariant.count({ where: { status: 'REVISION_REQUESTED', OR: [{ creatorId: a.userId }, { submittedById: a.userId }] } }),
    prisma.smoisVariant.groupBy({ by: ['status'], where: { OR: [{ creatorId: a.userId }, { submittedById: a.userId }] }, _count: true }),
  ]);

  // Audience figures come only from readings people recorded; they are labelled as such and never estimated.
  let audience: ReturnType<typeof rollup> | null = null;
  if (can(a, 'viewAnalytics')) {
    const visible = await visibleAccountIds(a, { platform: q.platform, accountId: q.accountId });
    const toYmd = lagosYmd(period.to); const today = lagosYmd(now);
    if (visible.length) audience = rollup(await accountSummaries(visible, lagosYmd(period.from), toYmd, today < toYmd ? today : toYmd));
  }
  const reportsSubmitted = await Promise.all([
    prisma.smoisReport.count({ where: { type: 'WEEKLY_MANAGER', status: { in: ['SUBMITTED', 'APPROVED'] }, periodStart: inPeriod, ...(mine ? { authorId: a.userId } : {}) } }),
    prisma.smoisReport.count({ where: { type: 'MONTHLY_DEPARTMENT', status: { in: ['SUBMITTED', 'APPROVED'] }, periodStart: inPeriod } }),
  ]);

  // Engagement and campaign overview (counted from what staff logged).
  let engagement: Record<string, unknown> | null = null;
  if (can(a, 'handleInbox')) {
    const ids = (await visibleAccountIds(a)).map((x) => x.id);
    const own: Prisma.SmoisConversationWhereInput = { accountId: { in: ids }, ...(mine ? { assignedMemberId: a.memberId ?? '__none__' } : {}) };
    const range = { gte: period.from, lte: period.to };
    const openStatuses = ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'ESCALATED'] as const;
    const [incoming, byType, unanswered, complaints, resolvedN, answered, cfg] = await Promise.all([
      prisma.smoisConversation.count({ where: { ...own, receivedAt: range } }),
      prisma.smoisConversation.groupBy({ by: ['type'], where: { ...own, receivedAt: range }, _count: true }),
      prisma.smoisConversation.count({ where: { ...own, status: { in: [...openStatuses] }, firstResponseAt: null } }),
      prisma.smoisConversation.count({ where: { ...own, status: { in: [...openStatuses] }, escalationType: { in: ['SERIOUS_COMPLAINT', 'SENSITIVE_CUSTOMER'] } } }),
      prisma.smoisConversation.count({ where: { ...own, resolvedAt: range } }),
      prisma.smoisConversation.findMany({ where: { ...own, receivedAt: range, firstResponseAt: { not: null } }, select: { receivedAt: true, firstResponseAt: true, slaDueAt: true, priority: true } }),
      loadSlaConfig(),
    ]);
    const mins = answered.map((r) => responseMinutes(r.receivedAt, r.firstResponseAt as Date, r.priority, cfg));
    engagement = {
      incoming, comments: byType.filter((t) => ['COMMENT', 'REPLY'].includes(t.type)).reduce((s, t) => s + t._count, 0),
      messages: byType.filter((t) => ['DIRECT_MESSAGE', 'ENQUIRY'].includes(t.type)).reduce((s, t) => s + t._count, 0),
      mentions: byType.filter((t) => ['MENTION', 'STORY_INTERACTION'].includes(t.type)).reduce((s, t) => s + t._count, 0),
      unanswered, openComplaints: complaints, resolved: resolvedN,
      avgResponseMinutes: mins.length ? Math.round(mins.reduce((x, y) => x + y, 0) / mins.length) : null,
      withinTargetPct: answered.length ? Math.round((answered.filter((r) => r.slaDueAt && r.firstResponseAt && r.firstResponseAt <= r.slaDueAt).length / answered.length) * 100) : null,
      source: 'Conversations staff logged from the platform accounts',
    };
  }
  let campaignsOverview: Record<string, number> | null = null;
  if (can(a, 'viewCampaigns')) {
    const [activeC, completedC, upcomingC] = await Promise.all([
      prisma.smoisCampaign.count({ where: { status: { in: ['ACTIVE', 'PAUSED'] } } }),
      prisma.smoisCampaign.count({ where: { status: 'COMPLETED', endsAt: inPeriod } }),
      prisma.smoisCampaign.count({ where: { status: { notIn: ['CANCELLED', 'ARCHIVED', 'COMPLETED'] }, startsAt: { gt: now } } }),
    ]);
    campaignsOverview = { active: activeC, completedInPeriod: completedC, upcoming: upcomingC };
  }

  return apiResponse.success(res, 'Dashboard.', {
    scope: mine ? 'mine' : 'department',
    period: { key: period.key, label: period.label, from: period.from, to: period.to },
    accounts: {
      total: accounts, unassigned,
      byPlatform: byPlatform.map((r) => ({ platform: r.platform, count: r._count })),
      byConnection: byConnection.map((r) => ({ status: r.connectionStatus, count: r._count })),
      apiConnected: byConnection.filter((r) => r.connectionStatus === 'CONNECTED').reduce((s, r) => s + r._count, 0),
    },
    audience: audience && { ...audience, source: 'Manually entered readings', dataStatus: 'MANUAL' },
    reports: { weeklySubmitted: reportsSubmitted[0], monthlySubmitted: reportsSubmitted[1] },
    engagement, campaigns: campaignsOverview,
    content: { created, awaitingApproval: awaiting, approved, scheduled, published, failedPublications: failed, rejected, overdueDeadlines: dueNotPublished },
    staff: { activeManagers: managers, tasks: { assigned, completed, pending, overdue, awaitingReview } },
    upcoming,
    me: { feedbackWaiting: mineFeedback, submissions: mySubmissions.map((r) => ({ status: r.status, count: r._count })) },
    // Section 5.5: every figure says where it came from; nothing is estimated or pulled from a platform yet.
    dataIntegrity: {
      source: 'SMOIS internal records',
      status: 'Verified: counted from recorded activity',
      asOf: now,
      unavailable: [
        { metric: 'Platform-verified figures', reason: 'Audience figures above are readings entered by hand. They become verified once an account is connected through its platform API.' },
        { metric: 'Live platform feeds', reason: 'Inbox conversations, mentions and competitor figures are logged by staff. Nothing is pulled from the platforms automatically yet.' },
      ],
    },
  });
});

// ── Activity log ─────────────────────────────────────────────────────────────

const activityWhere = (req: Parameters<typeof access>[0]): Prisma.AuditLogWhereInput => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  if (!can(a, 'viewActivity')) fail(403, 'Forbidden. Insufficient permissions.');
  const and: Prisma.AuditLogWhereInput[] = [{ entity: { startsWith: 'Smois' } }];
  // Anyone below management sees only their own activity.
  if (!can(a, 'viewAll') || a.level === 'VIEWER') and.push({ userId: a.userId });
  else if (q.userId) and.push({ userId: q.userId });
  if (q.entity) and.push({ entity: q.entity });
  if (q.entityId) and.push({ entityId: q.entityId });
  if (q.action) and.push({ action: q.action });
  const from = date(q.from, 'From');
  const to = date(q.to, 'To');
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  if (q.q) and.push({ OR: [{ action: { contains: q.q, mode: 'insensitive' } }, { entityId: { contains: q.q } }, { user: { name: { contains: q.q, mode: 'insensitive' } } }] });
  return { AND: and };
};

const activitySelect = {
  id: true, action: true, entity: true, entityId: true, meta: true, ip: true, createdAt: true, actorType: true,
  user: { select: { id: true, name: true, role: true } },
} satisfies Prisma.AuditLogSelect;

// GET /activity?userId&entity&entityId&action&from&to&q&page
export const listActivity = handle(async (req, res) => {
  const where = activityWhere(req);
  const page = Math.max(1, Number((req.query as Record<string, string>).page) || 1);
  const take = 40;
  const [items, total, actions] = await Promise.all([
    prisma.auditLog.findMany({ where, select: activitySelect, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['action'], where: { entity: { startsWith: 'Smois' } }, _count: true, orderBy: { action: 'asc' } }),
  ]);
  return apiResponse.success(res, 'Activity.', { items, pagination: { page, total, pages: Math.ceil(total / take) }, actions: actions.map((x) => x.action) });
});

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /activity/export (management and super admin): CSV of the current filter, itself recorded.
export const exportActivity = handle(async (req, res) => {
  const a = access(req);
  if (!can(a, 'viewAll') || a.level === 'VIEWER') fail(403, 'Forbidden. Insufficient permissions.');
  const where = activityWhere(req);
  const rows = await prisma.auditLog.findMany({ where, select: { ...activitySelect }, orderBy: { createdAt: 'desc' }, take: 5000 });
  await smoisAudit(req, { action: 'ACTIVITY_EXPORTED', entity: 'SmoisActivity', entityId: 'export', meta: { rows: rows.length, filter: req.query } });
  const header = ['Time', 'User', 'Action', 'Resource', 'Resource ID', 'Success', 'Before', 'After', 'IP', 'Device', 'Details'];
  const lines = rows.map((r) => {
    const m = (r.meta ?? {}) as Record<string, unknown>;
    const { success, before, after, device, ...rest } = m;
    return [r.createdAt.toISOString(), r.user?.name ?? (r.actorType === 'SYSTEM' ? 'System' : ''), r.action, r.entity.replace(/^Smois/, ''), r.entityId, success === false ? 'failed' : 'ok', before, after, r.ip, device, Object.keys(rest).length ? rest : ''].map(csv).join(',');
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="smois-activity-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send([header.join(','), ...lines].join('\n'));
});

// GET /timeline/:entity/:id: chronological history for one account, content item, task or person
export const getTimeline = handle(async (req, res) => {
  const a = access(req);
  const entity = oneOf(req.params.entity, ['SmoisAccount', 'SmoisContent', 'SmoisTask', 'SmoisMember', 'SmoisConversation', 'SmoisCampaign', 'SmoisAsset', 'SmoisMention'] as const, 'Resource');
  if (!can(a, 'viewActivity')) fail(403, 'Forbidden. Insufficient permissions.');
  const items = await prisma.auditLog.findMany({
    where: { entity, entityId: req.params.id, ...(can(a, 'viewAll') && a.level !== 'VIEWER' ? {} : { userId: a.userId }) },
    select: activitySelect, orderBy: { createdAt: 'asc' }, take: 500,
  });
  const names = await nameMap(items.map((i) => i.user?.id));
  return apiResponse.success(res, 'Timeline.', items.map((i) => ({ ...i, userName: i.user ? names.get(i.user.id) ?? i.user.name : 'System' })));
});
