// SMOIS campaigns: planning through evaluation. Results are copied in by people (paid and organic kept apart);
// post-level engagement comes from the readings already recorded on the linked published posts.
import { Prisma, SmoisCampaignStatus } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { ymd, parseYmd, postEngagement } from '../../services/smois/analytics';
import { campaignTotals, canMoveCampaign } from '../../services/smois/community';
import { can } from '../../services/smois/workflow';
import { access, date, fail, handle, httpUrl, isAssignedToAccount, managementUserIds, nameMap, notifyMany, oneOf, reqStr, str } from './common';

const TYPES = ['BRAND_AWARENESS', 'PRODUCT_LAUNCH', 'LEAD_GENERATION', 'ENGAGEMENT', 'RECRUITMENT', 'EVENT_PROMOTION', 'PARTNERSHIP_ANNOUNCEMENT', 'SALES_PROMOTION', 'PUBLIC_RELATIONS', 'CUSTOMER_EDUCATION'] as const;
const STATUSES: SmoisCampaignStatus[] = ['PLANNING', 'BRIEFING', 'PREPARATION', 'APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];
const CHANNELS = ['PAID', 'ORGANIC'] as const;

const listSelect = {
  id: true, number: true, name: true, type: true, status: true, startsAt: true, endsAt: true, budget: true, ownerId: true,
  _count: { select: { contents: true, accounts: true, members: true } },
} satisfies Prisma.SmoisCampaignSelect;

const count = (v: unknown, label: string): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) fail(400, `${label} must be a whole number, zero or more.`);
  return n;
};
const money = (v: unknown, label: string): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) fail(400, `${label} must be an amount of zero or more.`);
  return n;
};

const links = (v: unknown) => {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).map((x) => {
    const o = x as { label?: unknown; url?: unknown };
    return { label: str(o.label, 80) ?? 'Link', url: httpUrl(o.url, 'Tracking link') ?? fail(400, 'Each tracking link needs a URL.') };
  });
};

// GET /campaigns?view=active|upcoming|past|all
export const listCampaigns = handle(async (req, res) => {
  const view = String(req.query.view ?? 'active');
  const now = new Date();
  const where: Prisma.SmoisCampaignWhereInput =
    view === 'active' ? { status: { in: ['ACTIVE', 'PAUSED', 'APPROVAL', 'PREPARATION', 'BRIEFING', 'PLANNING'] }, endsAt: { gte: now } }
      : view === 'upcoming' ? { status: { notIn: ['CANCELLED', 'ARCHIVED', 'COMPLETED'] }, startsAt: { gt: now } }
        : view === 'past' ? { OR: [{ status: { in: ['COMPLETED', 'CANCELLED', 'ARCHIVED'] } }, { endsAt: { lt: now } }] } : {};
  const rows = await prisma.smoisCampaign.findMany({ where, select: listSelect, orderBy: { startsAt: 'desc' }, take: 100 });
  const owners = await nameMap(rows.map((r) => r.ownerId));
  return apiResponse.success(res, 'Campaigns.', rows.map((r) => ({ ...r, ownerName: owners.get(r.ownerId) ?? null })));
});

const parseCampaign = async (b: Record<string, unknown>, partial: boolean) => {
  const data: Prisma.SmoisCampaignUncheckedUpdateInput = {};
  const has = (k: string) => k in b;
  if (!partial || has('name')) data.name = reqStr(b.name, 'Name', 140);
  if (has('description')) data.description = str(b.description, 3000);
  if (has('objective')) data.objective = str(b.objective, 1000);
  if (has('type')) data.type = oneOf(b.type, TYPES, 'Type');
  if (has('targetAudience')) data.targetAudience = str(b.targetAudience, 500);
  if (has('expectedResults')) data.expectedResults = str(b.expectedResults, 1000);
  if (has('budget')) data.budget = money(b.budget, 'Budget');
  if (has('trackingLinks')) data.trackingLinks = links(b.trackingLinks) as Prisma.InputJsonValue;
  if (has('lessonsLearned')) data.lessonsLearned = str(b.lessonsLearned, 3000);
  if (has('recommendations')) data.recommendations = str(b.recommendations, 3000);
  if (has('ownerId')) data.ownerId = reqStr(b.ownerId, 'Owner', 60);
  if (!partial || has('startsAt')) { const d = date(b.startsAt, 'Start date'); if (!d) fail(400, 'Choose a start date.'); data.startsAt = d!; }
  if (!partial || has('endsAt')) { const d = date(b.endsAt, 'End date'); if (!d) fail(400, 'Choose an end date.'); data.endsAt = d!; }
  return data;
};

