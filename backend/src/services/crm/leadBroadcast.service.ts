// Staff-confirmed bulk SMS/email to pipeline leads. Same claim-and-batch pattern as the customer
// campaign engine (campaign.service.ts) so it is safe under PM2 cluster mode, plus the safeguards
// leads need because they never opted in: opt-out link in every message, a suppression list that
// outlives the lead, a per-lead frequency cap, daily caps per channel, and a send-time re-check.
// Social profiles are never broadcast to (no platform allows cold DMs); staff open them by hand.
import crypto from 'crypto';
import { CampaignChannel, LeadSource, LeadStage, LeadType, Prisma, VendorCategory } from '@prisma/client';
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { recordError } from '../../utils/recordError';
import { getPrimaryClientUrl } from '../../utils/clientUrl';
import { emailLayout, sendEmailChecked } from '../email.service';
import { sendSms } from '../sms.service';
import { OPEN_STAGES, LEAD_SOURCES, LEAD_STAGES, stageChangeData } from './lead.service';
import {
  LEAD_LIMITS, OUTREACH_CHANNELS, OutreachChannel, SendableLead, SkipContext, STOP_CODE_LENGTH, composeLeadSms,
  personalizeLead, skipReason, smsSegments, smsTemplateProblem, stopLink, suppressionKey, tallyReasons,
} from './outreach';

export class BroadcastError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const BATCH_SIZE = 50;
const STUCK_SENDING_MS = 10 * 60 * 1000;
const MAX_AUDIENCE = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ID_CHUNK = 1000;

const envNumber = (name: string, fallback: number, min = 0) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min && process.env[name] !== undefined && process.env[name] !== '' ? n : fallback;
};

/** Hours a lead must go between broadcast messages (any channel, any broadcast). */
export const leadFrequencyCapHours = () => envNumber('LEAD_BROADCAST_FREQUENCY_CAP_HOURS', 72);
/** Messages per channel per rolling 24 hours, across all lead broadcasts. */
export const dailyCap = (channel: OutreachChannel) =>
  channel === 'SMS' ? envNumber('LEAD_SMS_DAILY_CAP', 300) : envNumber('LEAD_EMAIL_DAILY_CAP', 500);
/** Naira per SMS page, from the Termii price list. Unset = no cost shown (never guessed). */
export const smsCostPerPageNgn = (): number | null => {
  const raw = process.env.SMS_COST_PER_PAGE_NGN;
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : null;
};

const clientUrl = () => getPrimaryClientUrl() || 'https://gobuyme.shop';

// ─── Audience ────────────────────────────────────────────────────────────────

