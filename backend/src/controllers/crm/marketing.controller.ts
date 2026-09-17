// Segments, campaigns and automations (admin). Mounted under /api/v1/admin/crm.
import { Request, Response } from 'express';
import { AutomationTrigger, Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import { CrmRole } from '../../services/crm/health.service';
import {
  SEGMENT_FIELDS, SegmentRuleError, SegmentRules, previewAudience, validateRules,
} from '../../services/crm/segment.service';
import {
  CampaignError, LIMITS, campaignStats, deliver, frequencyCapHours, validateContent,
} from '../../services/crm/campaign.service';
import { TRIGGERS, automationAudienceWhere, runAutomation } from '../../services/crm/automation.service';

const CRM_ROLES: CrmRole[] = ['CUSTOMER', 'VENDOR', 'RIDER'];
const MAX_SCHEDULE_DAYS = 30;

const audit = (userId: string, action: string, entity: string, entityId: string, meta?: Record<string, unknown>) =>
  prisma.auditLog.create({ data: { userId, action, entity, entityId, meta: meta as Prisma.InputJsonValue } });

/** Maps validation errors to 400s; rethrows anything else. */
const guard = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof SegmentRuleError || err instanceof CampaignError) return apiResponse.error(res, err.message, 400);
      throw err;
    }
  });

// ─── Segments ────────────────────────────────────────────────────────────────

export const listSegmentFields = catchAsync(async (_req: Request, res: Response) => {
  return apiResponse.success(res, 'Fields fetched.', {
    fields: SEGMENT_FIELDS,
    frequencyCapHours: frequencyCapHours(),
    limits: LIMITS,
  });
});

export const listSegments = catchAsync(async (_req: Request, res: Response) => {
  const segments = await prisma.segment.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, description: true, role: true, rules: true, cachedCount: true, lastComputedAt: true,
      updatedAt: true, createdBy: { select: { name: true } }, _count: { select: { campaigns: true } },
    },
  });
  return apiResponse.success(res, 'Segments fetched.', segments);
});

const parseSegmentInput = (body: Record<string, unknown>) => {
  const role = body.role as CrmRole;
  if (!CRM_ROLES.includes(role)) throw new SegmentRuleError('Choose who this segment is for.');
  const rules = validateRules(role, body.rules);
  return { role, rules };
};

// POST /segments/preview  { role, rules }
export const previewSegment = guard(async (req, res) => {
  const { role, rules } = parseSegmentInput(req.body ?? {});
  return apiResponse.success(res, 'Preview ready.', await previewAudience(role, rules));
});

// POST /segments  { name, description?, role, rules }
export const createSegment = guard(async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 80) return apiResponse.error(res, 'Name must be 1–80 characters.', 400);
  const { role, rules } = parseSegmentInput(req.body ?? {});
  const preview = await previewAudience(role, rules);

  const segment = await prisma.segment.create({
    data: {
      name, description: req.body?.description ? String(req.body.description).slice(0, 300) : null,
      role, rules: rules as unknown as Prisma.InputJsonValue,
      cachedCount: preview.optedIn, lastComputedAt: new Date(), createdById: req.user!.userId,
    },
  });
  await audit(req.user!.userId, 'CRM_SEGMENT_CREATED', 'Segment', segment.id, { name });
  return apiResponse.success(res, 'Segment saved.', segment, 201);
});

// GET /segments/:id  — includes a fresh audience preview
export const getSegment = guard(async (req, res) => {
  const segment = await prisma.segment.findUnique({ where: { id: req.params.id } });
  if (!segment) return apiResponse.error(res, 'Segment not found.', 404);
  const preview = await previewAudience(segment.role as CrmRole, segment.rules as unknown as SegmentRules);
  await prisma.segment.update({ where: { id: segment.id }, data: { cachedCount: preview.optedIn, lastComputedAt: new Date() } });
  return apiResponse.success(res, 'Segment fetched.', { ...segment, cachedCount: preview.optedIn, preview });
});

