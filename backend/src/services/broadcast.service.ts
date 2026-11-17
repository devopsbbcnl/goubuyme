import { BroadcastAudience, BroadcastEmailType, Prisma, Role } from '@prisma/client';
import prisma from '../config/db';
import { recordError } from '../utils/recordError';
import { sendPushToMany } from './notification.service';
import { sendWebPush } from './webPush.service';
import { emailLayout, sendEmailBatch, BatchEmail } from './email.service';
import { unsubscribeToken } from './crm/unsubscribe.service';
import { getPrimaryClientUrl } from '../utils/clientUrl';

// A message from the platform to everyone, to every customer / vendor / rider / logistics
// company, or to one account. Staff write it; delivery is an in-app Notification row for each
// recipient plus a push to every device that can take one, and/or an email.
// A SERVICE message (an outage, a policy change) ignores marketing opt-in and frequency caps,
// unlike a CRM campaign. A PROMOTIONAL email skips users who opted out of marketing and carries
// an unsubscribe link. A broadcast is never edited or deleted once sent.

export class BroadcastError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface BroadcastInput {
  title: string;
  body: string;
  audience: BroadcastAudience;
  /** Required when audience is USER: the one account to message. */
  targetUserId?: string | null;
  /** In-app notification + push. Defaults to true. */
  sendInApp?: boolean;
  sendEmail?: boolean;
  /** Required when sendEmail is true. */
  emailType?: BroadcastEmailType | null;
  /** Longer email text; falls back to `body`. */
  emailBody?: string | null;
}

const AUDIENCE_ROLES: Record<BroadcastAudience, Role[]> = {
  ALL: [Role.CUSTOMER, Role.VENDOR, Role.RIDER, Role.LOGISTICS_COMPANY],
  CUSTOMERS: [Role.CUSTOMER],
  VENDORS: [Role.VENDOR],
  RIDERS: [Role.RIDER],
  LOGISTICS_COMPANIES: [Role.LOGISTICS_COMPANY],
  USER: [Role.CUSTOMER, Role.VENDOR, Role.RIDER, Role.LOGISTICS_COMPANY],
};

// Active, undeleted accounts only: a suspended or deleted one has no session to read it in.
export const audienceWhere = (audience: BroadcastAudience, targetUserId?: string | null): Prisma.UserWhereInput => ({
  role: { in: AUDIENCE_ROLES[audience] },
  isActive: true,
  deletedAt: null,
  // A single-user message matches that account only; an empty id matches nobody.
  ...(audience === 'USER' ? { id: targetUserId || '' } : {}),
});

interface Reach {
  recipients: number;
  pushReachable: number;
  /** Every active account has an email, so this equals recipients; kept explicit for the form. */
  emailService: number;
  /** Of those, the ones who have not opted out of marketing. */
  emailPromotional: number;
}

// Who would be addressed, and how many of them can actually be buzzed, so the
// form can say so before anything is sent.
export const preview = async (audience: BroadcastAudience, targetUserId?: string | null): Promise<Reach> => {
  const where = audienceWhere(audience, targetUserId);
  const [recipients, pushReachable, emailPromotional] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...where, OR: [{ pushToken: { not: null } }, { pushSubscriptions: { some: {} } }] } }),
    prisma.user.count({ where: { ...where, marketingOptIn: true } }),
  ]);
  return { recipients, pushReachable, emailService: recipients, emailPromotional };
};

const CHUNK = 500;
const WEB_PUSH_CONCURRENCY = 20;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const broadcastEmailHtml = (
  title: string, text: string, name: string, type: BroadcastEmailType, userId: string,
): string => {
  const first = name.trim().split(/\s+/)[0] || 'there';
  const unsubscribe = type === 'PROMOTIONAL'
    ? `<p style="margin:28px 0 0;font-size:12px;color:#999;">You're receiving this because you have a GoBuyMe account.
        <a href="${getPrimaryClientUrl() || 'https://gobuyme.shop'}/unsubscribe?t=${unsubscribeToken(userId)}" style="color:#999;">Unsubscribe from promotions</a></p>`
    : '';
  return emailLayout(`
    <h2 style="margin:0 0 12px;font-size:22px;color:#1A1410;">${escapeHtml(title)}</h2>
    <p style="margin:0 0 12px;font-size:15px;color:#444;">Hi ${escapeHtml(first)},</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#444;white-space:pre-wrap;">${escapeHtml(text)}</p>${unsubscribe}`);
};

