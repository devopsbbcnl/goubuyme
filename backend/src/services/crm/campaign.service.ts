// Campaign delivery engine: materializes recipients for a campaign, delivers them in small
// claimed batches (safe under PM2 cluster mode), and reports delivery + conversion stats.
import { CampaignChannel, Prisma } from '@prisma/client';
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { recordError } from '../../utils/recordError';
import { getPrimaryClientUrl } from '../../utils/clientUrl';
import { notifyUser } from '../notification.service';
import { emailLayout, sendEmail } from '../email.service';
import { sendSms } from '../sms.service';
import { CrmRole } from './health.service';
import { SegmentRules, compileSegment } from './segment.service';
import { unsubscribeToken } from './unsubscribe.service';

export const CAMPAIGN_CHANNELS: CampaignChannel[] = ['PUSH', 'EMAIL', 'SMS'];
export const LIMITS = { name: 120, title: 80, body: 1000, smsBody: 320, emailSubject: 120 };
const BATCH_SIZE = 100;
const PAGE_SIZE = 1000;
/** Recipients stuck in SENDING this long were interrupted mid-send (worker restart). */
const STUCK_SENDING_MS = 10 * 60 * 1000;
const CONVERSION_WINDOW_HOURS = 72;

/** Hours a user must go between marketing messages (campaigns + automations combined). */
export const frequencyCapHours = () => {
  const n = Number(process.env.MARKETING_FREQUENCY_CAP_HOURS);
  return Number.isFinite(n) && n >= 0 ? n : 24;
};

export class CampaignError extends Error {}

// ─── Content ─────────────────────────────────────────────────────────────────

export interface CampaignContent {
  channels: CampaignChannel[];
  title: string;
  body: string;
  emailSubject?: string | null;
  ctaUrl?: string | null;
}