export interface AudienceFilters {
  type: LeadType;
  stages: LeadStage[];
  sources?: LeadSource[];
  categories?: VendorCategory[];
  city?: string;
  ownerId?: string;
  minFitScore?: number;
  /** Specific leads chosen on the pipeline page; the other filters still apply. */
  leadIds?: string[];
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const parseFilters = (raw: unknown): AudienceFilters => {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type: LeadType = f.type === 'RIDER' ? 'RIDER' : 'VENDOR';
  const stages = asArray(f.stages).filter((s): s is LeadStage => LEAD_STAGES.includes(s as LeadStage));
  const sources = asArray(f.sources).filter((s): s is LeadSource => LEAD_SOURCES.includes(s as LeadSource));
  const categories = asArray(f.categories).filter((c): c is VendorCategory => (Object.values(VendorCategory) as string[]).includes(String(c)));
  const leadIds = asArray(f.leadIds).map(String).filter(Boolean).slice(0, MAX_AUDIENCE);
  const city = typeof f.city === 'string' && f.city.trim() ? f.city.trim().slice(0, 80) : undefined;
  const ownerId = typeof f.ownerId === 'string' && f.ownerId ? f.ownerId : undefined;
  const minFit = Number(f.minFitScore);
  return {
    type,
    // Closed leads (live, lost) are not prospects any more; the default is the people we have not won yet.
    stages: (stages.length ? stages : (['NEW', 'CONTACTED'] as LeadStage[])).filter((s) => OPEN_STAGES.includes(s)),
    ...(sources.length ? { sources } : {}),
    ...(categories.length ? { categories } : {}),
    ...(city ? { city } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(Number.isFinite(minFit) && minFit > 0 ? { minFitScore: Math.min(100, minFit) } : {}),
    ...(leadIds.length ? { leadIds } : {}),
  };
};

export const leadWhere = (f: AudienceFilters): Prisma.LeadWhereInput => ({
  type: f.type,
  stage: { in: f.stages },
  convertedUserId: null,
  ...(f.sources ? { source: { in: f.sources } } : {}),
  ...(f.categories ? { category: { in: f.categories } } : {}),
  ...(f.city ? { city: { contains: f.city, mode: 'insensitive' as const } } : {}),
  ...(f.ownerId ? { ownerId: f.ownerId } : {}),
  ...(f.minFitScore ? { prospect: { is: { fitScore: { gte: f.minFitScore } } } } : {}),
  ...(f.leadIds ? { id: { in: f.leadIds } } : {}),
});

const audienceSelect = {
  id: true, name: true, contactName: true, phone: true, phoneKey: true, email: true, marketingOptOut: true, convertedUserId: true,
} satisfies Prisma.LeadSelect;

type AudienceLead = Prisma.LeadGetPayload<{ select: typeof audienceSelect }>;

const chunks = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** Suppressed contacts and recently messaged leads among `leads`. */
const loadSkipContext = async (leads: AudienceLead[], now: Date, excludeBroadcastId?: string): Promise<SkipContext> => {
  const suppressed = new Set<string>();
  const recentlyMessaged = new Set<string>();
  const phones = leads.map((l) => l.phoneKey).filter((k): k is string => Boolean(k));
  const emails = leads.map((l) => l.email?.toLowerCase()).filter((e): e is string => Boolean(e));
  for (const part of chunks(phones, ID_CHUNK)) {
    const rows = await prisma.outreachSuppression.findMany({ where: { channel: 'SMS', key: { in: part } }, select: { channel: true, key: true } });
    rows.forEach((r) => suppressed.add(suppressionKey('SMS', r.key)));
  }
  for (const part of chunks(emails, ID_CHUNK)) {
    const rows = await prisma.outreachSuppression.findMany({ where: { channel: 'EMAIL', key: { in: part } }, select: { channel: true, key: true } });
    rows.forEach((r) => suppressed.add(suppressionKey('EMAIL', r.key)));
  }
  const since = new Date(now.getTime() - leadFrequencyCapHours() * 3_600_000);
  for (const part of chunks(leads.map((l) => l.id), ID_CHUNK)) {
    const rows = await prisma.leadBroadcastRecipient.findMany({
      where: { leadId: { in: part }, status: 'SENT', sentAt: { gte: since }, ...(excludeBroadcastId ? { broadcastId: { not: excludeBroadcastId } } : {}) },
      select: { leadId: true },
    });
    rows.forEach((r) => recentlyMessaged.add(r.leadId));
  }
  return { suppressed, recentlyMessaged };
};

/** Messages already counted against today's cap (queued or sent in the last 24 hours). */
const usedToday = async (channel: OutreachChannel, now: Date) =>
  prisma.leadBroadcastRecipient.count({
    where: { channel, status: { in: ['PENDING', 'SENDING', 'SENT'] }, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
  });

export interface ChannelPreview {
  willSend: number;
  skipped: Record<string, number>;
  /** SMS only: pages across all recipients, and the Naira estimate when a price is configured. */
  pages?: number;
  estimatedCostNgn?: number | null;
  dailyCap: number;
  dailyRemaining: number;
}

export interface BroadcastPreview {
  matched: number;
  capped: boolean;
  channels: Partial<Record<OutreachChannel, ChannelPreview>>;
  sample: Array<{ id: string; name: string; sms?: string }>;
}

export interface BroadcastContent {
  channels: OutreachChannel[];
  body: string;
  emailSubject: string | null;
  ctaUrl: string | null;
}

/** Validates what staff typed. Throws BroadcastError with a message staff can act on. */
export const validateContent = (raw: Record<string, unknown>): BroadcastContent => {
  const channels = [...new Set(asArray(raw.channels))].filter((c): c is OutreachChannel => OUTREACH_CHANNELS.includes(c as OutreachChannel));
  if (!channels.length) throw new BroadcastError('Choose SMS, email or both.');
  const body = String(raw.body ?? '').trim();
  if (!body) throw new BroadcastError('Write the message.');
  if (channels.includes('SMS')) {
    const problem = smsTemplateProblem(body, clientUrl());
    if (problem) throw new BroadcastError(problem);
  }
  if (channels.includes('EMAIL') && body.length > LEAD_LIMITS.emailBody) throw new BroadcastError(`The email must be ${LEAD_LIMITS.emailBody} characters or fewer.`);
  const emailSubject = raw.emailSubject ? String(raw.emailSubject).trim().slice(0, LEAD_LIMITS.emailSubject) : null;
  if (channels.includes('EMAIL') && !emailSubject) throw new BroadcastError('Add an email subject.');
  const ctaUrl = raw.ctaUrl ? String(raw.ctaUrl).trim() : null;
  if (ctaUrl && !/^https:\/\/[^\s]+$/i.test(ctaUrl)) throw new BroadcastError('The email button link must start with https://');
  return { channels, body, emailSubject, ctaUrl };
};

const PLACEHOLDER_CODE = 'X'.repeat(STOP_CODE_LENGTH);

/** Who a broadcast would reach, what would be skipped and why, and what it would cost. Sends nothing. */
export const previewBroadcast = async (filters: AudienceFilters, content: BroadcastContent, now = new Date()): Promise<{ preview: BroadcastPreview; leads: AudienceLead[]; context: SkipContext }> => {
  const leads = await prisma.lead.findMany({ where: leadWhere(filters), select: audienceSelect, orderBy: { createdAt: 'desc' }, take: MAX_AUDIENCE + 1 });
  const capped = leads.length > MAX_AUDIENCE;
  const audience = leads.slice(0, MAX_AUDIENCE);
  const context = await loadSkipContext(audience, now);
  const price = smsCostPerPageNgn();

  const channels: BroadcastPreview['channels'] = {};
  for (const channel of content.channels) {
    const reasons = audience.map((l) => skipReason(l as SendableLead, channel, context));
    const willSend = reasons.filter((r) => r === null).length;
    const cap = dailyCap(channel);
    const entry: ChannelPreview = {
      willSend, skipped: tallyReasons(reasons), dailyCap: cap, dailyRemaining: Math.max(0, cap - (await usedToday(channel, now))),
    };
    if (channel === 'SMS') {
      const link = stopLink(clientUrl(), PLACEHOLDER_CODE);
      entry.pages = audience.reduce((sum, l, i) => (reasons[i] === null ? sum + smsSegments(composeLeadSms(content.body, l, link)).pages : sum), 0);
      entry.estimatedCostNgn = price === null ? null : Math.round(entry.pages * price * 100) / 100;
    }
    channels[channel] = entry;
  }

  const firstSendable = audience.filter((l) => content.channels.some((c) => skipReason(l as SendableLead, c, context) === null)).slice(0, 3);
  return {
    leads: audience,
    context,
    preview: {
      matched: audience.length,
      capped,
      channels,
      sample: firstSendable.map((l) => ({
        id: l.id, name: l.name,
        ...(content.channels.includes('SMS') ? { sms: composeLeadSms(content.body, l, stopLink(clientUrl(), PLACEHOLDER_CODE)) } : {}),
      })),
    },
  };
};

// ─── Starting a broadcast ────────────────────────────────────────────────────

export const startBroadcast = async (input: { name: string; filters: AudienceFilters; content: BroadcastContent }, staffId: string, now = new Date()) => {
  const name = input.name.trim().slice(0, LEAD_LIMITS.name);
  if (!name) throw new BroadcastError('Give the broadcast a name.');

  const { preview, leads, context } = await previewBroadcast(input.filters, input.content, now);
  if (preview.capped) throw new BroadcastError(`That is more than ${MAX_AUDIENCE} leads. Narrow the filters and send in parts.`);
  const total = Object.values(preview.channels).reduce((a, c) => a + (c?.willSend ?? 0), 0);
  if (total === 0) throw new BroadcastError('None of the matching leads can be messaged. Check the skipped reasons in the preview.');
  for (const channel of input.content.channels) {
    const c = preview.channels[channel]!;
    if (c.willSend > c.dailyRemaining) {
      throw new BroadcastError(`The daily ${channel === 'SMS' ? 'SMS' : 'email'} limit allows ${c.dailyRemaining} more messages in the next 24 hours, but this would send ${c.willSend}. Narrow the audience or wait.`, 429);
    }
  }

  const rows: Prisma.LeadBroadcastRecipientCreateManyInput[] = [];
  const broadcast = await prisma.$transaction(async (tx) => {
    const b = await tx.leadBroadcast.create({
      data: {
        name, channels: input.content.channels as CampaignChannel[], body: input.content.body,
        emailSubject: input.content.emailSubject, ctaUrl: input.content.ctaUrl,
        filters: input.filters as unknown as Prisma.InputJsonValue, status: 'SENDING', audienceSize: leads.length,
        createdById: staffId, startedAt: now,
      },
    });
    for (const lead of leads) {
      for (const channel of input.content.channels) {
        const reason = skipReason(lead as SendableLead, channel, context);
        rows.push({ broadcastId: b.id, leadId: lead.id, channel, status: reason ? 'SKIPPED' : 'PENDING', error: reason });
      }
    }
    for (const part of chunks(rows, 5000)) await tx.leadBroadcastRecipient.createMany({ data: part, skipDuplicates: true });
    await tx.auditLog.create({
      data: { userId: staffId, action: 'CRM_LEAD_BROADCAST_STARTED', entity: 'LeadBroadcast', entityId: b.id, meta: { name, channels: input.content.channels, queued: total } },
    });
    return b;
  }, { timeout: 30_000 });
  return { broadcast, queued: total };
};

export const cancelBroadcast = async (id: string, staffId: string) => {
  const b = await prisma.leadBroadcast.findUnique({ where: { id } });
  if (!b) throw new BroadcastError('Broadcast not found.', 404);
  if (b.status !== 'SENDING') throw new BroadcastError('Only a broadcast that is still sending can be stopped.');
  await prisma.$transaction([
    prisma.leadBroadcast.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } }),
    prisma.leadBroadcastRecipient.updateMany({ where: { broadcastId: id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Cancelled' } }),
    prisma.auditLog.create({ data: { userId: staffId, action: 'CRM_LEAD_BROADCAST_CANCELLED', entity: 'LeadBroadcast', entityId: id, meta: { name: b.name } } }),
  ]);
};

// ─── Delivery ────────────────────────────────────────────────────────────────

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(STOP_CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

/** The lead's opt-out code, created on first use. */
const ensureOptOutCode = async (leadId: string): Promise<string> => {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { optOutCode: true } });
  if (lead.optOutCode) return lead.optOutCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const claimed = await prisma.lead.updateMany({ where: { id: leadId, optOutCode: null }, data: { optOutCode: newCode() } });
      const fresh = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { optOutCode: true } });
      if (fresh.optOutCode) return fresh.optOutCode;
      if (claimed.count === 0) continue;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err; // code collision: try another
    }
  }
  throw new Error('Could not create an opt-out link');
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const leadEmailHtml = (body: string, ctaUrl: string | null, lead: { name: string; contactName: string | null }, link: string) => emailLayout(`
    <p style="margin:0;font-size:15px;line-height:1.6;color:#444;white-space:pre-wrap;">${escapeHtml(personalizeLead(body, lead))}</p>
    ${ctaUrl ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#FF521B;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:4px;margin-top:24px;">Learn more</a>` : ''}
    <p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#999;">We're GoBuyMe, a food and goods delivery platform in Nigeria. We wrote to you because ${escapeHtml(lead.name)} is publicly listed as a business that could sell on GoBuyMe.
      Don't want to hear from us? <a href="https://${escapeHtml(link)}" style="color:#999;">Stop these messages</a>.</p>`);

