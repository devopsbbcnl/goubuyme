// SMOIS reports: weekly manager reports and periodic department reports.
// A draft is generated from SMOIS records, the author adds commentary, management reviews, and an approved report is archived unchanged.
import { Prisma, SmoisReportStatus, SmoisReportType } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { METRIC_DICTIONARY, METRIC_VERSION, daysBetweenInclusive, parseYmd, previousPeriod, ymd } from '../../services/smois/analytics';
import {
  accountSummaries, groupPerformance, loadSlaConfig, memberStats, rankedPosts, rollup, targetActual, topAndBottom,
} from '../../services/smois/insights';
import { can } from '../../services/smois/workflow';
import { campaignTotals, responseMinutes } from '../../services/smois/community';
import { access, fail, handle, lagosYmd, managementUserIds, nameMap, notifyMany, oneOf, str } from './common';

const TYPES: SmoisReportType[] = ['WEEKLY_MANAGER', 'MONTHLY_DEPARTMENT', 'QUARTERLY_DEPARTMENT', 'ANNUAL_DEPARTMENT'];
const COMMENTARY_KEYS = ['summary', 'achievements', 'challenges', 'delayed', 'plans', 'recommendations', 'observations', 'engagement', 'campaigns'] as const;
const TYPE_LABEL: Record<SmoisReportType, string> = { WEEKLY_MANAGER: 'Weekly manager report', MONTHLY_DEPARTMENT: 'Monthly department report', QUARTERLY_DEPARTMENT: 'Quarterly department report', ANNUAL_DEPARTMENT: 'Annual department report' };

// ── Periods ─────────────────────────────────────────────────────────────────

const addDays = (s: string, n: number) => ymd(new Date(parseYmd(s).getTime() + n * 86_400_000));
const endOfMonth = (y: number, m0: number) => ymd(new Date(Date.UTC(y, m0 + 1, 0)));
const lagosStart = (s: string) => new Date(`${s}T00:00:00+01:00`);
const lagosEnd = (s: string) => new Date(`${s}T23:59:59.999+01:00`);

/** [from, to] (Lagos dates) of the report period that starts on `start`. Throws a 400 if `start` isn't a valid first day. */
export const reportPeriod = (type: SmoisReportType, start: string): { from: string; to: string } => {
  const d = parseYmd(start);
  if (Number.isNaN(d.getTime())) fail(400, 'Period start must look like 2026-11-02.');
  if (type === 'WEEKLY_MANAGER') {
    if (d.getUTCDay() !== 1) fail(400, 'A weekly report period starts on a Monday.');
    return { from: start, to: addDays(start, 6) };
  }
  if (type === 'MONTHLY_DEPARTMENT') {
    if (d.getUTCDate() !== 1) fail(400, 'A monthly report period starts on the 1st.');
    return { from: start, to: endOfMonth(d.getUTCFullYear(), d.getUTCMonth()) };
  }
  if (type === 'QUARTERLY_DEPARTMENT') {
    if (d.getUTCDate() !== 1 || d.getUTCMonth() % 3 !== 0) fail(400, 'A quarterly report period starts on 1 Jan, Apr, Jul or Oct.');
    return { from: start, to: endOfMonth(d.getUTCFullYear(), d.getUTCMonth() + 2) };
  }
  if (d.getUTCDate() !== 1 || d.getUTCMonth() !== 0) fail(400, 'An annual report period starts on 1 January.');
  return { from: start, to: `${d.getUTCFullYear()}-12-31` };
};

/** The most recent period of this type that has fully ended. */
export const lastFinishedPeriodStart = (type: SmoisReportType, today: string): string => {
  const t = parseYmd(today);
  if (type === 'WEEKLY_MANAGER') { const dow = (t.getUTCDay() + 6) % 7; return addDays(today, -dow - 7); }
  if (type === 'MONTHLY_DEPARTMENT') return ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)));
  if (type === 'QUARTERLY_DEPARTMENT') return ymd(new Date(Date.UTC(t.getUTCFullYear(), Math.floor(t.getUTCMonth() / 3) * 3 - 3, 1)));
  return `${t.getUTCFullYear() - 1}-01-01`;
};

