import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import logger from '../utils/logger';

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

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: 'error', message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore('rl:global:'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 1000,
  message: { status: 'error', message: 'Too many auth attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore('rl:auth:'),
});

export const locationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 360,
  message: { status: 'error', message: 'Location update rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore('rl:location:'),
});

// Public, unauthenticated endpoint (mobile registration screens hit it before login) — capped
// tighter than globalLimiter since each call is a billed Google Maps request.
export const geocodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { status: 'error', message: 'Too many address lookups. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore('rl:geocode:'),
});