/** Sends one message. Throws on a failure the caller should record against the recipient. */
const deliver = async (
  channel: CampaignChannel,
  b: { body: string; emailSubject: string | null; ctaUrl: string | null },
  lead: { id: string; name: string; contactName: string | null; phone: string | null; email: string | null },
) => {
  const link = stopLink(clientUrl(), await ensureOptOutCode(lead.id));
  if (channel === 'SMS') {
    if (!lead.phone) throw new BroadcastError('No phone number');
    // Promotional traffic goes on Termii's generic route; the DND route is for transactional messages only.
    if (!(await sendSms(lead.phone, composeLeadSms(b.body, lead, link), { channel: 'generic' }))) throw new BroadcastError('Termii did not accept the message');
  } else if (channel === 'EMAIL') {
    if (!lead.email) throw new BroadcastError('No email');
    const subject = personalizeLead(b.emailSubject || 'GoBuyMe', lead);
    if (!(await sendEmailChecked(lead.email, subject, leadEmailHtml(b.body, b.ctaUrl, lead, link)))) throw new BroadcastError('Email provider did not accept the message');
  } else {
    throw new BroadcastError('Unsupported channel');
  }
};

/** Delivers up to `limit` pending recipients. Each row is claimed first; eligibility is re-checked at send time. */
export const deliverBatch = async (broadcastId: string, limit = BATCH_SIZE, now = new Date()) => {
  const b = await prisma.leadBroadcast.findUniqueOrThrow({ where: { id: broadcastId } });
  if (b.status !== 'SENDING') return 0;

  const pending = await prisma.leadBroadcastRecipient.findMany({
    where: { broadcastId, status: 'PENDING' }, take: limit,
    select: { id: true, channel: true, lead: { select: { ...audienceSelect, stage: true } } },
  });
  if (pending.length === 0) return 0;
  const context = await loadSkipContext(pending.map((p) => p.lead), now, broadcastId);

  let processed = 0;
  for (const r of pending) {
    const claim = await prisma.leadBroadcastRecipient.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: 'SENDING' } });
    if (claim.count === 0) continue;
    processed++;

    const reason = skipReason(r.lead as SendableLead, r.channel as OutreachChannel, context);
    if (reason) {
      await prisma.leadBroadcastRecipient.update({ where: { id: r.id }, data: { status: 'SKIPPED', error: reason } });
      continue;
    }
    try {
      await deliver(r.channel, b, r.lead);
      await prisma.leadBroadcastRecipient.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: new Date() } });
      await prisma.leadActivity.create({
        data: {
          leadId: r.lead.id, authorId: b.createdById, type: r.channel === 'SMS' ? 'SMS' : 'EMAIL',
          body: `Broadcast "${b.name}" sent by ${r.channel === 'SMS' ? 'SMS' : 'email'}.`, meta: { broadcastId },
        },
      });
      // Same rule as logging an outreach by hand: a brand-new lead that has been messaged is contacted.
      await prisma.lead.updateMany({ where: { id: r.lead.id, stage: 'NEW' }, data: stageChangeData('CONTACTED') });
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 200) : 'Send failed';
      await prisma.leadBroadcastRecipient.update({ where: { id: r.id }, data: { status: 'FAILED', error: message } });
    }
  }
  return processed;
};