// ── Data generation (only counts recorded SMOIS data) ───────────────────────

const UNAVAILABLE = [
  'Inbox and mention figures are what staff logged, not a feed from the platforms',
  'Platform-verified metrics (no platform API is connected; readings are entered by hand)',
];

const flatSummary = (s: Awaited<ReturnType<typeof accountSummaries>>[number]) => ({
  accountId: s.accountId, name: s.name, platform: s.platform,
  opening: s.current.opening?.value ?? null, closing: s.current.closing?.value ?? null, netGrowth: s.current.netGrowth, growthPct: s.current.growthPct,
  reach: s.current.totals.reach, impressions: s.current.totals.impressions, engagement: s.current.totals.engagement,
  websiteClicks: s.current.totals.websiteClicks, engagementRateReach: s.current.engagementRateReach, coverage: s.current.coverage, notes: s.current.notes,
});

export const buildReportData = async (type: SmoisReportType, from: string, to: string, author: { userId: string; memberId: string | null; name: string }) => {
  const now = new Date();
  const fromD = lagosStart(from); const toD = lagosEnd(to);
  const asOf = lagosYmd(now) < to ? lagosYmd(now) : to;
  const base = { generatedAt: now.toISOString(), metricVersion: METRIC_VERSION, period: { from, to, days: daysBetweenInclusive(from, to) }, unavailable: UNAVAILABLE, source: 'Counted from SMOIS records. Platform figures are readings entered by hand.' };

  if (type === 'WEEKLY_MANAGER') {
    const memberId = author.memberId as string;
    const assigned = await prisma.smoisAssignment.findMany({ where: { memberId, startsAt: { lte: toD }, OR: [{ endsAt: null }, { endsAt: { gte: fromD } }] }, select: { account: { select: { id: true, name: true, platform: true, archivedAt: true } } } });
    const accounts = [...new Map(assigned.filter((x) => !x.account.archivedAt).map((x) => [x.account.id, x.account])).values()];
    const [sums, stats, published, outstanding, platformsWorked] = await Promise.all([
      accountSummaries(accounts, from, to, asOf),
      memberStats(memberId, author.userId, fromD, toD, now),
      prisma.smoisVariant.findMany({ where: { creatorId: author.userId, status: 'PUBLISHED', publishedAt: { gte: fromD, lte: toD } }, select: { publishedUrl: true, account: { select: { name: true, platform: true } }, content: { select: { title: true } } } }),
      prisma.smoisTask.findMany({ where: { assigneeId: memberId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { title: true, deadline: true, status: true }, orderBy: { deadline: 'asc' }, take: 25 }),
      prisma.smoisVariant.findMany({ where: { creatorId: author.userId, createdAt: { gte: fromD, lte: toD } }, select: { account: { select: { platform: true } } } }),
    ]);
    return {
      ...base, kind: 'weekly', author: author.name,
      accounts: sums.map(flatSummary), content: stats.content,
      publishedPosts: published.map((p) => ({ title: p.content.title, account: p.account.name, platform: p.account.platform, url: p.publishedUrl })),
      platformsWorkedOn: [...new Set([...platformsWorked.map((x) => x.account.platform), ...published.map((x) => x.account.platform)])],
      community: { responded: stats.community.responded, withinTarget: stats.community.withinTarget },
      tasks: stats.tasks, outstandingTasks: outstanding.map((t) => ({ title: t.title, status: t.status, deadline: t.deadline?.toISOString() ?? null, overdue: !!t.deadline && t.deadline < now })),
    };
  }

  // Department report
  const prev = previousPeriod(from, to);
  const accounts = await prisma.smoisAccount.findMany({ where: { archivedAt: null }, select: { id: true, name: true, platform: true } });
  const sums = await accountSummaries(accounts, from, to, asOf);
  const current = rollup(sums);
  const previous = rollup(sums.map((s) => ({ ...s, current: s.previous })));
  const platforms = [...new Set(sums.map((s) => s.platform))].map((platform) => {
    const list = sums.filter((s) => s.platform === platform);
    return { platform, current: rollup(list), previous: rollup(list.map((s) => ({ ...s, current: s.previous }))) };
  });
  const inRange = { gte: fromD, lte: toD };
  const [planned, created, approved, published, failed, rejected] = await Promise.all([
    prisma.smoisVariant.count({ where: { OR: [{ scheduledAt: inRange }, { scheduledAt: null, plannedAt: inRange }] } }),
    prisma.smoisVariant.count({ where: { createdAt: inRange } }),
    prisma.smoisVariant.count({ where: { approvedAt: inRange } }),
    prisma.smoisVariant.count({ where: { status: 'PUBLISHED', publishedAt: inRange } }),
    prisma.smoisPublishAttempt.count({ where: { success: false, createdAt: inRange } }),
    prisma.smoisReview.count({ where: { decision: 'REJECTED', createdAt: inRange } }),
  ]);
  const posts = await rankedPosts(accounts.map((x) => x.id), fromD, toD);
  const ranked = topAndBottom(posts);
  const members = await prisma.smoisMember.findMany({ where: { role: { in: ['MANAGER', 'MANAGEMENT'] } }, select: { id: true, userId: true, isActive: true, user: { select: { name: true } } } });
  const workforce = await Promise.all(members.map(async (m) => ({ name: m.user.name, ...(await memberStats(m.id, m.userId, fromD, toD, now)) })));
  const active = workforce.filter((w) => w.tasks.assigned + w.content.created + w.content.published > 0);
  const targets = await prisma.smoisTarget.findMany({ where: { isActive: true, startsAt: { lte: toD }, endsAt: { gte: fromD } } });
  const targetRows = await Promise.all(targets.map(async (t) => ({ name: t.name, metric: t.metric, scope: t.scope, target: t.targetValue, ...(await targetActual(t, now)) })));

  const cfg = await loadSlaConfig();
  const convs = await prisma.smoisConversation.findMany({ where: { receivedAt: inRange }, select: { type: true, priority: true, status: true, receivedAt: true, firstResponseAt: true, slaDueAt: true, resolvedAt: true } });
  const answeredC = convs.filter((c) => c.firstResponseAt);
  const mins = answeredC.map((c) => responseMinutes(c.receivedAt, c.firstResponseAt as Date, c.priority, cfg));
  const community = {
    received: convs.length, resolved: convs.filter((c) => c.resolvedAt).length, escalated: convs.filter((c) => c.status === 'ESCALATED').length,
    unanswered: convs.filter((c) => !c.firstResponseAt && !['RESOLVED', 'CLOSED'].includes(c.status)).length,
    avgFirstResponseMinutes: mins.length ? Math.round(mins.reduce((x, y) => x + y, 0) / mins.length) : null,
    withinTargetPct: answeredC.length ? Math.round((answeredC.filter((c) => c.slaDueAt && (c.firstResponseAt as Date) <= c.slaDueAt).length / answeredC.length) * 100) : null,
  };
  const camps = await prisma.smoisCampaign.findMany({ where: { startsAt: { lte: toD }, endsAt: { gte: fromD }, status: { notIn: ['CANCELLED'] } }, include: { results: true }, orderBy: { startsAt: 'asc' } });
  const campaigns = camps.map((c) => { const t = campaignTotals(c.results, c.budget); return { name: c.name, status: c.status, type: c.type, budget: c.budget, spent: t.paid.spend, paidReach: t.paid.reach, organicReach: t.organic.reach, leads: t.paid.leads, costPerLead: t.paid.costPerLead, returnOnAdSpend: t.paid.returnOnAdSpend }; });
  const sentiment = await prisma.smoisMention.groupBy({ by: ['sentiment'], where: { occurredAt: inRange }, _count: true });

  return {
    ...base, kind: 'department', community, campaigns, mentions: Object.fromEntries(sentiment.map((s) => [s.sentiment.toLowerCase(), s._count])), author: author.name, previousPeriod: prev,
    audience: { current, previous }, platforms, accounts: sums.map(flatSummary),
    content: { planned, created, approved, published, failedPublications: failed, rejected },
    topPosts: ranked.top, bottomPosts: ranked.bottom, postsMeasured: ranked.measured, postsUnmeasured: ranked.unmeasured,
    byCategory: groupPerformance(posts, 'category'), byFormat: groupPerformance(posts, 'format'),
    workforce: active.map((w) => ({ name: w.name, tasks: w.tasks, content: w.content, reports: w.reports })),
    reportCompliance: { due: active.reduce((a, w) => a + w.reports.due, 0), submitted: active.reduce((a, w) => a + w.reports.submitted, 0) },
    targets: targetRows,
    metricDefinitions: METRIC_DICTIONARY.map((m) => ({ label: m.label, definition: m.definition })),
  };
};

// ── Access ──────────────────────────────────────────────────────────────────

const loadReport = async (req: Parameters<typeof access>[0], id: string) => {
  const r = await prisma.smoisReport.findUnique({ where: { id } });
  if (!r) return fail(404, 'Report not found.');
  const a = access(req);
  const own = r.authorId === a.userId;
  const seeAll = can(a, 'reviewReports');
  const viewerOk = a.level === 'VIEWER' && r.status === 'APPROVED' && r.type !== 'WEEKLY_MANAGER';
  if (!own && !seeAll && !viewerOk) fail(403, 'You cannot open that report.');
  return r;
};

const present = async (r: Prisma.SmoisReportGetPayload<object>) => {
  const names = await nameMap([r.authorId, r.reviewedById]);
  return { ...r, label: TYPE_LABEL[r.type], authorName: names.get(r.authorId) ?? null, reviewedByName: r.reviewedById ? names.get(r.reviewedById) ?? null : null, periodStart: ymd(r.periodStart), periodEnd: ymd(r.periodEnd) };
};

// GET /reports?type&status&mine=1
export const listReports = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const where: Prisma.SmoisReportWhereInput = {
    ...(q.type ? { type: oneOf(q.type, TYPES, 'Type') } : {}),
    ...(q.status ? { status: oneOf(q.status, ['DRAFT', 'SUBMITTED', 'CLARIFICATION_REQUESTED', 'APPROVED'] as SmoisReportStatus[], 'Status') } : {}),
  };
  if (q.mine === '1' || !can(a, 'reviewReports')) {
    if (a.level === 'VIEWER') { where.status = 'APPROVED'; where.type = { not: 'WEEKLY_MANAGER' }; } else where.authorId = a.userId;
  }
  const rows = await prisma.smoisReport.findMany({ where, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], take: 100, select: { id: true, type: true, periodStart: true, periodEnd: true, authorId: true, status: true, submittedAt: true, reviewedById: true, reviewedAt: true, reviewNote: true, createdAt: true, updatedAt: true, commentary: true, data: false, dueNotifiedAt: true } });
  const names = await nameMap(rows.flatMap((r) => [r.authorId, r.reviewedById]));
  return apiResponse.success(res, 'Reports.', rows.map((r) => ({ ...r, label: TYPE_LABEL[r.type], authorName: names.get(r.authorId) ?? null, reviewedByName: r.reviewedById ? names.get(r.reviewedById) ?? null : null, periodStart: ymd(r.periodStart), periodEnd: ymd(r.periodEnd) })));
});

