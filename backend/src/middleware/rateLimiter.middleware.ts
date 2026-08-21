import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import logger from '../utils/logger';
import prisma from '../config/db';

// PM2 runs this API in cluster mode (`instances: 'max'` in ecosystem.config.js), and
// express-rate-limit's default MemoryStore is per-process — each worker counts
// independently, so the effective limit is `max * cores` unless the counters are
// shared. When REDIS_URL is set, counters move to Redis and hold their documented
// value across the whole cluster. Without it, limiting still works, just scoped
// per-worker as before — this is additive, not a behavior change by default.
let redisClient: Redis | null = null;
if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  redisClient.on('error', (err) => logger.error('Redis rate-limit store error', { error: err.message }));
  redisClient.connect().catch((err) => logger.error('Redis rate-limit store failed to connect', { error: err.message }));
}

const sharedStore = (prefix: string) =>
  redisClient
    ? new RedisStore({
        prefix,
        sendCommand: (...args: string[]) => redisClient!.call(...(args as [string, ...string[]])) as Promise<any>,
      })
    : undefined;

// Outside production, every limiter below is a no-op. Local/dev testing (repeated curl
// calls, React strict-mode double-fetching, hot reload) blows through these limits in
// minutes with no attacker involved — the limiters exist to protect the deployed API,
// not to throttle the person building it.
const skipOutsideProduction = () => process.env.NODE_ENV !== 'production';

// A client that keeps retrying after a 429 (a stuck poll loop, a misconfigured
// job, or many users sharing one rate-limit bucket because of a proxy-hop
// mismatch — see `trust proxy` in server.ts) would otherwise get a fresh
// ErrorLog row persisted on every single rejected request, forever. This caps
// that to at most one persisted row per ip+path per window, across all PM2
// workers when Redis is configured, per-process otherwise — the 429 response
// itself is never throttled, only the DB write behind it.
const RATE_LIMIT_LOG_THROTTLE_MS = 60_000;
const loggedRecently = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_LOG_THROTTLE_MS;
  for (const [key, ts] of loggedRecently) {
    if (ts < cutoff) loggedRecently.delete(key);
  }
}, RATE_LIMIT_LOG_THROTTLE_MS).unref();

const shouldPersistRateLimitLog = async (key: string): Promise<boolean> => {
  if (redisClient) {
    const set = await redisClient
      .set(`rl:logged:${key}`, '1', 'PX', RATE_LIMIT_LOG_THROTTLE_MS, 'NX')
      .catch(() => null);
    return set === 'OK';
  }
  const now = Date.now();
  const last = loggedRecently.get(key);
  if (last && now - last < RATE_LIMIT_LOG_THROTTLE_MS) return false;
  loggedRecently.set(key, now);
  return true;
};

// express-rate-limit's `message` option only fires on the default handler. Overriding
// `handler` (required to also persist an ErrorLog) means we own the response too — so
// every limiter below builds its response from the same message it used to pass via
// `message`. This is what makes 429s show up in the admin Error Logs page instead of
// only ever being visible by SSHing into the VPS and grepping the winston log.
const rateLimitHandler = (message: string) => async (req: Request, res: Response) => {
  logger.warn('Rate limit exceeded', { path: req.originalUrl, ip: req.ip });
  try {
    if (await shouldPersistRateLimitLog(`${req.ip}:${req.originalUrl}`)) {
      await prisma.errorLog.create({
        data: {
          platform: 'BACKEND',
          source: 'rate-limit',
          message,
          url: req.originalUrl,
          method: req.method,
          context: {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            body: req.body?.email ? { email: req.body.email } : undefined,
          },
        },
      });
    }
  } catch (err) {
    logger.error('Failed to record rate-limit error log', { error: (err as Error).message });
  }
  res.status(429).json({ status: 'error', message });
};

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore('rl:global:'),
  skip: skipOutsideProduction,
  handler: rateLimitHandler('Too many requests. Please try again later.'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore('rl:auth:'),
  skip: skipOutsideProduction,
  handler: rateLimitHandler('Too many auth attempts. Please try again later.'),
});

export const locationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 360,
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore('rl:location:'),
  skip: skipOutsideProduction,
  handler: rateLimitHandler('Location update rate limit exceeded.'),
});

// Public, unauthenticated endpoint (mobile registration screens hit it before login) — capped
// tighter than globalLimiter as a courtesy limit on the self-hosted Nominatim/OSRM instances.
export const geocodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore('rl:geocode:'),
  skip: skipOutsideProduction,
  handler: rateLimitHandler('Too many address lookups. Please try again later.'),
});