let sweeping = false;

/** One tick of the job: deliver pending batches within a time budget and close finished broadcasts. */
export const runLeadBroadcastSweep = async (now = new Date(), budgetMs = 45_000) => {
  if (sweeping) return;
  sweeping = true;
  const started = Date.now();
  try {
    // Interrupted sends are failed rather than retried, so nobody gets a message twice.
    await prisma.leadBroadcastRecipient.updateMany({
      where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - STUCK_SENDING_MS) }, broadcast: { status: 'SENDING' } },
      data: { status: 'FAILED', error: 'Interrupted during send' },
    });
    const sending = await prisma.leadBroadcast.findMany({ where: { status: 'SENDING' }, select: { id: true }, orderBy: { startedAt: 'asc' } });
    for (const c of sending) {
      while (Date.now() - started < budgetMs) {
        if ((await deliverBatch(c.id)) === 0) break;
      }
      const remaining = await prisma.leadBroadcastRecipient.count({ where: { broadcastId: c.id, status: { in: ['PENDING', 'SENDING'] } } });
      if (remaining === 0) {
        await prisma.leadBroadcast.updateMany({ where: { id: c.id, status: 'SENDING' }, data: { status: 'SENT', completedAt: new Date() } });
        logger.info(`Lead broadcast ${c.id} finished`);
      }
      if (Date.now() - started >= budgetMs) break;
    }
  } catch (err) {
    recordError('lead-broadcast-job', 'Lead broadcast sweep failed', err);
  } finally {
    sweeping = false;
  }
};

