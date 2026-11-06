// The four AI features: content help, questions about the data, report commentary, and a sentiment suggestion.
// Each builds its own narrow set of facts, so the model never sees more than the request needs.
import prisma from '../../config/db';
import { SmoisAccess, can, qualityWarnings } from './workflow';
import { BASE_RULES, AiResult, runAi } from './ai.service';
import { accountSummaries, rankedPosts, rollup, topAndBottom, targetActual, loadSlaConfig } from './insights';
import { campaignTotals, responseMinutes } from './community';
import { TASK_DONE } from './workflow';
import { visibleAccountIds } from '../../controllers/smois/common';

type Period = { key: string; label: string; from: Date; to: Date; fromYmd: string; toYmd: string; asOfYmd: string };

// ── Content assistant ───────────────────────────────────────────────────────

export const CONTENT_KINDS = ['CAPTIONS', 'HASHTAGS', 'REWRITE', 'GRAMMAR', 'REPURPOSE', 'BRIEF', 'IDEAS'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

const KIND_TASK: Record<ContentKind, string> = {
  CAPTIONS: 'Write 3 different captions for the platform, each a different angle, each within the platform character limit.',
  HASHTAGS: 'Suggest 3 sets of up to 8 relevant hashtags. Put each set on one line. Do not use hashtags that make claims.',
  REWRITE: 'Rewrite the current text for the platform and tone. Keep every fact, name and number exactly as written. Give 2 options.',
  GRAMMAR: 'Correct spelling and grammar only. Return ONE suggestion: the corrected text. In the note, list what you changed in under 40 words. Do not change meaning, names or numbers.',
  REPURPOSE: 'Adapt the source post to the target platform\'s style and character limit. Keep every fact and number. Give 2 options.',
  BRIEF: 'Draft a short content brief from the idea: objective, audience, key message, suggested format and call to action. Return ONE suggestion with line breaks.',
  IDEAS: 'Suggest 5 post ideas that fit the category and objective. One line each, with a one-line reason in the note. Do not invent offers, prices, dates or events.',
};
const CAPTION_LIKE: ContentKind[] = ['CAPTIONS', 'REWRITE', 'GRAMMAR', 'REPURPOSE'];

const SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: { suggestions: { type: 'array', maxItems: 5, items: { type: 'object', properties: { text: { type: 'string' }, note: { type: 'string' } }, required: ['text', 'note'], additionalProperties: false } } },
  required: ['suggestions'], additionalProperties: false,
};

export interface ContentAssistInput { kind: ContentKind; platform?: string; targetPlatform?: string; format?: string; tone?: string; objective?: string; audience?: string; category?: string; text?: string; idea?: string }

