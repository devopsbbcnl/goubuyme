// SMOIS analytics: manually recorded account and post readings, growth comparisons, integration readiness.
// Until a platform API is connected every figure is a person's reading and is labelled that way.
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { METRIC_DICTIONARY, METRIC_VERSION, parseYmd, previousPeriod, ymd } from '../../services/smois/analytics';
import { accountSummaries, followerSeries, groupPerformance, rankedPosts, rollup, topAndBottom } from '../../services/smois/insights';
import { can } from '../../services/smois/workflow';
import { access, fail, handle, isAssignedToAccount, lagosYmd, nameMap, readPeriod, reqStr, str, visibleAccountIds } from './common';

const SNAP_FIELDS = ['followers', 'reach', 'impressions', 'engagement', 'profileVisits', 'videoViews', 'websiteClicks'] as const;
const POST_FIELDS = ['reach', 'impressions', 'likes', 'comments', 'shares', 'saves', 'clicks', 'videoViews'] as const;

/** A whole, non-negative number, or null when left blank. Anything else is refused, never coerced to 0. */
const count = (v: unknown, label: string): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 2_000_000_000) fail(400, `${label} must be a whole number, zero or more.`);
  return n;
};

const readFields = <K extends string>(body: Record<string, unknown>, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, count(body[k], k)])) as Record<K, number | null>;

const mayRecord = async (req: Parameters<typeof access>[0], accountId: string) => {
  const a = access(req);
  if (!can(a, 'recordMetrics')) fail(403, 'Forbidden. Insufficient permissions.');
  if (a.level === 'MANAGER' && !(await isAssignedToAccount(a.memberId, accountId))) fail(403, 'You are not assigned to that account.');
};

// GET /metrics/dictionary
export const getDictionary = handle(async (_req, res) => apiResponse.success(res, 'Metric dictionary.', { version: METRIC_VERSION, metrics: METRIC_DICTIONARY }));

// POST /metrics/snapshots { accountId, date, followers?, reach?, ..., note? }
export const recordSnapshot = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const accountId = reqStr(b.accountId, 'Account', 60);
  const account = await prisma.smoisAccount.findUnique({ where: { id: accountId }, select: { id: true, name: true, archivedAt: true } });
  if (!account || account.archivedAt) fail(404, 'Account not found.');
  await mayRecord(req, accountId);
  const day = reqStr(b.date, 'Date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parseYmd(day).getTime())) fail(400, 'Date must look like 2026-11-05.');
  if (day > lagosYmd(new Date())) fail(400, 'You cannot record a reading for a future date.');
  const values = readFields(b, SNAP_FIELDS);
  if (SNAP_FIELDS.every((k) => values[k] === null)) fail(400, 'Enter at least one figure.');

  if (await prisma.smoisMetricSnapshot.findUnique({ where: { accountId_snapshotDate: { accountId, snapshotDate: parseYmd(day) } }, select: { id: true } })) {
    fail(409, 'A reading for that day already exists. Recorded history is not overwritten; ask management to correct it.');
  }
  const row = await prisma.smoisMetricSnapshot.create({ data: { accountId, snapshotDate: parseYmd(day), ...values, note: str(b.note, 300), enteredById: access(req).userId, metricVersion: METRIC_VERSION } });
  await smoisAudit(req, { action: 'METRIC_RECORDED', entity: 'SmoisAccount', entityId: accountId, after: { date: day, ...values }, meta: { account: account!.name, source: 'manual' } });
  return apiResponse.success(res, 'Reading recorded.', row, 201);
});