// ─── Stats ───────────────────────────────────────────────────────────────────

export const broadcastStats = async (broadcastId: string) => {
  const rows = await prisma.leadBroadcastRecipient.groupBy({ by: ['channel', 'status'], where: { broadcastId }, _count: { _all: true } });
  const channels: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    channels[row.channel] ??= { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
    channels[row.channel][row.status] = row._count._all;
  }
  const problems = await prisma.leadBroadcastRecipient.groupBy({
    by: ['status', 'error'], where: { broadcastId, status: { in: ['FAILED', 'SKIPPED'] } }, _count: { _all: true },
  });
  return {
    channels,
    reasons: problems.map((p) => ({ status: p.status, reason: p.error ?? 'Unknown', count: p._count._all })).sort((a, b) => b.count - a.count),
  };
};

// ─── Opting out ──────────────────────────────────────────────────────────────

const writeSuppressions = async (lead: { phoneKey: string | null; email: string | null }, reason: string) => {
  if (lead.phoneKey) {
    await prisma.outreachSuppression.upsert({ where: { channel_key: { channel: 'SMS', key: lead.phoneKey } }, update: {}, create: { channel: 'SMS', key: lead.phoneKey, reason } });
  }
  if (lead.email) {
    const key = lead.email.toLowerCase();
    await prisma.outreachSuppression.upsert({ where: { channel_key: { channel: 'EMAIL', key } }, update: {}, create: { channel: 'EMAIL', key, reason } });
  }
};

