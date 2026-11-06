// SMOIS AI assistance and predictive insights.
// The AI endpoints only ever return drafts and suggestions. Forecasts, posting times and workflow suggestions are
// ordinary calculations on recorded data, labelled as estimates, and refuse to answer when there is too little data.
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { aiStatus, AiResult } from '../../services/smois/ai.service';
import { CONTENT_KINDS, askTheData, contentAssist, draftCommentary, suggestSentiment, ContentKind } from '../../services/smois/aiFeatures';
import { forecastFollowers, growthOutlook, bestPostingTimes, MAX_HORIZON_DAYS } from '../../services/smois/predict';
import { collectWorkflowMetrics, loadSnaps } from '../../services/smois/insights';
import { workflowFindings } from '../../services/smois/improve';
import { postEngagementRate, parseYmd, ymd } from '../../services/smois/analytics';
import { access, fail, handle, lagosYmd, nameMap, oneOf, readPeriod, reqStr, str, visibleAccountIds } from './common';

const DAY = 86_400_000;

/** Turn a failed AI result into the right HTTP answer; pass successes through. */
const respond = (res: Parameters<typeof apiResponse.success>[0], r: AiResult<unknown>, extra: Record<string, unknown> = {}) => {
  if (!r.ok) return apiResponse.error(res, r.message, r.code === 'LIMIT' ? 429 : r.code === 'ERROR' ? 502 : 503, [{ code: r.code }]);
  return apiResponse.success(res, 'Draft ready. Review it before you use it.', {
    ...(r.data as object), aiGenerated: true, reviewRequired: true, model: r.model, verification: r.verification,
    verificationNote: r.verification.unverified.length ? `These figures were not found in the data provided, so check them: ${r.verification.unverified.join(', ')}.` : null, ...extra,
  });
};

// GET /ai/status
export const getAiStatus = handle(async (req, res) => apiResponse.success(res, 'AI status.', await aiStatus(access(req).userId)));

// POST /ai/content { kind, platform?, targetPlatform?, format?, tone?, objective?, audience?, category?, text?, idea? }
export const aiContent = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const kind = oneOf(b.kind, CONTENT_KINDS, 'Kind') as ContentKind;
  if (['REWRITE', 'GRAMMAR', 'REPURPOSE'].includes(kind) && !str(b.text, 1500)) fail(400, 'Add the text to work on.');
  if (kind === 'BRIEF' && !str(b.idea, 1500)) fail(400, 'Describe the idea.');
  if (kind === 'REPURPOSE' && !str(b.targetPlatform, 30)) fail(400, 'Choose the platform to adapt it for.');
  const r = await contentAssist(access(req).userId, { kind, platform: str(b.platform, 30) ?? undefined, targetPlatform: str(b.targetPlatform, 30) ?? undefined, format: str(b.format, 30) ?? undefined, tone: str(b.tone, 80) ?? undefined, objective: str(b.objective, 300) ?? undefined, audience: str(b.audience, 200) ?? undefined, category: str(b.category, 80) ?? undefined, text: str(b.text, 1500) ?? undefined, idea: str(b.idea, 1500) ?? undefined });
  if (r.ok) await smoisAudit(req, { action: 'AI_ASSIST_USED', entity: 'SmoisAi', entityId: 'CONTENT', meta: { feature: 'CONTENT', kind, unverified: r.verification.unverified.length } });
  return respond(res, r);
});

// POST /ai/ask { question, period?, from?, to? }
export const aiAsk = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const question = reqStr(b.question, 'Question', 500);
  const p = readPeriod({ period: String(b.period ?? 'month'), ...(b.from ? { from: String(b.from) } : {}), ...(b.to ? { to: String(b.to) } : {}) });
  const r = await askTheData(access(req), question, p);
  if (r.ok) await smoisAudit(req, { action: 'AI_ASSIST_USED', entity: 'SmoisAi', entityId: 'ASK', meta: { feature: 'ASK', period: p.key, unverified: r.verification.unverified.length } });
  return respond(res, r, r.ok ? { period: { label: p.label, from: p.fromYmd, to: p.toYmd }, basisNote: 'Built only from the data this role is allowed to see.' } : {});
});

// POST /ai/report-commentary { reportId }
export const aiReportCommentary = handle(async (req, res) => {
  const a = access(req);
  const report = await prisma.smoisReport.findUnique({ where: { id: reqStr(req.body?.reportId, 'Report', 60) } });
  if (!report) return fail(404, 'Report not found.');
  if (report.authorId !== a.userId) fail(403, 'Only the author can draft commentary for a report.');
  if (report.status !== 'DRAFT' && report.status !== 'CLARIFICATION_REQUESTED') fail(409, 'This report is no longer editable.');
  const label = report.type.replace(/_/g, ' ').toLowerCase();
  const r = await draftCommentary(a.userId, { label, periodStart: ymd(report.periodStart), periodEnd: ymd(report.periodEnd), data: report.data });
  if (r.ok) await smoisAudit(req, { action: 'AI_ASSIST_USED', entity: 'SmoisAi', entityId: 'REPORT', meta: { feature: 'REPORT', report: report.id, unverified: r.verification.unverified.length } });
  return respond(res, r);
});