// PATCH /segments/:id  { name?, description?, role?, rules? }
export const updateSegment = guard(async (req, res) => {
  const segment = await prisma.segment.findUnique({ where: { id: req.params.id } });
  if (!segment) return apiResponse.error(res, 'Segment not found.', 404);

  const inFlight = await prisma.campaign.count({ where: { segmentId: segment.id, status: { in: ['SCHEDULED', 'SENDING'] } } });
  if (inFlight) return apiResponse.error(res, 'This segment is used by a scheduled or sending campaign. Cancel it first.', 409);

  const name = req.body?.name !== undefined ? String(req.body.name).trim() : segment.name;
  if (!name || name.length > 80) return apiResponse.error(res, 'Name must be 1–80 characters.', 400);
  const { role, rules } = parseSegmentInput({
    role: req.body?.role ?? segment.role,
    rules: req.body?.rules ?? segment.rules,
  });
  const preview = await previewAudience(role, rules);

  const updated = await prisma.segment.update({
    where: { id: segment.id },
    data: {
      name, role, rules: rules as unknown as Prisma.InputJsonValue,
      description: req.body?.description !== undefined ? (String(req.body.description).slice(0, 300) || null) : segment.description,
      cachedCount: preview.optedIn, lastComputedAt: new Date(),
    },
  });
  await audit(req.user!.userId, 'CRM_SEGMENT_UPDATED', 'Segment', segment.id, { name });
  return apiResponse.success(res, 'Segment updated.', updated);
});

export const deleteSegment = guard(async (req, res) => {
  const segment = await prisma.segment.findUnique({ where: { id: req.params.id } });
  if (!segment) return apiResponse.error(res, 'Segment not found.', 404);
  const inFlight = await prisma.campaign.count({ where: { segmentId: segment.id, status: { in: ['DRAFT', 'SCHEDULED', 'SENDING'] } } });
  if (inFlight) return apiResponse.error(res, 'Delete or finish the campaigns using this segment first.', 409);
  await prisma.segment.delete({ where: { id: segment.id } });
  await audit(req.user!.userId, 'CRM_SEGMENT_DELETED', 'Segment', segment.id, { name: segment.name });
  return apiResponse.success(res, 'Segment deleted.', { id: segment.id });
});

// ─── Campaigns ───────────────────────────────────────────────────────────────

const campaignListSelect = {
  id: true, name: true, status: true, channels: true, title: true, scheduledAt: true, startedAt: true,
  completedAt: true, audienceSize: true, createdAt: true, automationId: true,
  segment: { select: { id: true, name: true, role: true } },
  automation: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.CampaignSelect;

// GET /campaigns?status=&source=manual|automation
export const listCampaigns = catchAsync(async (req: Request, res: Response) => {
  const { status, source } = req.query as Record<string, string>;
  const where: Prisma.CampaignWhereInput = {};
  if (status && ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'].includes(status)) where.status = status as never;
  if (source === 'manual') where.automationId = null;
  if (source === 'automation') where.automationId = { not: null };

  const campaigns = await prisma.campaign.findMany({ where, select: campaignListSelect, orderBy: { createdAt: 'desc' }, take: 100 });
  const sent = campaigns.length
    ? await prisma.campaignRecipient.groupBy({
        by: ['campaignId', 'status'], where: { campaignId: { in: campaigns.map(c => c.id) } }, _count: { _all: true },
      })
    : [];
  const counts = new Map<string, Record<string, number>>();
  for (const row of sent) {
    const entry = counts.get(row.campaignId) ?? {};
    entry[row.status] = row._count._all;
    counts.set(row.campaignId, entry);
  }
  return apiResponse.success(res, 'Campaigns fetched.', campaigns.map(c => ({ ...c, deliveries: counts.get(c.id) ?? {} })));
});

const parseCampaignInput = async (body: Record<string, unknown>) => {
  const name = String(body.name ?? '').trim();
  if (!name || name.length > LIMITS.name) throw new CampaignError(`Name must be 1–${LIMITS.name} characters.`);
  const segmentId = String(body.segmentId ?? '');
  const segment = segmentId ? await prisma.segment.findUnique({ where: { id: segmentId } }) : null;
  if (!segment) throw new CampaignError('Choose a segment to send to.');
  return { name, segmentId: segment.id, ...validateContent(body) };
};

// POST /campaigns  — creates a DRAFT
export const createCampaign = guard(async (req, res) => {
  const input = await parseCampaignInput(req.body ?? {});
  const campaign = await prisma.campaign.create({ data: { ...input, createdById: req.user!.userId } });
  await audit(req.user!.userId, 'CRM_CAMPAIGN_CREATED', 'Campaign', campaign.id, { name: input.name });
  return apiResponse.success(res, 'Draft saved.', campaign, 201);
});

// GET /campaigns/:id
export const getCampaign = guard(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      segment: { select: { id: true, name: true, role: true, cachedCount: true } },
      automation: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!campaign) return apiResponse.error(res, 'Campaign not found.', 404);
  const [stats, failures] = await Promise.all([
    campaignStats(campaign.id),
    prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, status: 'FAILED' }, take: 20, orderBy: { updatedAt: 'desc' },
      select: { channel: true, error: true, user: { select: { id: true, name: true } } },
    }),
  ]);
  return apiResponse.success(res, 'Campaign fetched.', { ...campaign, stats, recentFailures: failures });
});