// POST /reports/draft { type, periodStart? }
export const createDraft = handle(async (req, res) => {
  const a = access(req);
  const type = oneOf(req.body?.type, TYPES, 'Report type');
  if (type === 'WEEKLY_MANAGER') {
    if (!can(a, 'createContent') || !a.memberId) fail(403, 'Weekly reports are filed by managers and management.');
  } else if (!can(a, 'reviewReports')) fail(403, 'Forbidden. Insufficient permissions.');

  const start = str(req.body?.periodStart, 10) ?? lastFinishedPeriodStart(type, lagosYmd(new Date()));
  const { from, to } = reportPeriod(type, start);
  if (to >= lagosYmd(new Date())) fail(400, 'That period has not finished yet. Reports cover completed periods.');

  const existing = await prisma.smoisReport.findUnique({ where: { authorId_type_periodStart: { authorId: a.userId, type, periodStart: parseYmd(from) } } });
  if (existing) return apiResponse.success(res, 'You already have a report for that period.', await present(existing));

  const user = await prisma.user.findUnique({ where: { id: a.userId }, select: { name: true } });
  const data = await buildReportData(type, from, to, { userId: a.userId, memberId: a.memberId, name: user?.name ?? '' });
  const r = await prisma.smoisReport.create({ data: { type, periodStart: parseYmd(from), periodEnd: parseYmd(to), authorId: a.userId, data: data as unknown as Prisma.InputJsonValue } });
  await smoisAudit(req, { action: 'REPORT_GENERATED', entity: 'SmoisReport', entityId: r.id, after: { type, from, to } });
  return apiResponse.success(res, 'Draft created from SMOIS records. Add your commentary, then submit.', await present(r), 201);
});