/** Validates message content shared by campaigns and automations. Throws CampaignError. */
export const validateContent = (raw: Record<string, unknown>): CampaignContent => {
  const channels = Array.isArray(raw.channels) ? [...new Set(raw.channels)] : [];
  if (channels.length === 0 || channels.some(c => !CAMPAIGN_CHANNELS.includes(c as CampaignChannel))) {
    throw new CampaignError('Choose at least one channel: push, email or SMS.');
  }
  const title = String(raw.title ?? '').trim();
  const body = String(raw.body ?? '').trim();
  if (!title || title.length > LIMITS.title) throw new CampaignError(`Title must be 1–${LIMITS.title} characters.`);
  if (!body || body.length > LIMITS.body) throw new CampaignError(`Message must be 1–${LIMITS.body} characters.`);
  if (channels.includes('SMS') && body.length > LIMITS.smsBody) {
    throw new CampaignError(`SMS messages must be ${LIMITS.smsBody} characters or fewer (about 2 SMS pages).`);
  }
  const emailSubject = raw.emailSubject ? String(raw.emailSubject).trim().slice(0, LIMITS.emailSubject) : null;
  const ctaUrl = raw.ctaUrl ? String(raw.ctaUrl).trim() : null;
  if (ctaUrl && !/^https:\/\/[^\s]+$/i.test(ctaUrl)) throw new CampaignError('Button link must start with https://');
  return { channels: channels as CampaignChannel[], title, body, emailSubject, ctaUrl };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Replaces {{name}} with the recipient's first name. */
export const personalize = (text: string, name: string) =>
  text.replace(/\{\{\s*name\s*\}\}/gi, (name.trim().split(/\s+/)[0] || 'there'));

const marketingEmailHtml = (c: CampaignContent, name: string, userId: string) => {
  const unsubscribe = `${getPrimaryClientUrl() || 'https://gobuyme.shop'}/unsubscribe?t=${unsubscribeToken(userId)}`;
  return emailLayout(`
    <h2 style="margin:0 0 12px;font-size:22px;color:#1A1410;">${escapeHtml(personalize(c.title, name))}</h2>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#444;white-space:pre-wrap;">${escapeHtml(personalize(c.body, name))}</p>
    ${c.ctaUrl ? `<a href="${escapeHtml(c.ctaUrl)}" style="display:inline-block;background:#FF521B;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:4px;margin-top:24px;">Open GoBuyMe</a>` : ''}
    <p style="margin:28px 0 0;font-size:12px;color:#999;">You're receiving this because you have a GoBuyMe account.
      <a href="${unsubscribe}" style="color:#999;">Unsubscribe from promotions</a></p>`);
};

// ─── Delivery ────────────────────────────────────────────────────────────────

interface DeliveryTarget { id: string; name: string; email: string; phone: string | null }

/** Sends one message on one channel. Throws on a failure the caller should record. */
export const deliver = async (channel: CampaignChannel, c: CampaignContent, user: DeliveryTarget, campaignId?: string) => {
  const title = personalize(c.title, user.name);
  const body = personalize(c.body, user.name);
  switch (channel) {
    case 'PUSH':
      await notifyUser(user.id, { title, body, type: 'campaign', data: { campaignId, url: c.ctaUrl ?? undefined } });
      return;
    case 'EMAIL':
      await sendEmail(user.email, personalize(c.emailSubject || c.title, user.name), marketingEmailHtml(c, user.name, user.id));
      return;
    case 'SMS':
      if (!user.phone) throw new CampaignError('No phone number');
      await sendSms(user.phone, `GoBuyMe: ${body}`);
      return;
  }
};

/** Creates PENDING recipient rows for users × channels (idempotent). SMS without a phone is SKIPPED. */
export const createRecipients = async (
  campaignId: string,
  channels: CampaignChannel[],
  users: Array<{ id: string; phone: string | null }>,
) => {
  const rows: Prisma.CampaignRecipientCreateManyInput[] = [];
  for (const u of users) {
    for (const channel of channels) {
      const skip = channel === 'SMS' && !u.phone;
      rows.push({ campaignId, userId: u.id, channel, status: skip ? 'SKIPPED' : 'PENDING', error: skip ? 'No phone number' : null });
    }
  }
  for (let i = 0; i < rows.length; i += 5000) {
    await prisma.campaignRecipient.createMany({ data: rows.slice(i, i + 5000), skipDuplicates: true });
  }
};

/** Users excluded from marketing right now: opted out, or messaged within the frequency cap. */
export const marketableWhere = (now: Date, excludeCampaignId?: string): Prisma.UserWhereInput => {
  const capStart = new Date(now.getTime() - frequencyCapHours() * 60 * 60 * 1000);
  return {
    marketingOptIn: true,
    campaignRecipients: {
      none: {
        status: 'SENT',
        sentAt: { gte: capStart },
        ...(excludeCampaignId ? { campaignId: { not: excludeCampaignId } } : {}),
      },
    },
  };
};

/** Resolves a segment campaign's audience and writes its recipient rows. */
export const materializeCampaign = async (campaignId: string, now = new Date()) => {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { segment: true } });
  if (!campaign.segment) throw new CampaignError('Campaign has no segment.');

  const segmentWhere = await compileSegment(campaign.segment.role as CrmRole, campaign.segment.rules as unknown as SegmentRules, undefined, now);
  const where: Prisma.UserWhereInput = { AND: [segmentWhere, marketableWhere(now, campaign.id)] };

  let cursor: string | undefined;
  let total = 0;
  for (;;) {
    const page = await prisma.user.findMany({
      where, select: { id: true, phone: true }, orderBy: { id: 'asc' }, take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    await createRecipients(campaign.id, campaign.channels, page);
    total += page.length;
    cursor = page[page.length - 1].id;
  }

  await prisma.campaign.update({ where: { id: campaign.id }, data: { audienceSize: total } });
  return total;
};

/** Delivers up to `limit` pending recipients of one campaign. Each row is claimed before sending. */
export const deliverBatch = async (campaignId: string, limit = BATCH_SIZE) => {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.status !== 'SENDING') return 0;

  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: 'PENDING' },
    take: limit,
    select: { id: true, channel: true, user: { select: { id: true, name: true, email: true, phone: true, marketingOptIn: true } } },
  });

  let processed = 0;
  for (const r of pending) {
    const claim = await prisma.campaignRecipient.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: 'SENDING' } });
    if (claim.count === 0) continue;
    processed++;

    // Honour opt-outs that happened after the audience was built.
    if (!r.user.marketingOptIn) {
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'SKIPPED', error: 'Opted out' } });
      continue;
    }
    try {
      await deliver(r.channel, campaign, r.user, campaign.id);
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: new Date() } });
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 200) : 'Send failed';
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'FAILED', error: message } });
    }
  }
  return processed;
};

