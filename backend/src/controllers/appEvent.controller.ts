import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { decodeOptionalUser } from '../utils/decodeOptionalUser';
import { CLIENT_EVENTS, SERVER_EVENTS, ingestClientEvents } from '../services/analytics.service';

const ALL_EVENTS: readonly string[] = [...CLIENT_EVENTS, ...SERVER_EVENTS];

// Reports bucket by Nigerian calendar day/week, not UTC — occurredAt is stored as UTC.
const LOCAL_TS = Prisma.sql`("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')`;

// Every event with an `actor` column: the userId when known, else the user that same
// anonymousId later logged in as, else the anonymousId itself. Without this stitching a
// person who browses logged-out and then signs in counts as two people.
const STITCHED_EVENTS = Prisma.sql`(
  SELECT e.*, COALESCE(e."userId", s."userId", e."anonymousId") AS actor
  FROM app_events e
  LEFT JOIN (
    SELECT DISTINCT ON ("anonymousId") "anonymousId", "userId"
    FROM app_events
    WHERE "anonymousId" IS NOT NULL AND "userId" IS NOT NULL
    ORDER BY "anonymousId", "occurredAt" DESC
  ) s ON s."anonymousId" = e."anonymousId"
) ev`;

const sinceDays = (raw: unknown, fallback: number, max = 365): Date => {
  const n = parseInt(String(raw ?? ''), 10);
  const days = Number.isNaN(n) || n <= 0 ? fallback : Math.min(n, max);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

// POST /api/v1/events — public batch ingest from the mobile and web apps.
export const ingestEvents = catchAsync(async (req: Request, res: Response) => {
  const { platform, anonymousId, appVersion, events } = req.body;
  const { userId, role } = decodeOptionalUser(req);
  const stored = await ingestClientEvents({ platform, anonymousId, appVersion, events, userId, role });
  return apiResponse.success(res, 'Events received.', { stored }, 202);
});

// GET /admin/analytics/usage/overview?days=30
export const getUsageOverview = catchAsync(async (req: Request, res: Response) => {
  const since = sinceDays(req.query.days, 30);

  const [totals, daily, topEvents, topScreens, platforms] = await Promise.all([
    prisma.$queryRaw<Array<{ events: number; people: number; users: number; devices: number; sessions: number }>>`
      SELECT COUNT(*)::int AS events,
             COUNT(DISTINCT actor)::int AS people,
             COUNT(DISTINCT "userId")::int AS users,
             COUNT(DISTINCT "anonymousId")::int AS devices,
             COUNT(DISTINCT "sessionId")::int AS sessions
      FROM ${STITCHED_EVENTS} WHERE "occurredAt" >= ${since}`,
    prisma.$queryRaw<Array<{ day: string; active: number; events: number }>>`
      SELECT to_char(date_trunc('day', ${LOCAL_TS}), 'YYYY-MM-DD') AS day,
             COUNT(DISTINCT actor)::int AS active,
             COUNT(*)::int AS events
      FROM ${STITCHED_EVENTS} WHERE "occurredAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ name: string; count: number; actors: number }>>`
      SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT actor)::int AS actors
      FROM ${STITCHED_EVENTS} WHERE "occurredAt" >= ${since}
      GROUP BY name ORDER BY count DESC`,
    prisma.$queryRaw<Array<{ screen: string; views: number }>>`
      SELECT screen, COUNT(*)::int AS views
      FROM app_events
      WHERE name = 'screen_viewed' AND screen IS NOT NULL AND "occurredAt" >= ${since}
      GROUP BY screen ORDER BY views DESC LIMIT 15`,
    prisma.$queryRaw<Array<{ platform: string; events: number; actors: number }>>`
      SELECT platform, COUNT(*)::int AS events, COUNT(DISTINCT actor)::int AS actors
      FROM ${STITCHED_EVENTS} WHERE "occurredAt" >= ${since}
      GROUP BY platform ORDER BY events DESC`,
  ]);

  return apiResponse.success(res, 'Usage overview fetched.', {
    since: since.toISOString(),
    totals: totals[0] ?? { events: 0, people: 0, users: 0, devices: 0, sessions: 0 },
    daily,
    topEvents,
    topScreens,
    platforms,
  });
});

const DEFAULT_FUNNEL = ['vendor_viewed', 'item_added_to_cart', 'checkout_started', 'order_placed', 'payment_succeeded'];

const median = (arr: number[]): number | null => {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// GET /admin/analytics/usage/funnel?days=30&steps=vendor_viewed,item_added_to_cart,...
// An actor counts at step N if they did every earlier step, each one's first occurrence
// no later than the next. Anonymous pre-login activity is stitched to the user it later
// logged in as (same anonymousId), so browsing before signup still lands in the funnel.
export const getUsageFunnel = catchAsync(async (req: Request, res: Response) => {
  const since = sinceDays(req.query.days, 30);
  const requested = typeof req.query.steps === 'string' ? req.query.steps.split(',').map((s) => s.trim()) : DEFAULT_FUNNEL;
  const steps = requested.filter((s) => ALL_EVENTS.includes(s)).slice(0, 8);
  if (steps.length < 2) return apiResponse.error(res, 'A funnel needs at least two known events.', 400);

  const rows = await prisma.$queryRaw<Array<{ actor: string; name: string; first_at: Date }>>`
    SELECT actor, name, MIN("occurredAt") AS first_at
    FROM ${STITCHED_EVENTS}
    WHERE name IN (${Prisma.join(steps)}) AND "occurredAt" >= ${since}
    GROUP BY 1, 2`;

  const byActor = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.actor) continue;
    let m = byActor.get(r.actor);
    if (!m) byActor.set(r.actor, (m = new Map()));
    m.set(r.name, new Date(r.first_at).getTime());
  }

  const counts = steps.map(() => 0);
  const gapsMinutes: number[][] = steps.map(() => []);
  for (const firsts of byActor.values()) {
    let prev: number | undefined;
    for (let i = 0; i < steps.length; i++) {
      const t = firsts.get(steps[i]);
      if (t === undefined || (prev !== undefined && t < prev)) break;
      counts[i] += 1;
      if (prev !== undefined) gapsMinutes[i].push((t - prev) / 60_000);
      prev = t;
    }
  }

  const top = counts[0] ?? 0;
  const stages = steps.map((key, i) => {
    const med = median(gapsMinutes[i]);
    return {
      key,
      count: counts[i],
      pctOfTop: top > 0 ? Math.round((counts[i] / top) * 1000) / 10 : 0,
      pctOfPrev: i === 0 ? 100 : counts[i - 1] > 0 ? Math.round((counts[i] / counts[i - 1]) * 1000) / 10 : 0,
      dropOffFromPrev: i === 0 ? 0 : Math.max(0, counts[i - 1] - counts[i]),
      medianMinutesFromPrev: i === 0 || med === null ? null : Math.round(med * 10) / 10,
    };
  });

  return apiResponse.success(res, 'Usage funnel fetched.', { since: since.toISOString(), steps, stages });
});

// GET /admin/analytics/usage/retention?weeks=8&event=order_placed&role=CUSTOMER
// Weekly cohorts of signed-in users keyed by the week they first did `event` (or anything,
// when omitted), and how many came back to do it again in each following week.
export const getUsageRetention = catchAsync(async (req: Request, res: Response) => {
  const weeksRaw = parseInt(String(req.query.weeks ?? '8'), 10);
  const weeks = Number.isNaN(weeksRaw) ? 8 : Math.min(Math.max(weeksRaw, 2), 26);
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
  const event = typeof req.query.event === 'string' && ALL_EVENTS.includes(req.query.event) ? req.query.event : null;
  const role = typeof req.query.role === 'string' && ['CUSTOMER', 'VENDOR', 'RIDER'].includes(req.query.role) ? req.query.role : null;

  const eventFilter = event ? Prisma.sql`AND name = ${event}` : Prisma.empty;
  const roleFilter = role ? Prisma.sql`AND role = ${role}` : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ cohort: string; week_n: number; users: number }>>`
    WITH ev AS (
      SELECT "userId", date_trunc('week', ${LOCAL_TS}) AS wk
      FROM app_events
      WHERE "userId" IS NOT NULL AND "occurredAt" >= ${since} ${eventFilter} ${roleFilter}
      GROUP BY 1, 2
    ), firsts AS (
      SELECT "userId", MIN(wk) AS cohort FROM ev GROUP BY 1
    )
    SELECT to_char(f.cohort, 'YYYY-MM-DD') AS cohort,
           ROUND(EXTRACT(EPOCH FROM (ev.wk - f.cohort)) / 604800)::int AS week_n,
           COUNT(*)::int AS users
    FROM ev JOIN firsts f USING ("userId")
    GROUP BY 1, 2 ORDER BY 1, 2`;

  const cohorts = new Map<string, number[]>();
  for (const r of rows) {
    let arr = cohorts.get(r.cohort);
    if (!arr) cohorts.set(r.cohort, (arr = []));
    arr[r.week_n] = r.users;
  }

  return apiResponse.success(res, 'Usage retention fetched.', {
    weeks,
    event,
    role,
    cohorts: [...cohorts.entries()].map(([cohort, arr]) => ({
      cohort,
      size: arr[0] ?? 0,
      weeks: Array.from({ length: arr.length }, (_, i) => arr[i] ?? 0),
    })),
  });
});

// GET /admin/analytics/usage/events?name=&userId=&platform=&page=1&limit=50 — raw stream for debugging
export const listAppEvents = catchAsync(async (req: Request, res: Response) => {
  const { name, userId, platform, page = '1', limit = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const where: Prisma.AppEventWhereInput = {
    ...(name ? { name } : {}),
    ...(userId ? { userId } : {}),
    ...(platform ? { platform } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.appEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.appEvent.count({ where }),
  ]);

  return apiResponse.paginated(res, 'Events fetched.', rows, {
    page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum),
  });
});

// GET /admin/analytics/usage/catalog — event names the dashboards can filter on
export const getEventCatalog = catchAsync(async (_req: Request, res: Response) => {
  return apiResponse.success(res, 'Event catalog fetched.', { client: CLIENT_EVENTS, server: SERVER_EVENTS });
});