// PUT /metrics/snapshots/:id { reason, ...fields }: management corrects a reading; the old values stay in the trail
export const correctSnapshot = handle(async (req, res) => {
  const row = await prisma.smoisMetricSnapshot.findUnique({ where: { id: req.params.id }, include: { account: { select: { name: true } } } });
  if (!row) return fail(404, 'Reading not found.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const reason = reqStr(b.reason, 'Reason for the correction', 300);
  const values = readFields(b, SNAP_FIELDS);
  if (SNAP_FIELDS.every((k) => values[k] === null)) fail(400, 'Enter at least one figure.');
  const before = Object.fromEntries(SNAP_FIELDS.map((k) => [k, row[k]]));
  const updated = await prisma.smoisMetricSnapshot.update({ where: { id: row.id }, data: { ...values, correctedById: access(req).userId, correctedAt: new Date(), correctionReason: reason } });
  await smoisAudit(req, { action: 'METRIC_CORRECTED', entity: 'SmoisAccount', entityId: row.accountId, before: { date: ymd(row.snapshotDate), ...before }, after: { date: ymd(row.snapshotDate), ...values }, meta: { reason, account: row.account.name } });
  return apiResponse.success(res, 'Reading corrected. The original values are kept in the activity log.', updated);
});

// GET /metrics/snapshots?accountId&from&to
export const listSnapshots = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const accounts = await visibleAccountIds(access(req), { accountId: q.accountId });
  if (q.accountId && !accounts.length) return fail(403, 'You cannot see that account.');
  const rows = await prisma.smoisMetricSnapshot.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) }, ...(q.from || q.to ? { snapshotDate: { ...(q.from ? { gte: parseYmd(q.from) } : {}), ...(q.to ? { lte: parseYmd(q.to) } : {}) } } : {}) },
    orderBy: { snapshotDate: 'desc' }, take: 200, include: { account: { select: { name: true, platform: true } } },
  });
  const names = await nameMap(rows.flatMap((r) => [r.enteredById, r.correctedById]));
  return apiResponse.success(res, 'Readings.', rows.map((r) => ({
    ...r, snapshotDate: ymd(r.snapshotDate), enteredByName: names.get(r.enteredById) ?? null, correctedByName: r.correctedById ? names.get(r.correctedById) ?? null : null,
  })));
});

// POST /metrics/posts { variantId, reach?, impressions?, likes?, ... }
export const recordPostMetric = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const v = await prisma.smoisVariant.findUnique({ where: { id: reqStr(b.variantId, 'Post', 60) }, select: { id: true, status: true, accountId: true, contentId: true, content: { select: { title: true } } } });
  if (!v) return fail(404, 'Post not found.');
  if (v.status !== 'PUBLISHED') fail(409, 'Readings can only be recorded for published posts.');
  await mayRecord(req, v.accountId);
  const values = readFields(b, POST_FIELDS);
  if (POST_FIELDS.every((k) => values[k] === null)) fail(400, 'Enter at least one figure.');
  const row = await prisma.smoisPostMetric.create({ data: { variantId: v.id, ...values, note: str(b.note, 300), enteredById: access(req).userId } });
  await smoisAudit(req, { action: 'METRIC_RECORDED', entity: 'SmoisContent', entityId: v.contentId, after: { variantId: v.id, ...values }, meta: { post: v.content.title, source: 'manual' } });
  return apiResponse.success(res, 'Post reading recorded.', row, 201);
});

// GET /metrics/posts?variantId
export const listPostMetrics = handle(async (req, res) => {
  const variantId = reqStr(req.query.variantId, 'Post', 60);
  const rows = await prisma.smoisPostMetric.findMany({ where: { variantId }, orderBy: { recordedAt: 'desc' }, take: 50 });
  const names = await nameMap(rows.map((r) => r.enteredById));
  return apiResponse.success(res, 'Post readings.', rows.map((r) => ({ ...r, enteredByName: names.get(r.enteredById) ?? null })));
});

// GET /analytics/overview?period&from&to&platform&accountId
export const getOverview = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const a = access(req);
  const p = readPeriod(q);
  const accounts = await visibleAccountIds(a, { platform: q.platform, accountId: q.accountId });
  const prev = previousPeriod(p.fromYmd, p.toYmd);

  const summaries = await accountSummaries(accounts, p.fromYmd, p.toYmd, p.asOfYmd);
  const current = rollup(summaries);
  const previous = rollup(summaries.map((s) => ({ ...s, current: s.previous })));

  const byPlatform = [...new Set(summaries.map((s) => s.platform))].map((platform) => {
    const list = summaries.filter((s) => s.platform === platform);
    return { platform, current: rollup(list), previous: rollup(list.map((s) => ({ ...s, current: s.previous }))) };
  });

  const ids = accounts.map((x) => x.id);
  const [series, posts] = await Promise.all([followerSeries(ids, p.fromYmd, p.toYmd), rankedPosts(ids, p.from, p.to)]);
  const ranked = topAndBottom(posts);

  return apiResponse.success(res, 'Analytics.', {
    period: { key: p.key, label: p.label, from: p.fromYmd, to: p.toYmd },
    previousPeriod: prev,
    scope: a.level === 'MANAGER' ? 'assigned accounts' : 'all accounts',
    totals: { current, previous },
    byPlatform,
    accounts: summaries,
    series,
    posts: { ...ranked, byCategory: groupPerformance(posts, 'category'), byFormat: groupPerformance(posts, 'format'), total: posts.length },
    dataIntegrity: {
      source: 'Readings entered by SMOIS users',
      status: 'Manually entered. No platform API is connected, so nothing here is verified against the platform.',
      metricVersion: METRIC_VERSION, asOf: new Date().toISOString(), coverage: current.coverage,
      complete: summaries.length > 0 && summaries.every((s) => s.current.complete),
    },
  });
});