// GET /reports/:id
export const getReport = handle(async (req, res) => apiResponse.success(res, 'Report.', await present(await loadReport(req, req.params.id))));

// PATCH /reports/:id { commentary }
export const updateReport = handle(async (req, res) => {
  const r = await loadReport(req, req.params.id);
  if (r.authorId !== access(req).userId) fail(403, 'Only the author can edit the commentary.');
  if (r.status !== 'DRAFT' && r.status !== 'CLARIFICATION_REQUESTED') fail(409, 'A submitted or approved report cannot be edited.');
  const input = (req.body?.commentary ?? {}) as Record<string, unknown>;
  const commentary: Record<string, string> = { ...(r.commentary as Record<string, string>) };
  for (const k of COMMENTARY_KEYS) if (k in input) commentary[k] = String(input[k] ?? '').slice(0, 4000);
  const u = await prisma.smoisReport.update({ where: { id: r.id }, data: { commentary } });
  return apiResponse.success(res, 'Saved.', await present(u));
});

// POST /reports/:id/refresh: re-count the figures while still a draft
export const refreshReport = handle(async (req, res) => {
  const a = access(req);
  const r = await loadReport(req, req.params.id);
  if (r.authorId !== a.userId) fail(403, 'Only the author can refresh the figures.');
  if (r.status !== 'DRAFT' && r.status !== 'CLARIFICATION_REQUESTED') fail(409, 'Figures are frozen once a report is submitted.');
  const user = await prisma.user.findUnique({ where: { id: a.userId }, select: { name: true } });
  const data = await buildReportData(r.type, ymd(r.periodStart), ymd(r.periodEnd), { userId: a.userId, memberId: a.memberId, name: user?.name ?? '' });
  const u = await prisma.smoisReport.update({ where: { id: r.id }, data: { data: data as unknown as Prisma.InputJsonValue } });
  return apiResponse.success(res, 'Figures refreshed from the latest records.', await present(u));
});

