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

// Multi-role accounts: someone who signed up as a customer but also runs a business or rides is
// still a vendor / rider, so those audiences also reach anyone holding the profile.
const PROFILE_MATCH: Partial<Record<BroadcastAudience, Prisma.UserWhereInput>> = {
  VENDORS: { role: { in: [Role.CUSTOMER, Role.RIDER] }, vendors: { some: { parentVendorId: null } } },
  RIDERS: { role: { in: [Role.CUSTOMER, Role.VENDOR] }, rider: { isNot: null } },
};

// The experience a broadcast's in-app notification belongs to; null = every role.
export const audienceNotificationRole = (audience: BroadcastAudience): Role | null =>
  audience === 'CUSTOMERS' ? Role.CUSTOMER : audience === 'VENDORS' ? Role.VENDOR : audience === 'RIDERS' ? Role.RIDER : null;

// Active, undeleted accounts only: a suspended or deleted one has no session to read it in.
export const audienceWhere = (audience: BroadcastAudience, targetUserId?: string | null): Prisma.UserWhereInput => {
  const profile = PROFILE_MATCH[audience];
  return {
    ...(profile ? { OR: [{ role: { in: AUDIENCE_ROLES[audience] } }, profile] } : { role: { in: AUDIENCE_ROLES[audience] } }),
    isActive: true,
    deletedAt: null,
    // A single-user message matches that account only; an empty id matches nobody.
    ...(audience === 'USER' ? { id: targetUserId || '' } : {}),
  };
};

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
    // AND, not a spread: the audience itself may carry an OR (multi-role vendors / riders).
    prisma.user.count({ where: { AND: [where, { OR: [{ pushToken: { not: null } }, { pushSubscriptions: { some: {} } }] }] } }),
    prisma.user.count({ where: { ...where, marketingOptIn: true } }),
  ]);
  return { recipients, pushReachable, emailService: recipients, emailPromotional };
};

const CHUNK = 500;
const WEB_PUSH_CONCURRENCY = 20;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Merge fields staff can put in an email's title and message. Each is filled per recipient.
//   {{name}} first name, {{full_name}}, {{business_name}} (store or company name, else the person's name),
//   {{dashboard_link}} where that person manages their account.
export const MERGE_FIELDS = ['name', 'full_name', 'business_name', 'dashboard_link'] as const;
const MERGE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi;
export const hasMergeFields = (text: string) => /\{\{\s*[a-z_]+\s*\}\}/i.test(text);

export interface MergeRecipient {
  name: string;
  role: Role;
  businessName?: string | null;
  companyName?: string | null;
}

const dashboardLink = (role: Role): string => {
  const base = getPrimaryClientUrl() || 'https://gobuyme.shop';
  if (role === 'VENDOR') return `${base}/vendor/menu`;
  if (role === 'LOGISTICS_COMPANY') return `${base}/company`;
  return `${base}/login`;
};

/** Fills the merge fields for one recipient. Unknown fields are left as typed so a typo is visible. */
export const fillMergeFields = (text: string, r: MergeRecipient): string =>
  text.replace(MERGE_PATTERN, (whole, key: string) => {
    switch (key.toLowerCase()) {
      case 'name': return r.name.trim().split(/\s+/)[0] || 'there';
      case 'full_name': return r.name.trim() || 'there';
      case 'business_name': return r.businessName?.trim() || r.companyName?.trim() || r.name.trim() || 'there';
      case 'dashboard_link': return dashboardLink(r.role);
      default: return whole;
    }
  });

// Escape first, then make bare https:// links clickable (the text is plain, written by staff).
const toHtml = (text: string) =>
  escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#FF521B;">$1</a>');

export const broadcastEmailHtml = (
  title: string, text: string, recipient: MergeRecipient, type: BroadcastEmailType, userId: string,
): string => {
  // A message that opens with its own merge field ("Dear {{business_name}},") supplies its own greeting.
  const greeting = hasMergeFields(text)
    ? ''
    : `<p style="margin:0 0 12px;font-size:15px;color:#444;">Hi ${escapeHtml(recipient.name.trim().split(/\s+/)[0] || 'there')},</p>`;
  const unsubscribe = type === 'PROMOTIONAL'
    ? `<p style="margin:28px 0 0;font-size:12px;color:#999;">You're receiving this because you have a GoBuyMe account.
        <a href="${getPrimaryClientUrl() || 'https://gobuyme.shop'}/unsubscribe?t=${unsubscribeToken(userId)}" style="color:#999;">Unsubscribe from promotions</a></p>`
    : '';
  return emailLayout(`
    <h2 style="margin:0 0 12px;font-size:22px;color:#1A1410;">${escapeHtml(fillMergeFields(title, recipient))}</h2>
    ${greeting}<p style="margin:0;font-size:15px;line-height:1.6;color:#444;white-space:pre-wrap;">${toHtml(fillMergeFields(text, recipient))}</p>${unsubscribe}`);
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
      where, orderBy: { id: 'asc' }, take: EMAIL_BATCH,
      select: {
        id: true, name: true, email: true, role: true,
        vendor: { select: { businessName: true } },
        logisticsCompany: { select: { companyName: true } },
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;
    const messages: BatchEmail[] = users.map(u => {
      const r: MergeRecipient = {
        name: u.name, role: u.role, businessName: u.vendor?.businessName, companyName: u.logisticsCompany?.companyName,
      };
      return { to: u.email, subject: fillMergeFields(input.title, r), html: broadcastEmailHtml(input.title, text, r, type, u.id) };
    });
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
        role: audienceNotificationRole(input.audience),
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
  // Push and in-app text is one shared string, so a merge field there would show up as raw {{text}}.
  if (sendInApp && (hasMergeFields(input.title) || hasMergeFields(input.body))) {
    throw new BroadcastError('Merge fields like {{business_name}} work in emails only. Untick "In-app and push" or remove them from the title and message.');
  }
  if (!sendEmail && input.emailBody) throw new BroadcastError('An email message was given but email is not selected.');

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
