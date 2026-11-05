// SMOIS social listening and competitor benchmarking.
// Everything here is logged by people: there is no automated monitoring, no scraping, and sentiment is a label the
// person chose, shown as an assistive signal rather than a verdict.
import { Prisma, SmoisPlatform, SmoisSentiment } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { parseYmd, ymd } from '../../services/smois/analytics';
import { competitorSummary, negativeSpike } from '../../services/smois/community';
import { accountSummaries, rollup } from '../../services/smois/insights';
import {
  access, date, fail, handle, httpUrl, lagosYmd, nameMap, oneOf, readPeriod, reqStr, str, visibleAccountIds,
} from './common';

const PLATFORMS: SmoisPlatform[] = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS', 'OTHER'];
const SENTIMENTS: SmoisSentiment[] = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNCERTAIN'];
const KINDS = ['BRAND', 'PRODUCT', 'EXECUTIVE', 'INDUSTRY', 'HASHTAG', 'COMPETITOR'] as const;
const DAY = 86_400_000;

const COVERAGE_NOTE = 'Mentions are found and logged by staff. This is not a complete feed of public conversation, and it covers only the platforms and keywords the team checks.';

// ── Keywords ────────────────────────────────────────────────────────────────

export const listKeywords = handle(async (_req, res) => {
  const rows = await prisma.smoisKeyword.findMany({ orderBy: [{ isActive: 'desc' }, { kind: 'asc' }, { term: 'asc' }], include: { _count: { select: { mentions: true } } } });
  return apiResponse.success(res, 'Keywords.', rows);
});

export const createKeyword = handle(async (req, res) => {
  const term = reqStr(req.body?.term, 'Keyword', 80);
  const kind = oneOf(req.body?.kind ?? 'BRAND', KINDS, 'Type');
  if (await prisma.smoisKeyword.findFirst({ where: { term: { equals: term, mode: 'insensitive' }, kind } })) fail(409, 'That keyword is already monitored.');
  const k = await prisma.smoisKeyword.create({ data: { term, kind, createdById: access(req).userId } });
  await smoisAudit(req, { action: 'KEYWORD_ADDED', entity: 'SmoisMention', entityId: k.id, after: { term, kind } });
  return apiResponse.success(res, 'Keyword added.', k, 201);
});

export const updateKeyword = handle(async (req, res) => {
  const k = await prisma.smoisKeyword.findUnique({ where: { id: req.params.id } });
  if (!k) return fail(404, 'Keyword not found.');
  const u = await prisma.smoisKeyword.update({ where: { id: k.id }, data: { isActive: !!req.body?.isActive } });
  await smoisAudit(req, { action: 'KEYWORD_UPDATED', entity: 'SmoisMention', entityId: k.id, before: { isActive: k.isActive }, after: { isActive: u.isActive } });
  return apiResponse.success(res, 'Updated.', u);
});

// ── Mentions ────────────────────────────────────────────────────────────────

const mentionSelect = { id: true, keywordId: true, platform: true, authorName: true, url: true, text: true, sentiment: true, sentimentSource: true, reach: true, occurredAt: true, handled: true, handledById: true, note: true, loggedById: true, createdAt: true, keyword: { select: { term: true, kind: true } } } satisfies Prisma.SmoisMentionSelect;

// GET /mentions?sentiment&keywordId&platform&handled&from&to&page
export const listMentions = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const page = Math.max(1, Number(q.page) || 1);
  const take = 30;
  const from = date(q.from, 'From'); const to = date(q.to, 'To');
  const where: Prisma.SmoisMentionWhereInput = {
    ...(q.sentiment ? { sentiment: oneOf(q.sentiment, SENTIMENTS, 'Sentiment') } : {}),
    ...(q.keywordId ? { keywordId: q.keywordId } : {}),
    ...(q.platform ? { platform: oneOf(q.platform, PLATFORMS, 'Platform') } : {}),
    ...(q.handled === '1' ? { handled: true } : q.handled === '0' ? { handled: false } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.smoisMention.findMany({ where, select: mentionSelect, orderBy: { occurredAt: 'desc' }, skip: (page - 1) * take, take }),
    prisma.smoisMention.count({ where }),
  ]);
  const names = await nameMap(rows.flatMap((r) => [r.loggedById, r.handledById]));
  return apiResponse.success(res, 'Mentions.', { items: rows.map((r) => ({ ...r, loggedByName: names.get(r.loggedById) ?? null, handledByName: r.handledById ? names.get(r.handledById) ?? null : null })), pagination: { page, total, pages: Math.ceil(total / take) }, note: COVERAGE_NOTE });
});