const clip = (v: unknown, n = 1500) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Approved, in-date brand wording the team has put in the library (as the asset's description). */
const brandContext = async (): Promise<string[]> => {
  const now = new Date();
  const rows = await prisma.smoisAsset.findMany({
    where: { category: { in: ['APPROVED_CAPTION', 'CORPORATE_DESCRIPTION'] }, approvalStatus: 'APPROVED', archivedAt: null, description: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { category: true, description: true }, orderBy: { createdAt: 'desc' }, take: 6,
  });
  return rows.map((r) => `${r.category === 'APPROVED_CAPTION' ? 'Approved wording' : 'About the company'}: ${clip(r.description, 300)}`);
};

export const contentAssist = async (userId: string, i: ContentAssistInput) => {
  const platform = (i.kind === 'REPURPOSE' ? i.targetPlatform : i.platform) ?? 'INSTAGRAM';
  const brand = await brandContext();
  const given = [i.objective, i.audience, i.category, i.text, i.idea, i.tone].map((x) => clip(x)).filter(Boolean);
  const user = [
    `Task: ${KIND_TASK[i.kind]}`,
    `Platform: ${platform}`,
    i.kind === 'REPURPOSE' && i.platform ? `Source platform: ${i.platform}` : '',
    i.format ? `Format: ${i.format}` : '', i.tone ? `Tone: ${clip(i.tone, 80)}` : '',
    i.objective ? `Objective: ${clip(i.objective, 300)}` : '', i.audience ? `Audience: ${clip(i.audience, 200)}` : '', i.category ? `Category: ${clip(i.category, 80)}` : '',
    i.text ? `Current text:\n${clip(i.text)}` : '', i.idea ? `Idea:\n${clip(i.idea)}` : '',
    brand.length ? `Brand context (follow this wording and voice):\n${brand.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const res = await runAi<{ suggestions: { text: string; note: string }[] }>({
    userId, feature: 'CONTENT', system: `${BASE_RULES} Any price, discount, date or number in your suggestions must come from the text provided.`, user, schema: SUGGESTIONS_SCHEMA,
    // Numbers in suggestions must come from what the person supplied or the approved brand wording.
    facts: [...given, ...brand], textOf: (d) => d.suggestions.map((s) => s.text).join('\n'),
  });
  if (!res.ok) return res;
  const lim = CAPTION_LIKE.includes(i.kind);
  return { ...res, data: { kind: i.kind, platform, suggestions: res.data.suggestions.slice(0, 5).map((s) => ({ ...s, warnings: lim ? qualityWarnings(platform, { caption: s.text, hashtags: [], mediaUrls: [{}], linkUrl: null }, 'TEXT') : [] })) } };
};

// ── Ask the data ────────────────────────────────────────────────────────────

const ANSWER_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' }, basis: { type: 'array', items: { type: 'string' } }, notRecorded: { type: 'array', items: { type: 'string' } } },
  required: ['answer', 'basis', 'notRecorded'], additionalProperties: false,
};

/**
 * Everything the assistant may talk about, limited to what THIS person is allowed to see:
 * managers get their assigned accounts only, and per-person figures need performance access.
 */
export const buildFactsPack = async (a: SmoisAccess, p: Period) => {
  const pack: Record<string, unknown> = {
    period: { label: p.label, from: p.fromYmd, to: p.toYmd },
    dataStatus: 'Figures are entered by staff and not verified by the platforms. "null" means not recorded.',
  };
  const unavailable: string[] = ['Platform-verified figures (no platform is connected)'];

  if (can(a, 'viewAnalytics')) {
    const accounts = await visibleAccountIds(a);
    const sums = await accountSummaries(accounts, p.fromYmd, p.toYmd, p.asOfYmd);
    pack.scope = a.level === 'MANAGER' ? 'Only the accounts this person is assigned to' : 'All company accounts';
    pack.audience = rollup(sums);
    pack.accounts = sums.map((s) => ({ name: s.name, platform: s.platform, followers: s.current.closing?.value ?? null, netGrowth: s.current.netGrowth, growthPct: s.current.growthPct, reach: s.current.totals.reach, impressions: s.current.totals.impressions, engagement: s.current.totals.engagement, engagementRatePct: s.current.engagementRateReach, daysRecorded: s.current.daysWithData, daysExpected: s.current.daysExpected, previousFollowers: s.previous.closing?.value ?? null }));
    const posts = await rankedPosts(accounts.map((x) => x.id), p.from, p.to);
    const r = topAndBottom(posts, 3);
    pack.topPosts = r.top.map((x) => ({ title: x.title, account: x.account, engagementRatePct: x.engagementRate, engagement: x.engagement, reach: x.reach }));
    pack.lowestPosts = r.bottom.map((x) => ({ title: x.title, account: x.account, engagementRatePct: x.engagementRate }));
    pack.postsPublished = posts.length;
    const sentiment = await prisma.smoisMention.groupBy({ by: ['sentiment'], where: { occurredAt: { gte: p.from, lte: p.to } }, _count: true });
    pack.mentionsLoggedBySentiment = Object.fromEntries(sentiment.map((s) => [s.sentiment.toLowerCase(), s._count]));
  } else unavailable.push('Account analytics (this role cannot see them)');

  if (can(a, 'createContent') || can(a, 'viewAll')) {
    const inRange = { gte: p.from, lte: p.to };
    const [created, approved, published, failed, awaiting] = await Promise.all([
      prisma.smoisVariant.count({ where: { createdAt: inRange } }), prisma.smoisVariant.count({ where: { approvedAt: inRange } }),
      prisma.smoisVariant.count({ where: { status: 'PUBLISHED', publishedAt: inRange } }), prisma.smoisPublishAttempt.count({ where: { success: false, createdAt: inRange } }),
      prisma.smoisVariant.count({ where: { status: { in: ['SUBMITTED', 'RESUBMITTED'] } } }),
    ]);
    pack.content = { created, approved, published, failedPublications: failed, awaitingApprovalNow: awaiting };
  }

  if (can(a, 'viewAll') && a.level !== 'VIEWER') {
    const [assigned, completed, open, overdue] = await Promise.all([
      prisma.smoisTask.count({ where: { createdAt: { gte: p.from, lte: p.to } } }), prisma.smoisTask.count({ where: { status: 'COMPLETED', completedAt: { gte: p.from, lte: p.to } } }),
      prisma.smoisTask.count({ where: { status: { notIn: TASK_DONE } } }), prisma.smoisTask.count({ where: { status: { notIn: TASK_DONE }, deadline: { lt: new Date() } } }),
    ]);
    pack.tasks = { assignedInPeriod: assigned, completedInPeriod: completed, openNow: open, overdueNow: overdue };
  }
  if (can(a, 'viewPerformance')) {
    const members = await prisma.smoisMember.findMany({ where: { isActive: true, role: { in: ['MANAGER', 'MANAGEMENT'] } }, select: { id: true, userId: true, user: { select: { name: true } } } });
    pack.people = await Promise.all(members.map(async (m) => ({
      name: m.user.name,
      postsPublished: await prisma.smoisVariant.count({ where: { creatorId: m.userId, status: 'PUBLISHED', publishedAt: { gte: p.from, lte: p.to } } }),
      tasksCompleted: await prisma.smoisTask.count({ where: { assigneeId: m.id, status: 'COMPLETED', completedAt: { gte: p.from, lte: p.to } } }),
      tasksOverdueNow: await prisma.smoisTask.count({ where: { assigneeId: m.id, status: { notIn: TASK_DONE }, deadline: { lt: new Date() } } }),
    })));
  } else unavailable.push('Per-person figures (restricted to management)');

  if (can(a, 'viewCampaigns')) {
    const camps = await prisma.smoisCampaign.findMany({ where: { startsAt: { lte: p.to }, endsAt: { gte: p.from }, status: { notIn: ['CANCELLED'] } }, include: { results: true }, take: 12 });
    pack.campaigns = camps.map((c) => { const t = campaignTotals(c.results, c.budget); return { name: c.name, status: c.status, budget: c.budget, spentPaid: t.paid.spend, paidReach: t.paid.reach, organicReach: t.organic.reach, leads: t.paid.leads, costPerLead: t.paid.costPerLead, returnOnAdSpend: t.paid.returnOnAdSpend }; });
  }

  if (can(a, 'handleInbox')) {
    const cfg = await loadSlaConfig();
    const convs = await prisma.smoisConversation.findMany({ where: { receivedAt: { gte: p.from, lte: p.to } }, select: { receivedAt: true, firstResponseAt: true, slaDueAt: true, priority: true, status: true, resolvedAt: true } });
    const answered = convs.filter((c) => c.firstResponseAt);
    const mins = answered.map((c) => responseMinutes(c.receivedAt, c.firstResponseAt as Date, c.priority, cfg));
    pack.community = {
      conversationsLogged: convs.length, resolved: convs.filter((c) => c.resolvedAt).length,
      unansweredOpen: convs.filter((c) => !c.firstResponseAt && !['RESOLVED', 'CLOSED'].includes(c.status)).length,
      avgFirstResponseMinutes: mins.length ? Math.round(mins.reduce((x, y) => x + y, 0) / mins.length) : null,
      withinTargetPct: answered.length ? Math.round((answered.filter((c) => c.slaDueAt && (c.firstResponseAt as Date) <= c.slaDueAt).length / answered.length) * 100) : null,
    };
  }

  const targets = await prisma.smoisTarget.findMany({ where: { isActive: true, startsAt: { lte: p.to }, endsAt: { gte: p.from }, ...(can(a, 'viewPerformance') ? {} : { scope: { not: 'EMPLOYEE' } }) }, take: 15 });
  if (targets.length && can(a, 'viewAnalytics')) {
    pack.targets = await Promise.all(targets.map(async (t) => { const pr = await targetActual(t); return { name: t.name, measure: t.metric, target: t.targetValue, actual: pr.actual, achievedPct: pr.percent, status: pr.status }; }));
  }
  pack.notAvailable = unavailable;
  return pack;
};

export const askTheData = async (a: SmoisAccess, question: string, p: Period): Promise<AiResult<{ answer: string; basis: string[]; notRecorded: string[]; period: string }> & { facts?: unknown }> => {
  const facts = await buildFactsPack(a, p);
  const res = await runAi<{ answer: string; basis: string[]; notRecorded: string[] }>({
    userId: a.userId, feature: 'ASK', schema: ANSWER_SCHEMA, facts, textOf: (d) => d.answer,
    system: `${BASE_RULES} Answer the question in at most 120 words and say which period the figures cover. Put in "basis" the names of the sections of the data you used. Put in "notRecorded" anything the question asked about that the data does not contain. If the data does not answer the question, say so plainly instead of guessing.`,
    user: `Question: ${question}\n\nFACTS:\n${JSON.stringify(facts)}`,
  });
  if (!res.ok) return res;
  return { ...res, data: { ...res.data, period: p.label }, facts };
};

// ── Report commentary ───────────────────────────────────────────────────────

const COMMENTARY_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' }, achievements: { type: 'string' }, challenges: { type: 'string' }, observations: { type: 'string' }, recommendations: { type: 'string' }, plans: { type: 'string' } },
  required: ['summary', 'achievements', 'challenges', 'observations', 'recommendations', 'plans'], additionalProperties: false,
};

export const draftCommentary = async (userId: string, report: { label: string; periodStart: string; periodEnd: string; data: unknown }) => {
  const res = await runAi<Record<string, string>>({
    userId, feature: 'REPORT', schema: COMMENTARY_SCHEMA, facts: report.data, textOf: (d) => Object.values(d).join('\n'),
    system: `${BASE_RULES} You draft the commentary section of a ${report.label}. Write only what the figures support. If a field has no basis in the data, return it as an empty string: the author will add their own knowledge (challenges, delays and plans usually come from them, not from numbers). Each field at most 80 words. Never mention individual staff by name in a weekly report.`,
    user: `Report period: ${report.periodStart} to ${report.periodEnd}\n\nFACTS:\n${JSON.stringify(report.data)}`,
    maxTokens: 1500,
  });
  return res;
};

// ── Sentiment suggestion ────────────────────────────────────────────────────

const SENTIMENT_SCHEMA = {
  type: 'object',
  properties: { sentiment: { type: 'string', enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNCERTAIN'] }, confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }, reason: { type: 'string' } },
  required: ['sentiment', 'confidence', 'reason'], additionalProperties: false,
};

export const suggestSentiment = async (userId: string, text: string) => {
  const res = await runAi<{ sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNCERTAIN'; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; reason: string }>({
    userId, feature: 'SENTIMENT', schema: SENTIMENT_SCHEMA,
    system: 'Classify the sentiment of a public social media mention about a food and goods delivery company as POSITIVE, NEUTRAL, NEGATIVE or UNCERTAIN. Use UNCERTAIN for sarcasm, mixed or unclear text, and set confidence LOW when you are not sure. Give a one-sentence reason of at most 20 words. This is a suggestion that a person will review.',
    user: `Mention:\n${text.trim().slice(0, 1000)}`, maxTokens: 300,
  });
  if (!res.ok) return res;
  // A low-confidence label is not offered as a real one.
  const data = res.data.confidence === 'LOW' ? { ...res.data, sentiment: 'UNCERTAIN' as const } : res.data;
  return { ...res, data };
};