// PATCH /campaigns/:id  — drafts only
export const updateCampaign = guard(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return apiResponse.error(res, 'Campaign not found.', 404);
  if (campaign.status !== 'DRAFT' || campaign.automationId) return apiResponse.error(res, 'Only drafts can be edited.', 409);
  const input = await parseCampaignInput({ ...campaign, ...(req.body ?? {}) });
  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: input });
  return apiResponse.success(res, 'Draft updated.', updated);
});

export const deleteCampaign = guard(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return apiResponse.error(res, 'Campaign not found.', 404);
  if (campaign.status !== 'DRAFT') return apiResponse.error(res, 'Only drafts can be deleted. Cancel it instead.', 409);
  await prisma.campaign.delete({ where: { id: campaign.id } });
  await audit(req.user!.userId, 'CRM_CAMPAIGN_DELETED', 'Campaign', campaign.id, { name: campaign.name });
  return apiResponse.success(res, 'Draft deleted.', { id: campaign.id });
});

// POST /campaigns/:id/test  — sends the campaign to the requesting admin only
export const testCampaign = guard(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return apiResponse.error(res, 'Campaign not found.', 404);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { id: true, name: true, email: true, phone: true } });

  const results: Record<string, string> = {};
  for (const channel of campaign.channels) {
    try {
      await deliver(channel, campaign, me);
      results[channel] = channel === 'EMAIL' ? `sent to ${me.email}` : channel === 'SMS' ? `sent to ${me.phone}` : 'sent to your account';
    } catch (err) {
      results[channel] = `not sent: ${(err as Error).message}`;
    }
  }
  return apiResponse.success(res, 'Test sent.', results);
});

// POST /campaigns/:id/schedule  { scheduledAt?: ISO string }  — SUPER_ADMIN; omit scheduledAt to send now
export const scheduleCampaign = guard(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id }, include: { segment: true } });
  if (!campaign) return apiResponse.error(res, 'Campaign not found.', 404);
  if (campaign.status !== 'DRAFT') return apiResponse.error(res, 'Only drafts can be scheduled.', 409);
  if (!campaign.segment) return apiResponse.error(res, 'This campaign has no segment.', 400);
  validateContent(campaign as unknown as Record<string, unknown>);

  const now = new Date();
  let scheduledAt = now;
  if (req.body?.scheduledAt) {
    scheduledAt = new Date(String(req.body.scheduledAt));
    if (Number.isNaN(scheduledAt.getTime())) return apiResponse.error(res, 'Invalid date.', 400);
    if (scheduledAt.getTime() < now.getTime() - 60_000) return apiResponse.error(res, 'Pick a time in the future.', 400);
    if (scheduledAt.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 86_400_000) {
      return apiResponse.error(res, `Campaigns can be scheduled up to ${MAX_SCHEDULE_DAYS} days ahead.`, 400);
    }
  }

  const claimed = await prisma.campaign.updateMany({
    where: { id: campaign.id, status: 'DRAFT' }, data: { status: 'SCHEDULED', scheduledAt },
  });
  if (claimed.count === 0) return apiResponse.error(res, 'Campaign was changed by someone else. Refresh and try again.', 409);
  await audit(req.user!.userId, 'CRM_CAMPAIGN_SCHEDULED', 'Campaign', campaign.id, {
    name: campaign.name, scheduledAt, segment: campaign.segment.name, channels: campaign.channels,
  });
  return apiResponse.success(res, scheduledAt.getTime() <= now.getTime() ? 'Sending shortly.' : 'Campaign scheduled.', { scheduledAt });
});

// POST /campaigns/:id/cancel  — SUPER_ADMIN; stops anything not yet delivered
export const cancelCampaign = guard(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return apiResponse.error(res, 'Campaign not found.', 404);
  const claimed = await prisma.campaign.updateMany({
    where: { id: campaign.id, status: { in: ['SCHEDULED', 'SENDING'] } }, data: { status: 'CANCELLED', completedAt: new Date() },
  });
  if (claimed.count === 0) return apiResponse.error(res, 'Only scheduled or sending campaigns can be cancelled.', 409);
  const skipped = await prisma.campaignRecipient.updateMany({
    where: { campaignId: campaign.id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Campaign cancelled' },
  });
  await audit(req.user!.userId, 'CRM_CAMPAIGN_CANCELLED', 'Campaign', campaign.id, { name: campaign.name, skipped: skipped.count });
  return apiResponse.success(res, 'Campaign cancelled.', { skipped: skipped.count });
});

// ─── Automations ─────────────────────────────────────────────────────────────