/** Stops all marketing to a lead: flags it, suppresses its phone and email for good, cancels anything queued. */
export const optOutLead = async (leadId: string, source: 'STAFF' | 'LINK', staffId?: string) => {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, phoneKey: true, email: true, marketingOptOut: true } });
  if (!lead) throw new BroadcastError('Lead not found.', 404);
  const reason = source === 'LINK' ? 'Used the opt-out link' : 'Asked staff to stop';
  await writeSuppressions(lead, reason);
  if (!lead.marketingOptOut) {
    await prisma.lead.update({ where: { id: leadId }, data: { marketingOptOut: true, optOutAt: new Date() } });
    await prisma.leadActivity.create({
      data: { leadId, authorId: staffId ?? null, type: 'NOTE', body: `Opted out of marketing messages (${reason.toLowerCase()}).` },
    });
  }
  await prisma.leadBroadcastRecipient.updateMany({ where: { leadId, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Opted out' } });
};

/** The person used the link to opt back in. Staff cannot do this for them. */
export const optInLead = async (leadId: string) => {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, phoneKey: true, email: true } });
  if (!lead) throw new BroadcastError('Lead not found.', 404);
  if (lead.phoneKey) await prisma.outreachSuppression.deleteMany({ where: { channel: 'SMS', key: lead.phoneKey } });
  if (lead.email) await prisma.outreachSuppression.deleteMany({ where: { channel: 'EMAIL', key: lead.email.toLowerCase() } });
  await prisma.lead.update({ where: { id: leadId }, data: { marketingOptOut: false, optOutAt: null } });
  await prisma.leadActivity.create({ data: { leadId, authorId: null, type: 'NOTE', body: 'Opted back in to marketing messages using the link.' } });
};

/** Resolves the code in an opt-out link to a lead id. Null for an unknown or malformed code. */
export const leadIdForCode = async (code: unknown): Promise<string | null> => {
  if (typeof code !== 'string' || code.length !== STOP_CODE_LENGTH || !/^[A-Za-z0-9]+$/.test(code)) return null;
  return (await prisma.lead.findUnique({ where: { optOutCode: code }, select: { id: true } }))?.id ?? null;
};
