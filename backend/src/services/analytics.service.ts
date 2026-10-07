import prisma from '../config/db';
import { Prisma } from '@prisma/client';
import { recordError } from '../utils/recordError';

/**
 * In-house product analytics (AppEvent). Two writers:
 *   - clients (mobile/web) POST batches of intent events to /events
 *   - the backend records order/payment/delivery outcomes via trackServerEvent()
 *
 * Event names are an allowlist so the stream stays queryable — add a name here
 * before emitting it anywhere. Properties carry ids, counts and amounts only:
 * never names, emails, phone numbers, addresses or free-text search queries.
 */

export const CLIENT_EVENTS = [
  'app_opened',
  'screen_viewed',
  'vendor_viewed',
  'search_performed',
  'item_added_to_cart',
  'checkout_started',
] as const;

export const SERVER_EVENTS = [
  'order_placed',
  'payment_succeeded',
  'payment_failed',
  'order_cancelled',
  'order_accepted',
  'order_rejected',
  'order_ready',
  'job_accepted',
  'delivery_completed',
] as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[number];
export type ServerEventName = (typeof SERVER_EVENTS)[number];

type EventProps = Record<string, string | number | boolean | null>;

// Opt-out lookups are cached briefly so a busy client batch (or a burst of
// server events for one user) doesn't hit the users table for every row.
const OPT_IN_TTL_MS = 60_000;
const optInCache = new Map<string, { value: boolean; at: number }>();

export async function isAnalyticsAllowed(userId: string): Promise<boolean> {
  const cached = optInCache.get(userId);
  if (cached && Date.now() - cached.at < OPT_IN_TTL_MS) return cached.value;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { analyticsOptIn: true } });
  const value = user?.analyticsOptIn ?? false;
  optInCache.set(userId, { value, at: Date.now() });
  return value;
}

/** Call after a user changes their analytics preference so this worker stops/starts at once. */
export function invalidateAnalyticsOptIn(userId: string): void {
  optInCache.delete(userId);
}

/**
 * Records a server-side outcome event. Fire-and-forget: always call as
 * `void trackServerEvent(...)` — analytics must never break or slow a user flow.
 */
export async function trackServerEvent(
  name: ServerEventName,
  userId: string,
  role: string,
  properties?: EventProps,
): Promise<void> {
  try {
    if (!(await isAnalyticsAllowed(userId))) return;
    await prisma.appEvent.create({
      data: {
        name,
        userId,
        role,
        platform: 'SERVER',
        occurredAt: new Date(),
        ...(properties ? { properties: properties as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (err) {
    recordError('analytics', 'Failed to record server event', err, { name, userId });
  }
}

export interface IncomingClientEvent {
  name: ClientEventName;
  occurredAt?: string;
  sessionId?: string;
  screen?: string;
  properties?: EventProps;
}

// Client clocks drift (and can be set to anything). Accept the client's timestamp
// for ordering within a session, but clamp it to a sane window around server time.
const MAX_PAST_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const clampOccurredAt = (iso: string | undefined, now: number): Date => {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t) || t < now - MAX_PAST_MS || t > now + MAX_FUTURE_MS) return new Date(now);
  return new Date(t);
};

/** Persists a validated client batch. Returns how many rows were stored (0 when opted out). */
export async function ingestClientEvents(input: {
  events: IncomingClientEvent[];
  platform: 'MOBILE' | 'WEB';
  anonymousId?: string;
  appVersion?: string;
  userId?: string;
  role?: string;
}): Promise<number> {
  if (input.userId && !(await isAnalyticsAllowed(input.userId))) return 0;

  const now = Date.now();
  const { count } = await prisma.appEvent.createMany({
    data: input.events.map((e) => ({
      name: e.name,
      userId: input.userId ?? null,
      anonymousId: input.anonymousId ?? null,
      role: input.role ?? null,
      platform: input.platform,
      sessionId: e.sessionId ?? null,
      screen: e.screen ?? null,
      appVersion: input.appVersion ?? null,
      occurredAt: clampOccurredAt(e.occurredAt, now),
      ...(e.properties ? { properties: e.properties as Prisma.InputJsonValue } : {}),
    })),
  });
  return count;
}