const EMAIL_BATCH = 100;
// Resend allows about 2 requests a second on most plans; stay well under it.
const EMAIL_BATCH_GAP_MS = 600;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const deliverEmail = async (input: BroadcastInput, type: BroadcastEmailType): Promise<void> => {
  const text = input.emailBody?.trim() || input.body;
  const where = { ...audienceWhere(input.audience, input.targetUserId), ...(type === 'PROMOTIONAL' ? { marketingOptIn: true } : {}) };
  let cursor: string | undefined;
  let failed = 0;
  for (;;) {
    const users = await prisma.user.findMany({
      where, select: { id: true, name: true, email: true }, orderBy: { id: 'asc' }, take: EMAIL_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;
    const messages: BatchEmail[] = users.map(u => ({
      to: u.email, subject: input.title, html: broadcastEmailHtml(input.title, text, u.name, type, u.id),
    }));
    failed += (await sendEmailBatch(messages)).failed;
    if (users.length < EMAIL_BATCH) break;
    await sleep(EMAIL_BATCH_GAP_MS);
  }
  if (failed > 0) {
    recordError('email', 'Broadcast email partly failed', new Error(`${failed} emails not sent`), { title: input.title, failed });
  }
};

// Runs after the broadcast is on the record, so a slow push provider never holds up the admin.
const deliver = async (broadcastId: string, input: BroadcastInput): Promise<void> => {
  if (input.sendEmail && input.emailType) {
    await deliverEmail(input, input.emailType).catch(err =>
      recordError('email', 'Broadcast email delivery failed', err, { broadcastId }),
    );
  }
  if (input.sendInApp === false) return;
  const users = await prisma.user.findMany({
    where: audienceWhere(input.audience, input.targetUserId),
    select: { id: true, pushToken: true, pushSubscriptions: { select: { id: true }, take: 1 } },
  });
  const payload = { title: input.title, body: input.body, type: 'broadcast', data: { broadcastId } };

  for (let i = 0; i < users.length; i += CHUNK) {
    const chunk = users.slice(i, i + CHUNK);
    await prisma.notification.createMany({
      data: chunk.map(u => ({
        userId: u.id, title: input.title, body: input.body, type: 'broadcast', meta: { broadcastId } as Prisma.InputJsonValue,
      })),
    });
    // One phone can hold several accounts' tokens; send each device once.
    const tokens = [...new Set(chunk.map(u => u.pushToken).filter((t): t is string => !!t))];
    await sendPushToMany(tokens, payload);
  }

  const webUsers = users.filter(u => u.pushSubscriptions.length > 0);
  for (let i = 0; i < webUsers.length; i += WEB_PUSH_CONCURRENCY) {
    await Promise.all(
      webUsers.slice(i, i + WEB_PUSH_CONCURRENCY).map(u => sendWebPush(u.id, payload).catch(() => {})),
    );
  }
};

// The same words to the same audience twice in a row is a double-click, not intent.
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export const send = async (actorId: string, input: BroadcastInput) => {
  if (input.audience === 'USER' && !input.targetUserId) throw new BroadcastError('Choose a user to message.');
  const sendInApp = input.sendInApp !== false;
  const sendEmail = input.sendEmail === true;
  if (!sendInApp && !sendEmail) throw new BroadcastError('Choose at least one way to send: in-app and push, or email.');
  if (sendEmail && !input.emailType) throw new BroadcastError('Say whether the email is a service notice or a promotion.');

  const duplicate = await prisma.broadcast.findFirst({
    where: {
      audience: input.audience, targetUserId: input.targetUserId ?? null, title: input.title, body: input.body,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (duplicate) throw new BroadcastError('This exact message was just sent to that audience.', 409);

  const reach = await preview(input.audience, input.targetUserId);
  const emailCount = !sendEmail ? 0 : input.emailType === 'PROMOTIONAL' ? reach.emailPromotional : reach.emailService;
  if (reach.recipients === 0) {
    throw new BroadcastError(input.audience === 'USER'
      ? 'That user cannot be messaged (not found, suspended or deleted).'
      : 'That audience has nobody in it.');
  }

  if (!sendInApp && emailCount === 0) {
    throw new BroadcastError('Nobody in that audience can receive this email (everyone has opted out of promotions).');
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      authorId: actorId,
      audience: input.audience,
      targetUserId: input.audience === 'USER' ? input.targetUserId : null,
      title: input.title,
      body: input.body,
      recipientCount: reach.recipients,
      pushCount: sendInApp ? reach.pushReachable : 0,
      sendInApp,
      sendEmail,
      emailType: sendEmail ? input.emailType : null,
      emailBody: sendEmail ? input.emailBody?.trim() || null : null,
      emailCount,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: 'BROADCAST_SENT',
      entity: 'Broadcast',
      entityId: broadcast.id,
      meta: { title: input.title, audience: input.audience, targetUserId: input.targetUserId ?? null, recipients: reach.recipients, pushReachable: reach.pushReachable, sendInApp, sendEmail, emailType: sendEmail ? input.emailType : null, emailCount },
    },
  }).catch(() => {});

  void deliver(broadcast.id, input).catch(err =>
    recordError('notification', 'Broadcast delivery failed', err, { broadcastId: broadcast.id }),
  );

  return broadcast;
};

export const list = async (opts: { page: number; limit: number }) => {
  const [rows, total] = await prisma.$transaction([
    prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      include: { author: { select: { name: true } }, targetUser: { select: { name: true, email: true } } },
    }),
    prisma.broadcast.count(),
  ]);
  return {
    rows: rows.map(({ author, targetUser, ...b }) => ({
      ...b, authorName: author.name, targetUserName: targetUser?.name ?? null, targetUserEmail: targetUser?.email ?? null,
    })),
    pagination: { page: opts.page, limit: opts.limit, total, totalPages: Math.ceil(total / opts.limit) },
  };
};

// Find one account to message: by name, email or phone, among accounts a broadcast can reach.
export const searchRecipients = async (q: string) => {
  const term = q.trim();
  return prisma.user.findMany({
    where: {
      ...audienceWhere('ALL'),
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
      ],
    },
    select: { id: true, name: true, email: true, phone: true, role: true },
    orderBy: { name: 'asc' },
    take: 8,
  });
};