const setRelations = async (tx: Prisma.TransactionClient, id: string, b: Record<string, unknown>) => {
  if (Array.isArray(b.accountIds)) {
    const ids = [...new Set((b.accountIds as unknown[]).map(String))];
    const ok = await tx.smoisAccount.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true } });
    await tx.smoisCampaignAccount.deleteMany({ where: { campaignId: id } });
    await tx.smoisCampaignAccount.createMany({ data: ok.map((a) => ({ campaignId: id, accountId: a.id })) });
  }
  if (Array.isArray(b.memberIds)) {
    const ids = [...new Set((b.memberIds as unknown[]).map(String))];
    const ok = await tx.smoisMember.findMany({ where: { id: { in: ids }, isActive: true, role: { in: ['MANAGER', 'MANAGEMENT'] } }, select: { id: true } });
    await tx.smoisCampaignMember.deleteMany({ where: { campaignId: id } });
    await tx.smoisCampaignMember.createMany({ data: ok.map((m) => ({ campaignId: id, memberId: m.id })) });
  }
};

// POST /campaigns
export const createCampaign = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data = await parseCampaign(b, false);
  if ((data.endsAt as Date) <= (data.startsAt as Date)) fail(400, 'The end date must be after the start date.');
  const a = access(req);
  const ownerId = (data.ownerId as string | undefined) ?? a.userId;
  const c = await prisma.$transaction(async (tx) => {
    const created = await tx.smoisCampaign.create({ data: { ...(data as Prisma.SmoisCampaignUncheckedCreateInput), ownerId, createdById: a.userId }, select: { id: true, number: true, name: true } });
    await setRelations(tx, created.id, b);
    await smoisAudit(req, { action: 'CAMPAIGN_CREATED', entity: 'SmoisCampaign', entityId: created.id, after: { name: created.name } }, tx);
    return created;
  });
  if (Array.isArray(b.memberIds)) {
    const ms = await prisma.smoisMember.findMany({ where: { id: { in: b.memberIds as string[] } }, select: { userId: true } });
    await notifyMany(ms.map((m) => m.userId), { title: 'Added to a campaign', body: c.name, data: { link: `/smois/campaigns?open=${c.id}` } }, a.userId);
  }
  return apiResponse.success(res, 'Campaign created.', c, 201);
});

// GET /campaigns/:id
export const getCampaign = handle(async (req, res) => {
  const c = await prisma.smoisCampaign.findUnique({
    where: { id: req.params.id },
    include: {
      accounts: true, members: true, results: { orderBy: { recordedFor: 'desc' } },
      contents: { select: { id: true, number: true, title: true, variants: { select: { id: true, status: true, publishedAt: true, account: { select: { name: true, platform: true } } } } } },
    },
  });
  if (!c) return fail(404, 'Campaign not found.');
  const [accounts, members, names] = await Promise.all([
    prisma.smoisAccount.findMany({ where: { id: { in: c.accounts.map((x) => x.accountId) } }, select: { id: true, name: true, platform: true } }),
    prisma.smoisMember.findMany({ where: { id: { in: c.members.map((x) => x.memberId) } }, select: { id: true, user: { select: { name: true } } } }),
    nameMap([c.ownerId, ...c.results.map((r) => r.enteredById)]),
  ]);
  const totals = campaignTotals(c.results, c.budget);
  const variants = c.contents.flatMap((x) => x.variants);
  const published = variants.filter((v) => v.status === 'PUBLISHED').length;
  return apiResponse.success(res, 'Campaign.', {
    ...c, ownerName: names.get(c.ownerId) ?? null, accounts, members: members.map((m) => ({ id: m.id, name: m.user.name })),
    results: c.results.map((r) => ({ ...r, recordedFor: ymd(r.recordedFor), enteredByName: names.get(r.enteredById) ?? null })),
    totals, content: { briefs: c.contents.length, versions: variants.length, published },
  });
});

