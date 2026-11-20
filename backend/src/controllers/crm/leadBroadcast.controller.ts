// Lead broadcasts (SMS/email to pipeline leads). Staff routes live under /api/v1/admin/crm; the
// opt-out endpoint is public and lives under /api/v1/marketing.
import { Request, Response } from 'express';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import {
  BroadcastError, broadcastStats, cancelBroadcast, dailyCap, leadFrequencyCapHours, leadIdForCode, optInLead, optOutLead,
  parseFilters, previewBroadcast, smsCostPerPageNgn, startBroadcast, validateContent,
} from '../../services/crm/leadBroadcast.service';
import { LEAD_LIMITS } from '../../services/crm/outreach';

const guard = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof BroadcastError) return apiResponse.error(res, err.message, err.status);
      throw err;
    }
  });

// GET /lead-broadcasts/settings — limits the compose form shows
export const getBroadcastSettings = catchAsync(async (_req: Request, res: Response) => {
  return apiResponse.success(res, 'Settings fetched.', {
    limits: LEAD_LIMITS,
    frequencyCapHours: leadFrequencyCapHours(),
    dailyCaps: { SMS: dailyCap('SMS'), EMAIL: dailyCap('EMAIL') },
    smsConfigured: Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID),
    smsCostPerPageNgn: smsCostPerPageNgn(),
  });
});

// GET /lead-broadcasts
export const listBroadcasts = catchAsync(async (_req: Request, res: Response) => {
  const rows = await prisma.leadBroadcast.findMany({
    orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, name: true, channels: true, status: true, audienceSize: true, startedAt: true, completedAt: true, createdAt: true, createdBy: { select: { name: true } } },
  });
  const counts = await prisma.leadBroadcastRecipient.groupBy({
    by: ['broadcastId', 'status'], where: { broadcastId: { in: rows.map((r) => r.id) } }, _count: { _all: true },
  });
  const byBroadcast = new Map<string, Record<string, number>>();
  for (const c of counts) byBroadcast.set(c.broadcastId, { ...(byBroadcast.get(c.broadcastId) ?? {}), [c.status]: c._count._all });
  return apiResponse.success(res, 'Broadcasts fetched.', rows.map((r) => ({ ...r, deliveries: byBroadcast.get(r.id) ?? {} })));
});

// GET /lead-broadcasts/:id
export const getBroadcast = catchAsync(async (req: Request, res: Response) => {
  const b = await prisma.leadBroadcast.findUnique({ where: { id: req.params.id }, include: { createdBy: { select: { id: true, name: true } } } });
  if (!b) return apiResponse.error(res, 'Broadcast not found.', 404);
  return apiResponse.success(res, 'Broadcast fetched.', { ...b, stats: await broadcastStats(b.id) });
});

// POST /lead-broadcasts/preview  { filters, channels, body, emailSubject? }
export const previewLeadBroadcast = guard(async (req, res) => {
  const content = validateContent(req.body ?? {});
  const { preview } = await previewBroadcast(parseFilters(req.body?.filters), content);
  return apiResponse.success(res, 'Preview ready.', preview);
});

// POST /lead-broadcasts  { name, filters, channels, body, emailSubject?, ctaUrl? }  — SUPER_ADMIN
export const sendLeadBroadcast = guard(async (req, res) => {
  const content = validateContent(req.body ?? {});
  const { broadcast, queued } = await startBroadcast(
    { name: String(req.body?.name ?? ''), filters: parseFilters(req.body?.filters), content },
    req.user!.userId,
  );
  return apiResponse.success(res, `Sending to ${queued} ${queued === 1 ? 'message' : 'messages'}.`, { id: broadcast.id, queued }, 201);
});

// POST /lead-broadcasts/:id/cancel  — SUPER_ADMIN
export const stopLeadBroadcast = guard(async (req, res) => {
  await cancelBroadcast(req.params.id, req.user!.userId);
  return apiResponse.success(res, 'Broadcast stopped. Messages already sent cannot be recalled.', { id: req.params.id });
});

// POST /leads/:id/opt-out  — staff record that the lead asked them to stop. Only the person can opt back in.
export const optOutLeadHandler = guard(async (req, res) => {
  await optOutLead(req.params.id, 'STAFF', req.user!.userId);
  return apiResponse.success(res, 'Marked as opted out. No marketing messages will go to this lead.', { id: req.params.id });
});

// POST /marketing/lead-stop  { code, resubscribe? }  — public, from the link in broadcast SMS/email
export const leadStopByCode = catchAsync(async (req: Request, res: Response) => {
  const leadId = await leadIdForCode(req.body?.code);
  if (!leadId) return apiResponse.error(res, 'This link is invalid.', 400);
  if (req.body?.resubscribe === true) {
    await optInLead(leadId);
    return apiResponse.success(res, 'You\'ll hear from us again.', { optedOut: false });
  }
  await optOutLead(leadId, 'LINK');
  return apiResponse.success(res, 'Done. You won\'t get any more messages from us.', { optedOut: true });
});