// POST /ai/sentiment { text } | { mentionId }
export const aiSentiment = handle(async (req, res) => {
  let text = str(req.body?.text, 1000);
  if (!text && req.body?.mentionId) text = (await prisma.smoisMention.findUnique({ where: { id: String(req.body.mentionId) }, select: { text: true } }))?.text ?? null;
  if (!text) fail(400, 'Provide the text of the mention.');
  const r = await suggestSentiment(access(req).userId, text as string);
  return respond(res, r, { note: 'A suggestion only. Applying it records the label as AI-assisted and reviewed by you.' });
});

// GET /ai/usage (super admin): requests by feature and outcome, and by person, over the last 30 days
export const aiUsage = handle(async (_req, res) => {
  const since = new Date(Date.now() - 30 * DAY);
  const [byFeature, byUser, unverified] = await Promise.all([
    prisma.smoisAiRequest.groupBy({ by: ['feature', 'status'], where: { createdAt: { gte: since } }, _count: true }),
    prisma.smoisAiRequest.groupBy({ by: ['userId'], where: { createdAt: { gte: since }, status: 'OK' }, _count: true }),
    prisma.smoisAiRequest.aggregate({ where: { createdAt: { gte: since }, status: 'OK' }, _sum: { unverifiedCount: true }, _count: true }),
  ]);
  const names = await nameMap(byUser.map((u) => u.userId));
  return apiResponse.success(res, 'AI usage.', {
    days: 30, successful: unverified._count, figuresFlaggedAsUnverified: unverified._sum.unverifiedCount ?? 0,
    byFeature: byFeature.map((r) => ({ feature: r.feature, status: r.status, count: r._count })),
    byPerson: byUser.map((u) => ({ name: names.get(u.userId) ?? 'Unknown', count: u._count })).sort((a, b) => b.count - a.count),
    note: 'Only who asked, which feature and the outcome are recorded. Questions and answers are not stored.',
  });
});

// ── Forecasts and timing (no model: arithmetic on recorded readings) ────────

// GET /insights/forecast?accountId&days=30
export const getForecast = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const accountId = reqStr(q.accountId, 'Account', 60);
  const days = Math.min(MAX_HORIZON_DAYS, Math.max(1, Number(q.days) || 30));
  const visible = await visibleAccountIds(access(req), { accountId });
  if (!visible.length) fail(403, 'You cannot see that account.');
  const today = lagosYmd(new Date());
  const snaps = (await loadSnaps([accountId], today)).get(accountId) ?? [];
  const readings = snaps.filter((s) => s.followers !== null).map((s) => ({ date: s.date, value: s.followers as number }));
  const targetDate = ymd(new Date(parseYmd(today).getTime() + days * DAY));
  const forecast = forecastFollowers(readings, targetDate);

  // Is a follower-growth goal on this account within reach?
  const goals = await prisma.smoisTarget.findMany({ where: { isActive: true, metric: 'FOLLOWER_GROWTH', scope: 'ACCOUNT', accountId, endsAt: { gt: new Date() } } });
  const outlooks = goals.map((g) => {
    const endYmd = lagosYmd(g.endsAt);
    const opening = [...readings].reverse().find((r) => r.date <= lagosYmd(g.startsAt)) ?? readings.find((r) => r.date >= lagosYmd(g.startsAt));
    const f = opening ? forecastFollowers(readings, endYmd) : null;
    const o = f && opening ? growthOutlook(f, opening.value, g.targetValue) : null;
    return { target: g.name, goal: g.targetValue, endsOn: endYmd, outlook: o?.outlook ?? null, projectedGrowth: o?.projectedGrowth ?? null, reason: f && !f.ok ? f.reason : !opening ? 'No reading before the target started.' : null };
  });
  return apiResponse.success(res, 'Forecast.', { account: visible[0], horizonDays: days, history: readings.slice(-60), forecast, outlooks });
});

// GET /insights/posting-times?accountId&platform
export const getPostingTimes = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const visible = await visibleAccountIds(access(req), { accountId: q.accountId, platform: q.platform });
  const since = new Date(Date.now() - 180 * DAY);
  const rows = await prisma.smoisVariant.findMany({
    where: { status: 'PUBLISHED', accountId: { in: visible.map((v) => v.id) }, publishedAt: { gte: since } },
    select: { publishedAt: true, postMetrics: { orderBy: { recordedAt: 'desc' }, take: 1 } },
  });
  const samples = rows.filter((r) => r.publishedAt).map((r) => ({ at: r.publishedAt as Date, rate: r.postMetrics[0] ? postEngagementRate(r.postMetrics[0]) : null }));
  return apiResponse.success(res, 'Posting times.', { scope: q.accountId ? visible[0]?.name ?? 'Account' : q.platform ? `${q.platform} accounts` : 'All visible accounts', published: samples.length, result: bestPostingTimes(samples) });
});

// GET /insights/workflow (management): suggestions from the department's own numbers
export const getWorkflowInsights = handle(async (_req, res) => {
  const metrics = await collectWorkflowMetrics(30);
  return apiResponse.success(res, 'Workflow suggestions.', { metrics, findings: workflowFindings(metrics), note: 'Fixed rules over the last 30 days of recorded work. Each suggestion shows the figures that triggered it.' });
});