// POST /reports/:id/submit
export const submitReport = handle(async (req, res) => {
  const a = access(req);
  const r = await loadReport(req, req.params.id);
  if (r.authorId !== a.userId) fail(403, 'Only the author can submit the report.');
  if (r.status !== 'DRAFT' && r.status !== 'CLARIFICATION_REQUESTED') fail(409, 'This report has already been submitted.');
  const c = r.commentary as Record<string, string>;
  if (!COMMENTARY_KEYS.some((k) => (c[k] ?? '').trim())) fail(400, 'Add your commentary before submitting.');
  const u = await prisma.smoisReport.update({ where: { id: r.id }, data: { status: 'SUBMITTED', submittedAt: new Date(), reviewNote: null } });
  await smoisAudit(req, { action: 'REPORT_SUBMITTED', entity: 'SmoisReport', entityId: r.id, after: { type: r.type, from: ymd(r.periodStart) } });
  const who = await prisma.user.findUnique({ where: { id: a.userId }, select: { name: true } });
  await notifyMany(await managementUserIds(), { title: 'Report submitted', body: `${who?.name}: ${TYPE_LABEL[r.type]} for ${ymd(r.periodStart)}`, data: { link: `/smois/reports?open=${r.id}` } }, a.userId);
  return apiResponse.success(res, 'Submitted for review.', await present(u));
});

