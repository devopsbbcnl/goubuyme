// Pure rules for platform connections: no database, no network. Unit-tested.
import * as crypto from 'crypto';

const MIN = 60_000;
const DAY = 86_400_000;

/** Delay before retry number `attempt` (1-based): 5, 15, 45 minutes, then give up until the next scheduled run. */
export const MAX_ATTEMPTS = 4;
export const retryDelayMs = (attempt: number): number | null => (attempt >= MAX_ATTEMPTS ? null : 5 * MIN * 3 ** (attempt - 1));

export type TokenState = 'NO_TOKEN' | 'OK' | 'EXPIRING' | 'EXPIRED';
/** A token with no recorded expiry is treated as non-expiring (Meta page tokens). Warn 7 days ahead. */
export const tokenState = (hasToken: boolean, expiresAt: Date | null, now = new Date()): TokenState => {
  if (!hasToken) return 'NO_TOKEN';
  if (!expiresAt) return 'OK';
  const left = expiresAt.getTime() - now.getTime();
  return left <= 0 ? 'EXPIRED' : left <= 7 * DAY ? 'EXPIRING' : 'OK';
};

/** When a rate-limited integration may try again: honour the platform's hint, never sooner than a minute, never later than a day. */
export const rateLimitUntil = (retryAfterSeconds: number | null | undefined, now = new Date()): Date =>
  new Date(now.getTime() + Math.min(DAY, Math.max(MIN, (retryAfterSeconds ?? 900) * 1000)));

export const isDue = (i: { status: string; nextSyncAt: Date | null; rateLimitedUntil: Date | null }, now = new Date()): boolean =>
  i.status === 'CONNECTED' && (!i.rateLimitedUntil || i.rateLimitedUntil <= now) && (!i.nextSyncAt || i.nextSyncAt <= now);

// ── Signed OAuth state (who is connecting which account), so the public callback cannot be forged ──

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export const signState = (payload: { accountId: string; userId: string }, secret: string, now = Date.now()): string => {
  const body = b64(JSON.stringify({ ...payload, exp: now + 10 * MIN, n: crypto.randomBytes(8).toString('hex') }));
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
};

export const verifyState = (state: string, secret: string, now = Date.now()): { accountId: string; userId: string } | null => {
  const [body, sig] = String(state ?? '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig); const e = Buffer.from(expected);
  if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof p.exp === 'number' && p.exp > now && p.accountId && p.userId ? { accountId: p.accountId, userId: p.userId } : null;
  } catch { return null; }
};

/** Meta signs webhook bodies with the app secret: `X-Hub-Signature-256: sha256=<hex hmac of the raw body>`. */
export const verifyMetaSignature = (rawBody: Buffer | undefined, header: string | undefined, appSecret: string | undefined): boolean => {
  if (!rawBody || !header || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header); const e = Buffer.from(expected);
  return a.length === e.length && crypto.timingSafeEqual(a, e);
};
