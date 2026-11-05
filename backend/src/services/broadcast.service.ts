import { BroadcastAudience, Prisma, Role } from '@prisma/client';
import prisma from '../config/db';
import { recordError } from '../utils/recordError';
import { sendPushToMany } from './notification.service';
import { sendWebPush } from './webPush.service';

// A message from the platform to everyone, to every customer / vendor / rider, or to one account.
// Staff write it; delivery is an in-app Notification row for each recipient plus
// a push to every device that can take one. It is operational (an outage, a
// policy change), so, unlike a CRM campaign, it ignores marketing opt-in and
// frequency caps. A broadcast is never edited or deleted once sent.

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
}

const AUDIENCE_ROLES: Record<BroadcastAudience, Role[]> = {
  ALL: [Role.CUSTOMER, Role.VENDOR, Role.RIDER],
  CUSTOMERS: [Role.CUSTOMER],
  VENDORS: [Role.VENDOR],
  RIDERS: [Role.RIDER],
  USER: [Role.CUSTOMER, Role.VENDOR, Role.RIDER],
};

// Active, undeleted accounts only: a suspended or deleted one has no session to read it in.
export const audienceWhere = (audience: BroadcastAudience, targetUserId?: string | null): Prisma.UserWhereInput => ({
  role: { in: AUDIENCE_ROLES[audience] },
  isActive: true,
  deletedAt: null,
  // A single-user message matches that account only; an empty id matches nobody.
  ...(audience === 'USER' ? { id: targetUserId || '' } : {}),
});

interface Reach { recipients: number; pushReachable: number }

// Who would be addressed, and how many of them can actually be buzzed, so the
// form can say so before anything is sent.
export const preview = async (audience: BroadcastAudience, targetUserId?: string | null): Promise<Reach> => {
  const where = audienceWhere(audience, targetUserId);
  const [recipients, pushReachable] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...where, OR: [{ pushToken: { not: null } }, { pushSubscriptions: { some: {} } }] } }),
  ]);
  return { recipients, pushReachable };
};

const CHUNK = 500;
const WEB_PUSH_CONCURRENCY = 20;

// Runs after the broadcast is on the record, so a slow push provider never holds up the admin.
const deliver = async (broadcastId: string, input: BroadcastInput): Promise<void> => {
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

  const duplicate = await prisma.broadcast.findFirst({
    where: {
      audience: input.audience, targetUserId: input.targetUserId ?? null, title: input.title, body: input.body,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (duplicate) throw new BroadcastError('This exact message was just sent to that audience.', 409);

  const reach = await preview(input.audience, input.targetUserId);
  if (reach.recipients === 0) {
    throw new BroadcastError(input.audience === 'USER'
      ? 'That user cannot be messaged (not found, suspended or deleted).'
      : 'That audience has nobody in it.');
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      authorId: actorId,
      audience: input.audience,
      targetUserId: input.audience === 'USER' ? input.targetUserId : null,
      title: input.title,
      body: input.body,
      recipientCount: reach.recipients,
      pushCount: reach.pushReachable,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: 'BROADCAST_SENT',
      entity: 'Broadcast',
      entityId: broadcast.id,
      meta: { title: input.title, audience: input.audience, targetUserId: input.targetUserId ?? null, recipients: reach.recipients, pushReachable: reach.pushReachable },
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