// PATCH /campaigns/:id
export const updateCampaign = handle(async (req, res) => {
  const c = await prisma.smoisCampaign.findUnique({ where: { id: req.params.id } });
  if (!c) return fail(404, 'Campaign not found.');
  if (['CANCELLED', 'ARCHIVED'].includes(c.status)) fail(409, 'This campaign is closed.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data = await parseCampaign(b, true);
  const start = (data.startsAt as Date | undefined) ?? c.startsAt; const end = (data.endsAt as Date | undefined) ?? c.endsAt;
  if (end <= start) fail(400, 'The end date must be after the start date.');
  const u = await prisma.$transaction(async (tx) => {
    const x = await tx.smoisCampaign.update({ where: { id: c.id }, data, select: { id: true, name: true, budget: true } });
    await setRelations(tx, c.id, b);
    await smoisAudit(req, { action: 'CAMPAIGN_UPDATED', entity: 'SmoisCampaign', entityId: c.id, before: { name: c.name, budget: c.budget }, after: { name: x.name, budget: x.budget } }, tx);
    return x;
  });
  return apiResponse.success(res, 'Campaign updated.', u);
});

// POST /campaigns/:id/status { status, note? }
export const setCampaignStatus = handle(async (req, res) => {
  const c = await prisma.smoisCampaign.findUnique({ where: { id: req.params.id }, include: { members: true } });
  if (!c) return fail(404, 'Campaign not found.');
  const to = oneOf(req.body?.status, STATUSES, 'Status');
  if (!canMoveCampaign(c.status, to)) fail(409, `A campaign cannot go from ${c.status.toLowerCase()} to ${to.toLowerCase()}.`);
  if (to === 'COMPLETED' && !c.lessonsLearned?.trim() && !str(req.body?.lessonsLearned, 3000)) fail(400, 'Write the lessons learned before completing the campaign.');
  await prisma.$transaction(async (tx) => {
    await tx.smoisCampaign.update({ where: { id: c.id }, data: { status: to, ...(req.body?.lessonsLearned ? { lessonsLearned: str(req.body.lessonsLearned, 3000) } : {}), ...(req.body?.recommendations ? { recommendations: str(req.body.recommendations, 3000) } : {}) } });
    await smoisAudit(req, { action: 'CAMPAIGN_STATUS_CHANGED', entity: 'SmoisCampaign', entityId: c.id, before: { status: c.status }, after: { status: to }, meta: { note: str(req.body?.note, 300) } }, tx);
  });
  const ms = await prisma.smoisMember.findMany({ where: { id: { in: c.members.map((m) => m.memberId) } }, select: { userId: true } });
  await notifyMany([c.ownerId, ...ms.map((m) => m.userId)], { title: `Campaign ${to.toLowerCase()}`, body: c.name, data: { link: `/smois/campaigns?open=${c.id}` }, email: to === 'ACTIVE' || to === 'COMPLETED' }, access(req).userId);
  if (to === 'APPROVAL') await notifyMany(await managementUserIds(), { title: 'Campaign awaiting approval', body: c.name, data: { link: `/smois/campaigns?open=${c.id}` } }, access(req).userId);
  return apiResponse.success(res, 'Status updated.');
});

// POST /campaigns/:id/results { channel, recordedFor, reach?, impressions?, engagement?, clicks?, leads?, conversions?, spend?, revenue?, note? }
export const addResult = handle(async (req, res) => {
  const a = access(req);
  const c = await prisma.smoisCampaign.findUnique({ where: { id: req.params.id }, include: { members: true } });
  if (!c) return fail(404, 'Campaign not found.');
  const onTeam = !!a.memberId && c.members.some((m) => m.memberId === a.memberId);
  if (!can(a, 'manageCampaigns') && !(can(a, 'recordMetrics') && onTeam)) fail(403, 'Only management or the campaign team can record results.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const channel = oneOf(b.channel, CHANNELS, 'Channel');
  const day = reqStr(b.recordedFor, 'Date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parseYmd(day).getTime())) fail(400, 'Date must look like 2026-11-05.');
  const v = {
    reach: count(b.reach, 'Reach'), impressions: count(b.impressions, 'Impressions'), engagement: count(b.engagement, 'Engagement'), clicks: count(b.clicks, 'Clicks'),
    leads: count(b.leads, 'Leads'), conversions: count(b.conversions, 'Conversions'), spend: money(b.spend, 'Spend'), revenue: money(b.revenue, 'Revenue'),
  };
  if (Object.values(v).every((x) => x === null)) fail(400, 'Enter at least one figure.');
  if (channel === 'ORGANIC' && v.spend !== null) fail(400, 'Organic results have no ad spend. Record paid results separately.');
  const r = await prisma.smoisCampaignResult.create({ data: { campaignId: c.id, channel, recordedFor: parseYmd(day), ...v, note: str(b.note, 300), enteredById: a.userId } });
  await smoisAudit(req, { action: 'CAMPAIGN_RESULT_RECORDED', entity: 'SmoisCampaign', entityId: c.id, after: { channel, date: day, ...v } });
  return apiResponse.success(res, 'Result recorded.', r, 201);
});

// POST /campaigns/:id/content { contentId, link: boolean }
export const linkContent = handle(async (req, res) => {
  const a = access(req);
  const c = await prisma.smoisCampaign.findUnique({ where: { id: req.params.id }, include: { members: true, accounts: true } });
  if (!c) return fail(404, 'Campaign not found.');
  const content = await prisma.smoisContent.findUnique({ where: { id: reqStr(req.body?.contentId, 'Content', 60) }, select: { id: true, title: true, creatorId: true, campaignId: true, variants: { select: { accountId: true } } } });
  if (!content) return fail(404, 'Content not found.');
  const onTeam = !!a.memberId && c.members.some((m) => m.memberId === a.memberId);
  if (!can(a, 'manageCampaigns') && !(onTeam && (content.creatorId === a.userId || (await Promise.all(content.variants.map((v) => isAssignedToAccount(a.memberId, v.accountId)))).some(Boolean)))) fail(403, 'You are not on this campaign.');
  const link = req.body?.link !== false;
  if (link && content.campaignId && content.campaignId !== c.id) fail(409, 'That content already belongs to another campaign.');
  await prisma.smoisContent.update({ where: { id: content.id }, data: { campaignId: link ? c.id : null } });
  await smoisAudit(req, { action: link ? 'CAMPAIGN_CONTENT_LINKED' : 'CAMPAIGN_CONTENT_UNLINKED', entity: 'SmoisCampaign', entityId: c.id, meta: { content: content.title } });
  return apiResponse.success(res, link ? 'Linked.' : 'Unlinked.');
});

// GET /campaigns/:id/summary: planned against actual, for the end-of-campaign evaluation
export const getSummary = handle(async (req, res) => {
  const c = await prisma.smoisCampaign.findUnique({ where: { id: req.params.id }, include: { results: true, contents: { select: { id: true, title: true, variants: { select: { id: true, status: true, plannedAt: true, publishedAt: true, account: { select: { name: true, platform: true } }, postMetrics: { orderBy: { recordedAt: 'desc' }, take: 1 } } } } } } });
  if (!c) return fail(404, 'Campaign not found.');
  const variants = c.contents.flatMap((x) => x.variants.map((v) => ({ ...v, title: x.title })));
  const live = variants.filter((v) => !['CANCELLED', 'ARCHIVED', 'REJECTED'].includes(v.status));
  const published = variants.filter((v) => v.status === 'PUBLISHED');
  const measured = published.filter((v) => v.postMetrics[0]);
  const sumField = (f: 'reach' | 'impressions' | 'clicks') => { const xs = measured.map((v) => v.postMetrics[0][f]).filter((n): n is number => n !== null); return xs.length ? xs.reduce((p, q) => p + q, 0) : null; };
  const engs = measured.map((v) => postEngagement(v.postMetrics[0])).filter((n): n is number => n !== null);
  const totals = campaignTotals(c.results, c.budget);
  return apiResponse.success(res, 'Campaign summary.', {
    campaign: { id: c.id, name: c.name, status: c.status, objective: c.objective, startsAt: c.startsAt, endsAt: c.endsAt },
    objectiveAndExpectation: { objective: c.objective, expectedResults: c.expectedResults },
    output: { plannedVersions: live.length, publishedVersions: published.length, publishedPct: live.length ? Math.round((published.length / live.length) * 100) : null },
    organicFromPosts: { postsWithReadings: measured.length, reach: sumField('reach'), impressions: sumField('impressions'), clicks: sumField('clicks'), engagement: engs.length ? engs.reduce((p, q) => p + q, 0) : null, source: 'Readings recorded on the linked published posts' },
    enteredResults: totals, budget: totals.budget,
    lessonsLearned: c.lessonsLearned, recommendations: c.recommendations,
    note: 'Paid and organic results are reported separately. Figures marked null were not recorded.',
  });
});