// POST /reports/:id/review { decision, note? }
export const reviewReport = handle(async (req, res) => {
  const a = access(req);
  const r = await loadReport(req, req.params.id);
  if (r.status !== 'SUBMITTED') fail(409, 'This report is not waiting for review.');
  if (r.authorId === a.userId) fail(403, 'You cannot review your own report.');
  const decision = oneOf(req.body?.decision, ['APPROVED', 'CLARIFICATION_REQUESTED'] as const, 'Decision');
  const note = str(req.body?.note, 1000);
  if (decision === 'CLARIFICATION_REQUESTED' && !note) fail(400, 'Say what needs clarifying.');
  const u = await prisma.smoisReport.update({ where: { id: r.id }, data: { status: decision, reviewedById: a.userId, reviewedAt: new Date(), reviewNote: note } });
  await smoisAudit(req, { action: decision === 'APPROVED' ? 'REPORT_APPROVED' : 'REPORT_REJECTED', entity: 'SmoisReport', entityId: r.id, meta: { note } });
  await notifyMany([r.authorId], { title: decision === 'APPROVED' ? 'Report approved' : 'Report needs clarification', body: `${TYPE_LABEL[r.type]} for ${ymd(r.periodStart)}${note ? `: ${note}` : ''}`, data: { link: `/smois/reports?open=${r.id}` } }, a.userId);
  return apiResponse.success(res, decision === 'APPROVED' ? 'Approved and archived.' : 'Returned to the author.', await present(u));
});

// ── Export ──────────────────────────────────────────────────────────────────

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cols: unknown[]) => cols.map(cell).join(',');
const na = (v: unknown) => (v === null || v === undefined ? 'not recorded' : v);