let sweeping = false;

/**
 * One tick of the campaign job: start due campaigns, deliver pending batches within a time
 * budget, and mark finished campaigns SENT. Guarded against overlapping ticks in-process;
 * row-level claims keep multiple workers from double-sending.
 */
export const runCampaignSweep = async (now = new Date(), budgetMs = 45_000) => {
  if (sweeping) return;
  sweeping = true;
  const started = Date.now();
  try {
    const due = await prisma.campaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, select: { id: true },
    });
    for (const c of due) {
      const claimed = await prisma.campaign.updateMany({
        where: { id: c.id, status: 'SCHEDULED' }, data: { status: 'SENDING', startedAt: now },
      });
      if (claimed.count === 1) logger.info(`Campaign ${c.id} started`);
    }

    // Interrupted sends are failed rather than retried, so nobody gets a message twice.
    await prisma.campaignRecipient.updateMany({
      where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - STUCK_SENDING_MS) }, campaign: { status: 'SENDING' } },
      data: { status: 'FAILED', error: 'Interrupted during send' },
    });

    const sending = await prisma.campaign.findMany({
      where: { status: 'SENDING' }, select: { id: true, audienceSize: true, segmentId: true }, orderBy: { startedAt: 'asc' },
    });
    for (const c of sending) {
      if (c.audienceSize === null && c.segmentId) await materializeCampaign(c.id, now);

      while (Date.now() - started < budgetMs) {
        if ((await deliverBatch(c.id)) === 0) break;
      }

      const remaining = await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: { in: ['PENDING', 'SENDING'] } } });
      const materialized = (await prisma.campaign.findUnique({ where: { id: c.id }, select: { audienceSize: true } }))?.audienceSize !== null;
      if (remaining === 0 && materialized) {
        await prisma.campaign.updateMany({ where: { id: c.id, status: 'SENDING' }, data: { status: 'SENT', completedAt: new Date() } });
        logger.info(`Campaign ${c.id} finished`);
      }
      if (Date.now() - started >= budgetMs) break;
    }
  } catch (err) {
    recordError('campaign-job', 'Campaign sweep failed', err);
  } finally {
    sweeping = false;
  }
};

// ─── Stats ───────────────────────────────────────────────────────────────────

export const campaignStats = async (campaignId: string) => {
  const byStatus = await prisma.campaignRecipient.groupBy({
    by: ['channel', 'status'], where: { campaignId }, _count: { _all: true },
  });
  const channels: Record<string, Record<string, number>> = {};
  for (const row of byStatus) {
    channels[row.channel] ??= { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
    channels[row.channel][row.status] = row._count._all;
  }

  // Customers who placed a non-cancelled order within the window after their first message.
  const [conv] = await prisma.$queryRaw<Array<{ buyers: number; orders: number; revenue: number }>>`
    SELECT COUNT(DISTINCT c."userId")::int AS buyers,
           COUNT(o.id)::int AS orders,
           COALESCE(SUM(o."totalAmount"), 0)::float AS revenue
    FROM orders o
    JOIN customers c ON c.id = o."customerId"
    JOIN (
      SELECT "userId", MIN("sentAt") AS first_sent
      FROM campaign_recipients
      WHERE "campaignId" = ${campaignId} AND status::text = 'SENT'
      GROUP BY "userId"
    ) r ON r."userId" = c."userId"
    WHERE o.status::text <> 'CANCELLED'
      AND o."createdAt" >= r.first_sent
      AND o."createdAt" < r.first_sent + make_interval(hours => ${CONVERSION_WINDOW_HOURS}::int)`;

  const reached = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: 'SENT' }, distinct: ['userId'], select: { userId: true },
  });

  return {
    channels,
    reachedUsers: reached.length,
    conversions: {
      windowHours: CONVERSION_WINDOW_HOURS,
      buyers: conv?.buyers ?? 0,
      orders: conv?.orders ?? 0,
      revenue: conv?.revenue ?? 0,
      rate: reached.length ? Math.round(((conv?.buyers ?? 0) / reached.length) * 1000) / 10 : 0,
    },
  };
};