// GET /integrations: connection state per account plus the platform capability matrix (planning reference)
export const getIntegrations = handle(async (_req, res) => {
  const accounts = await prisma.smoisAccount.findMany({
    where: { archivedAt: null }, orderBy: [{ platform: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, platform: true, handle: true, connectionStatus: true, apiAuthStatus: true, connectedAt: true, lastSyncAt: true },
  });
  return apiResponse.success(res, 'Integrations.', { accounts, matrix: CAPABILITY_MATRIX, note: MATRIX_NOTE, jobs: [] });
});

const MATRIX_NOTE = 'Planning reference compiled from the platforms\' public API documentation. Access tiers, review processes and limits change often: confirm each row against the current developer docs before building that connector.';

type Cap = 'yes' | 'limited' | 'review' | 'no';
export const CAPABILITY_MATRIX: { platform: string; api: string; publish: Cap; metrics: Cap; comments: Cap; messages: Cap; webhooks: Cap; notes: string }[] = [
  { platform: 'FACEBOOK', api: 'Meta Graph API (Pages)', publish: 'review', metrics: 'review', comments: 'review', messages: 'review', webhooks: 'yes', notes: 'Needs a Meta app, Business verification and app review for page permissions. Page access tokens.' },
  { platform: 'INSTAGRAM', api: 'Meta Graph API (Instagram professional accounts)', publish: 'review', metrics: 'review', comments: 'review', messages: 'review', webhooks: 'yes', notes: 'Business or Creator account linked to a Facebook Page. Feed and Reels publishing; Stories support is narrower. Same app review as Facebook.' },
  { platform: 'LINKEDIN', api: 'LinkedIn Community Management / Marketing APIs', publish: 'review', metrics: 'limited', comments: 'review', messages: 'no', webhooks: 'limited', notes: 'Organisation pages only, via an approved developer product. No inbox API.' },
  { platform: 'X', api: 'X API (paid tiers)', publish: 'yes', metrics: 'limited', comments: 'limited', messages: 'limited', webhooks: 'limited', notes: 'Capabilities and rate limits depend on the paid tier. Read access for metrics is the costly part.' },
  { platform: 'TIKTOK', api: 'TikTok for Developers (Content Posting / Display)', publish: 'review', metrics: 'limited', comments: 'limited', messages: 'no', webhooks: 'limited', notes: 'Content posting requires an audited app; unaudited apps post privately only. Analytics are limited.' },
  { platform: 'YOUTUBE', api: 'YouTube Data API + YouTube Analytics API', publish: 'yes', metrics: 'yes', comments: 'yes', messages: 'no', webhooks: 'limited', notes: 'Daily quota units apply; uploads cost many units. Unverified API projects may restrict public uploads.' },
  { platform: 'WHATSAPP', api: 'WhatsApp Business Platform (Cloud API)', publish: 'no', metrics: 'limited', comments: 'no', messages: 'yes', webhooks: 'yes', notes: 'A messaging channel, not a feed: no posts or audience analytics. Template approval and 24-hour reply window rules.' },
  { platform: 'PINTEREST', api: 'Pinterest API', publish: 'yes', metrics: 'yes', comments: 'limited', messages: 'no', webhooks: 'limited', notes: 'Trial access first, then standard access after review.' },
  { platform: 'THREADS', api: 'Threads API (Meta)', publish: 'yes', metrics: 'yes', comments: 'yes', messages: 'no', webhooks: 'limited', notes: 'Available through the Meta developer platform; check current permissions and limits.' },
];