export const reportToCsv = (r: { type: SmoisReportType; periodStart: Date; periodEnd: Date; status: string; commentary: unknown; data: unknown }, authorName: string, reviewer: string | null, generatedAt = new Date()): string => {
  const d = r.data as Record<string, any>;
  const L: string[] = [];
  L.push(row('GoBuyMe: ' + TYPE_LABEL[r.type]));
  L.push(row('Reporting period', `${ymd(r.periodStart)} to ${ymd(r.periodEnd)}`));
  L.push(row('Prepared by', authorName), row('Status', r.status.replace(/_/g, ' ').toLowerCase()), row('Approved by', reviewer ?? ''));
  L.push(row('Generated', generatedAt.toISOString()), row('Data source', d.source), '');

  if (d.kind === 'weekly') {
    L.push(row('Account', 'Platform', 'Opening followers', 'Closing followers', 'Net growth', 'Growth %', 'Reach', 'Impressions', 'Engagement', 'Data coverage'));
    for (const a of d.accounts) L.push(row(a.name, a.platform, na(a.opening), na(a.closing), na(a.netGrowth), na(a.growthPct), na(a.reach), na(a.impressions), na(a.engagement), `${Math.round(a.coverage * 100)}%`));
    L.push('', row('Content', 'Count'));
    for (const [k, v] of Object.entries(d.content)) L.push(row(k, v));
    L.push('', row('Tasks', 'Count'));
    for (const [k, v] of Object.entries(d.tasks)) L.push(row(k, v));
    L.push('', row('Published post', 'Account', 'Link'));
    for (const p of d.publishedPosts) L.push(row(p.title, p.account, p.url));
    L.push('', row('Outstanding task', 'Status', 'Deadline'));
    for (const t of d.outstandingTasks) L.push(row(t.title, t.status, t.deadline));
  } else {
    L.push(row('Audience', 'This period', 'Previous period'));
    for (const k of ['followers', 'netGrowth', 'growthPct', 'reach', 'impressions', 'engagement', 'websiteClicks', 'engagementRateReach']) L.push(row(k, na(d.audience.current[k]), na(d.audience.previous[k])));
    L.push('', row('Platform', 'Followers', 'Net growth', 'Growth %', 'Reach', 'Impressions', 'Engagement'));
    for (const p of d.platforms) L.push(row(p.platform, na(p.current.followers), na(p.current.netGrowth), na(p.current.growthPct), na(p.current.reach), na(p.current.impressions), na(p.current.engagement)));
    L.push('', row('Account', 'Platform', 'Opening', 'Closing', 'Net growth', 'Growth %', 'Reach', 'Impressions', 'Engagement', 'Data coverage'));
    for (const a of d.accounts) L.push(row(a.name, a.platform, na(a.opening), na(a.closing), na(a.netGrowth), na(a.growthPct), na(a.reach), na(a.impressions), na(a.engagement), `${Math.round(a.coverage * 100)}%`));
    L.push('', row('Content', 'Count'));
    for (const [k, v] of Object.entries(d.content)) L.push(row(k, v));
    L.push('', row('Top posts', 'Account', 'Engagement rate %', 'Engagement', 'Reach'));
    for (const p of d.topPosts) L.push(row(p.title, p.account, na(p.engagementRate), na(p.engagement), na(p.reach)));
    L.push('', row('Lowest posts', 'Account', 'Engagement rate %', 'Engagement', 'Reach'));
    for (const p of d.bottomPosts) L.push(row(p.title, p.account, na(p.engagementRate), na(p.engagement), na(p.reach)));
    L.push('', row('Category', 'Posts', 'Measured', 'Avg engagement rate %'));
    for (const g of d.byCategory) L.push(row(g.name, g.posts, g.measured, na(g.avgEngagementRate)));
    L.push('', row('Format', 'Posts', 'Measured', 'Avg engagement rate %'));
    for (const g of d.byFormat) L.push(row(g.name, g.posts, g.measured, na(g.avgEngagementRate)));
    L.push('', row('Team member', 'Tasks assigned', 'Completed', 'Overdue', 'Content created', 'Published', 'Weekly reports'));
    for (const w of d.workforce) L.push(row(w.name, w.tasks.assigned, w.tasks.completed, w.tasks.overdue, w.content.created, w.content.published, `${w.reports.submitted}/${w.reports.due}`));
    L.push('', row('Target', 'Metric', 'Target', 'Actual', 'Achieved %', 'Status'));
    for (const t of d.targets) L.push(row(t.name, t.metric, t.target, na(t.actual), na(t.percent), t.status));
  }

  if (d.community) {
    L.push('', row('Community engagement', 'Value'));
    for (const [k, v] of Object.entries(d.community)) L.push(row(k, na(v)));
  }
  if (d.mentions && Object.keys(d.mentions).length) {
    L.push('', row('Logged mentions by sentiment (labelled by staff)', 'Count'));
    for (const [k, v] of Object.entries(d.mentions)) L.push(row(k, v));
  }
  if (d.campaigns?.length) {
    L.push('', row('Campaign', 'Status', 'Budget', 'Spent (paid)', 'Paid reach', 'Organic reach', 'Leads', 'Cost per lead', 'Return on ad spend'));
    for (const c of d.campaigns) L.push(row(c.name, c.status, na(c.budget), na(c.spent), na(c.paidReach), na(c.organicReach), na(c.leads), na(c.costPerLead), na(c.returnOnAdSpend)));
  }
  L.push('', row('Commentary'));
  for (const [k, v] of Object.entries((r.commentary ?? {}) as Record<string, string>)) if (v) L.push(row(k, v));
  L.push('', row('Not available in this report'));
  for (const u of d.unavailable ?? []) L.push(row(u));
  L.push('', row('Metric definitions (version ' + d.metricVersion + ')'));
  for (const m of METRIC_DICTIONARY) L.push(row(m.label, m.definition));
  return L.join('\n');
};

// GET /reports/:id/export
export const exportReport = handle(async (req, res) => {
  const r = await loadReport(req, req.params.id);
  const names = await nameMap([r.authorId, r.reviewedById]);
  const csv = reportToCsv(r, names.get(r.authorId) ?? '', r.reviewedById ? names.get(r.reviewedById) ?? null : null);
  await smoisAudit(req, { action: 'REPORT_EXPORTED', entity: 'SmoisReport', entityId: r.id, meta: { format: 'csv' } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="gobuyme-${r.type.toLowerCase()}-${ymd(r.periodStart)}.csv"`);
  res.send('﻿' + csv);
});