export const listAutomations = catchAsync(async (_req: Request, res: Response) => {
  const automations = await prisma.crmAutomation.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      createdBy: { select: { name: true } },
      campaigns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, createdAt: true, audienceSize: true, status: true } },
      _count: { select: { campaigns: true } },
    },
  });
  const triggers = Object.fromEntries(Object.entries(TRIGGERS).map(([k, v]) => [k, { label: v.label, role: v.role }]));
  return apiResponse.success(res, 'Automations fetched.', {
    triggers,
    automations: automations.map(({ campaigns, _count, ...a }) => ({
      ...a,
      description: TRIGGERS[a.trigger].describe(a.days),
      lastCampaign: campaigns[0] ?? null,
      runs: _count.campaigns,
    })),
  });
});

const parseAutomationInput = (body: Record<string, unknown>) => {
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 80) throw new CampaignError('Name must be 1–80 characters.');
  const trigger = body.trigger as AutomationTrigger;
  if (!(trigger in TRIGGERS)) throw new CampaignError('Choose a trigger.');
  const days = Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new CampaignError('Days must be a whole number from 1 to 365.');
  const cooldownDays = body.cooldownDays === undefined ? 30 : Number(body.cooldownDays);
  if (!Number.isInteger(cooldownDays) || cooldownDays < 1 || cooldownDays > 365) {
    throw new CampaignError('Cooldown must be a whole number from 1 to 365 days.');
  }
  return { name, trigger, days, cooldownDays, enabled: body.enabled === true, ...validateContent(body) };
};

export const createAutomation = guard(async (req, res) => {
  const input = parseAutomationInput(req.body ?? {});
  const automation = await prisma.crmAutomation.create({ data: { ...input, createdById: req.user!.userId } });
  await audit(req.user!.userId, 'CRM_AUTOMATION_CREATED', 'CrmAutomation', automation.id, { name: input.name, enabled: input.enabled });
  return apiResponse.success(res, 'Automation saved.', automation, 201);
});

export const updateAutomation = guard(async (req, res) => {
  const automation = await prisma.crmAutomation.findUnique({ where: { id: req.params.id } });
  if (!automation) return apiResponse.error(res, 'Automation not found.', 404);
  const input = parseAutomationInput({ ...automation, ...(req.body ?? {}) });
  const updated = await prisma.crmAutomation.update({ where: { id: automation.id }, data: input });
  await audit(req.user!.userId, 'CRM_AUTOMATION_UPDATED', 'CrmAutomation', automation.id, { name: input.name, enabled: input.enabled });
  return apiResponse.success(res, 'Automation updated.', updated);
});

export const deleteAutomation = guard(async (req, res) => {
  const automation = await prisma.crmAutomation.findUnique({ where: { id: req.params.id } });
  if (!automation) return apiResponse.error(res, 'Automation not found.', 404);
  await prisma.crmAutomation.delete({ where: { id: automation.id } });
  await audit(req.user!.userId, 'CRM_AUTOMATION_DELETED', 'CrmAutomation', automation.id, { name: automation.name });
  return apiResponse.success(res, 'Automation deleted.', { id: automation.id });
});

// POST /automations/preview  { trigger, days, cooldownDays, id? }  — how many users would get it today
export const previewAutomation = guard(async (req, res) => {
  const trigger = req.body?.trigger as AutomationTrigger;
  if (!(trigger in TRIGGERS)) return apiResponse.error(res, 'Choose a trigger.', 400);
  const days = Number(req.body?.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) return apiResponse.error(res, 'Days must be 1–365.', 400);
  const cooldownDays = Number(req.body?.cooldownDays ?? 30) || 30;
  const count = await prisma.user.count({
    where: automationAudienceWhere({ id: String(req.body?.id ?? '00000000-0000-0000-0000-000000000000'), trigger, days, cooldownDays }),
  });
  return apiResponse.success(res, 'Preview ready.', { count, description: TRIGGERS[trigger].describe(days) });
});

// POST /automations/:id/run  — SUPER_ADMIN; runs immediately (cooldown still applies)
export const runAutomationNow = guard(async (req, res) => {
  const automation = await prisma.crmAutomation.findUnique({ where: { id: req.params.id } });
  if (!automation) return apiResponse.error(res, 'Automation not found.', 404);
  const queued = await runAutomation(automation);
  await prisma.crmAutomation.update({ where: { id: automation.id }, data: { lastRunAt: new Date() } });
  await audit(req.user!.userId, 'CRM_AUTOMATION_RUN', 'CrmAutomation', automation.id, { name: automation.name, queued });
  return apiResponse.success(res, queued ? `Queued for ${queued} users.` : 'Nobody matches right now.', { queued });
});