// POST /mentions { text, sentiment?, platform?, keywordId?, authorName?, url?, reach?, occurredAt? }
export const logMention = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const occurredAt = date(b.occurredAt, 'Time') ?? new Date();
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) fail(400, 'Time cannot be in the future.');
  let reach: number | null = null;
  if (b.reach !== undefined && b.reach !== null && b.reach !== '') { reach = Number(b.reach); if (!Number.isInteger(reach) || reach < 0) fail(400, 'Reach must be a whole number.'); }
  const keywordId = b.keywordId ? String(b.keywordId) : null;
  if (keywordId && !(await prisma.smoisKeyword.findUnique({ where: { id: keywordId }, select: { id: true } }))) fail(400, 'Unknown keyword.');
  const m = await prisma.smoisMention.create({
    data: { text: reqStr(b.text, 'What was said', 3000), sentiment: b.sentiment ? oneOf(b.sentiment, SENTIMENTS, 'Sentiment') : 'UNCERTAIN', platform: b.platform ? oneOf(b.platform, PLATFORMS, 'Platform') : null, keywordId, authorName: str(b.authorName, 120), url: httpUrl(b.url, 'Link'), reach, occurredAt, loggedById: access(req).userId },
    select: mentionSelect,
  });
  await smoisAudit(req, { action: 'MENTION_LOGGED', entity: 'SmoisMention', entityId: m.id, after: { sentiment: m.sentiment, platform: m.platform } });
  return apiResponse.success(res, 'Mention logged.', m, 201);
});

// PATCH /mentions/:id { sentiment?, handled?, note? }
export const updateMention = handle(async (req, res) => {
  const m = await prisma.smoisMention.findUnique({ where: { id: req.params.id } });
  if (!m) return fail(404, 'Mention not found.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Prisma.SmoisMentionUncheckedUpdateInput = {};
  if ('sentiment' in b) data.sentiment = oneOf(b.sentiment, SENTIMENTS, 'Sentiment');
  if ('note' in b) data.note = str(b.note, 500);
  if ('handled' in b) { data.handled = !!b.handled; data.handledById = b.handled ? access(req).userId : null; }
  const u = await prisma.smoisMention.update({ where: { id: m.id }, data, select: mentionSelect });
  await smoisAudit(req, { action: 'MENTION_UPDATED', entity: 'SmoisMention', entityId: m.id, before: { sentiment: m.sentiment, handled: m.handled }, after: { sentiment: u.sentiment, handled: u.handled } });
  return apiResponse.success(res, 'Updated.', u);
});

// GET /listening/overview?period
export const listeningOverview = handle(async (req, res) => {
  const p = readPeriod(req.query as Record<string, string>);
  const now = new Date();
  const [bySentiment, byKeyword, byPlatform, recentNeg, prevNeg, unhandledNeg, days] = await Promise.all([
    prisma.smoisMention.groupBy({ by: ['sentiment'], where: { occurredAt: { gte: p.from, lte: p.to } }, _count: true }),
    prisma.smoisMention.groupBy({ by: ['keywordId'], where: { occurredAt: { gte: p.from, lte: p.to } }, _count: true }),
    prisma.smoisMention.groupBy({ by: ['platform'], where: { occurredAt: { gte: p.from, lte: p.to } }, _count: true }),
    prisma.smoisMention.count({ where: { sentiment: 'NEGATIVE', occurredAt: { gte: new Date(now.getTime() - DAY) } } }),
    prisma.smoisMention.count({ where: { sentiment: 'NEGATIVE', occurredAt: { gte: new Date(now.getTime() - 8 * DAY), lt: new Date(now.getTime() - DAY) } } }),
    prisma.smoisMention.count({ where: { sentiment: 'NEGATIVE', handled: false } }),
    prisma.smoisMention.findMany({ where: { occurredAt: { gte: new Date(now.getTime() - 14 * DAY) } }, select: { occurredAt: true, sentiment: true } }),
  ]);
  const kw = await prisma.smoisKeyword.findMany({ where: { id: { in: byKeyword.map((k) => k.keywordId).filter(Boolean) as string[] } }, select: { id: true, term: true } });
  const kwName = new Map(kw.map((k) => [k.id, k.term]));
  const series = Array.from({ length: 14 }, (_, n) => { const d = lagosYmd(new Date(now.getTime() - (13 - n) * DAY)); return { date: d, positive: 0, neutral: 0, negative: 0, uncertain: 0 }; });
  for (const m of days) { const row = series.find((s) => s.date === lagosYmd(m.occurredAt)); if (row) row[m.sentiment.toLowerCase() as 'positive'] += 1; }
  const spike = negativeSpike(recentNeg, prevNeg);
  return apiResponse.success(res, 'Listening.', {
    period: { key: p.key, label: p.label, from: p.from, to: p.to },
    sentiment: Object.fromEntries(SENTIMENTS.map((s) => [s, bySentiment.find((x) => x.sentiment === s)?._count ?? 0])),
    byKeyword: byKeyword.map((k) => ({ keyword: k.keywordId ? kwName.get(k.keywordId) ?? 'Unknown' : 'No keyword', count: k._count })).sort((a, b) => b.count - a.count),
    byPlatform: byPlatform.map((k) => ({ platform: k.platform ?? 'Not stated', count: k._count })).sort((a, b) => b.count - a.count),
    series,
    alerts: { negativeLast24h: recentNeg, negativeUnhandled: unhandledNeg, spike: spike.spike, spikeThreshold: spike.threshold, avgDailyNegative: spike.avgDaily },
    note: COVERAGE_NOTE, sentimentNote: 'Sentiment is the label chosen by whoever logged the mention. Treat it as a signal, not a judgement.',
  });
});

// ── Competitors ─────────────────────────────────────────────────────────────

const OBS_KINDS = ['PUBLIC_OBSERVATION', 'ESTIMATE', 'THIRD_PARTY'] as const;

export const listCompetitors = handle(async (req, res) => {
  const p = readPeriod(req.query as Record<string, string>, 'quarter');
  const rows = await prisma.smoisCompetitor.findMany({ orderBy: [{ monitoringStatus: 'asc' }, { name: 'asc' }], include: { snapshots: { orderBy: { observedOn: 'asc' } } } });
  const out = rows.map((c) => {
    const snaps = c.snapshots.map((s) => ({ date: ymd(s.observedOn), followers: s.followers, postsLast7Days: s.postsLast7Days, avgEngagement: s.avgEngagement }));
    const latest = c.snapshots[c.snapshots.length - 1];
    const { snapshots: _s, ...rest } = c;
    return { ...rest, summary: competitorSummary(snaps, p.fromYmd, p.toYmd), latest: latest ? { observedOn: ymd(latest.observedOn), followers: latest.followers, popularContent: latest.popularContent, campaignNote: latest.campaignNote, dataKind: latest.dataKind } : null };
  });
  // Our own accounts on the same platforms, for a like-for-like comparison.
  const mine = await visibleAccountIds(access(req));
  const ours = await accountSummaries(mine, p.fromYmd, p.toYmd, p.asOfYmd);
  const own = [...new Set(ours.map((o) => o.platform))].map((platform) => {
    const r = rollup(ours.filter((o) => o.platform === platform));
    return { platform, followers: r.followers, growth: r.netGrowth, growthPct: r.growthPct };
  });
  return apiResponse.success(res, 'Competitors.', {
    period: { key: p.key, label: p.label, from: p.fromYmd, to: p.toYmd }, competitors: out, own,
    note: 'Competitor figures are what staff observed on public profiles, estimates, or third-party data. Each entry says which. They are not verified and not private data.',
  });
});

const parseCompetitor = (b: Record<string, unknown>, partial: boolean) => {
  const data: Prisma.SmoisCompetitorUncheckedUpdateInput = {};
  const has = (k: string) => k in b;
  if (!partial || has('name')) data.name = reqStr(b.name, 'Name', 120);
  if (!partial || has('platform')) data.platform = oneOf(b.platform, PLATFORMS, 'Platform');
  if (has('handle')) data.handle = str(b.handle, 120)?.replace(/^@/, '') ?? null;
  if (has('website')) data.website = httpUrl(b.website, 'Website');
  if (has('url')) data.url = httpUrl(b.url, 'Profile link');
  if (has('industry')) data.industry = str(b.industry, 80);
  if (has('notes')) data.notes = str(b.notes, 1000);
  if (has('monitoringStatus')) data.monitoringStatus = oneOf(b.monitoringStatus, ['ACTIVE', 'PAUSED'] as const, 'Status');
  return data;
};

export const createCompetitor = handle(async (req, res) => {
  const data = parseCompetitor((req.body ?? {}) as Record<string, unknown>, false) as Prisma.SmoisCompetitorUncheckedCreateInput;
  if (data.handle && (await prisma.smoisCompetitor.findFirst({ where: { platform: data.platform, handle: { equals: data.handle as string, mode: 'insensitive' } } }))) fail(409, 'That competitor account is already tracked.');
  const c = await prisma.smoisCompetitor.create({ data: { ...data, createdById: access(req).userId } });
  await smoisAudit(req, { action: 'COMPETITOR_ADDED', entity: 'SmoisMention', entityId: c.id, after: { name: c.name, platform: c.platform } });
  return apiResponse.success(res, 'Competitor added.', c, 201);
});

export const updateCompetitor = handle(async (req, res) => {
  const c = await prisma.smoisCompetitor.findUnique({ where: { id: req.params.id } });
  if (!c) return fail(404, 'Competitor not found.');
  const u = await prisma.smoisCompetitor.update({ where: { id: c.id }, data: parseCompetitor((req.body ?? {}) as Record<string, unknown>, true) });
  await smoisAudit(req, { action: 'COMPETITOR_UPDATED', entity: 'SmoisMention', entityId: c.id, before: { monitoringStatus: c.monitoringStatus }, after: { monitoringStatus: u.monitoringStatus } });
  return apiResponse.success(res, 'Saved.', u);
});

// POST /competitors/:id/snapshots { observedOn, followers?, postsLast7Days?, avgEngagement?, popularContent?, campaignNote?, dataKind }
export const addCompetitorSnapshot = handle(async (req, res) => {
  const c = await prisma.smoisCompetitor.findUnique({ where: { id: req.params.id } });
  if (!c) return fail(404, 'Competitor not found.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const day = reqStr(b.observedOn, 'Date observed', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parseYmd(day).getTime())) fail(400, 'Date must look like 2026-11-05.');
  if (day > lagosYmd(new Date())) fail(400, 'You cannot record a future date.');
  const whole = (v: unknown, label: string) => { if (v === undefined || v === null || v === '') return null; const n = Number(v); if (!Number.isInteger(n) || n < 0) fail(400, `${label} must be a whole number.`); return n; };
  const followers = whole(b.followers, 'Followers'); const posts = whole(b.postsLast7Days, 'Posts in the last 7 days');
  let avgEngagement: number | null = null;
  if (b.avgEngagement !== undefined && b.avgEngagement !== null && b.avgEngagement !== '') { avgEngagement = Number(b.avgEngagement); if (!Number.isFinite(avgEngagement) || avgEngagement < 0) fail(400, 'Engagement must be a number.'); }
  if (followers === null && posts === null && avgEngagement === null && !str(b.popularContent, 300) && !str(b.campaignNote, 300)) fail(400, 'Record at least one observation.');
  if (await prisma.smoisCompetitorSnapshot.findUnique({ where: { competitorId_observedOn: { competitorId: c.id, observedOn: parseYmd(day) } }, select: { id: true } })) fail(409, 'An observation for that day already exists.');
  const s = await prisma.smoisCompetitorSnapshot.create({ data: { competitorId: c.id, observedOn: parseYmd(day), followers, postsLast7Days: posts, avgEngagement, popularContent: str(b.popularContent, 300), campaignNote: str(b.campaignNote, 300), dataKind: oneOf(b.dataKind ?? 'PUBLIC_OBSERVATION', OBS_KINDS, 'Source'), enteredById: access(req).userId } });
  await smoisAudit(req, { action: 'COMPETITOR_OBSERVED', entity: 'SmoisMention', entityId: c.id, after: { date: day, followers, kind: s.dataKind } });
  return apiResponse.success(res, 'Observation recorded.', s, 201);
});

export const listCompetitorSnapshots = handle(async (req, res) => {
  const rows = await prisma.smoisCompetitorSnapshot.findMany({ where: { competitorId: req.params.id }, orderBy: { observedOn: 'desc' }, take: 60 });
  const names = await nameMap(rows.map((r) => r.enteredById));
  return apiResponse.success(res, 'Observations.', rows.map((r) => ({ ...r, observedOn: ymd(r.observedOn), enteredByName: names.get(r.enteredById) ?? null })));
});
