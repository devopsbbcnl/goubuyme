import * as crypto from 'crypto';
import { MAX_ATTEMPTS, isDue, rateLimitUntil, retryDelayMs, signState, tokenState, verifyMetaSignature, verifyState } from '../connectors/rules';

const DAY = 86_400_000;
const now = new Date('2026-11-06T10:00:00Z');

describe('retry schedule', () => {
  it('backs off 5, 15, 45 minutes and then stops', () => {
    expect([1, 2, 3].map((a) => retryDelayMs(a))).toEqual([5 * 60_000, 15 * 60_000, 45 * 60_000]);
    expect(retryDelayMs(MAX_ATTEMPTS)).toBeNull();
  });
});

describe('token state', () => {
  it('has no token, ok, expiring within 7 days, expired', () => {
    expect(tokenState(false, null, now)).toBe('NO_TOKEN');
    expect(tokenState(true, null, now)).toBe('OK');
    expect(tokenState(true, new Date(now.getTime() + 30 * DAY), now)).toBe('OK');
    expect(tokenState(true, new Date(now.getTime() + 6 * DAY), now)).toBe('EXPIRING');
    expect(tokenState(true, new Date(now.getTime() - 1), now)).toBe('EXPIRED');
  });
});

describe('rate limits and due checks', () => {
  it('honours the hint within one minute to one day', () => {
    expect(rateLimitUntil(5, now).getTime() - now.getTime()).toBe(60_000);
    expect(rateLimitUntil(600, now).getTime() - now.getTime()).toBe(600_000);
    expect(rateLimitUntil(10 * DAY / 1000, now).getTime() - now.getTime()).toBe(DAY);
    expect(rateLimitUntil(undefined, now).getTime() - now.getTime()).toBe(900_000);
  });
  it('is due only when connected, not rate limited, and its time has come', () => {
    const base = { status: 'CONNECTED', nextSyncAt: new Date(now.getTime() - 1), rateLimitedUntil: null };
    expect(isDue(base, now)).toBe(true);
    expect(isDue({ ...base, status: 'EXPIRED' }, now)).toBe(false);
    expect(isDue({ ...base, nextSyncAt: new Date(now.getTime() + 1000) }, now)).toBe(false);
    expect(isDue({ ...base, rateLimitedUntil: new Date(now.getTime() + 1000) }, now)).toBe(false);
  });
});

describe('signed OAuth state', () => {
  const secret = 'state-secret';
  const t0 = Date.now();
  it('round-trips, and rejects tampering, a wrong secret and expiry', () => {
    const s = signState({ accountId: 'a1', userId: 'u1' }, secret, t0);
    expect(verifyState(s, secret, t0 + 1000)).toEqual({ accountId: 'a1', userId: 'u1' });
    expect(verifyState(s, 'other', t0 + 1000)).toBeNull();
    const [body, sig] = s.split('.');
    const forged = Buffer.from(JSON.stringify({ accountId: 'a2', userId: 'u1', exp: t0 + 99999999 })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, secret, t0 + 1000)).toBeNull();
    expect(verifyState(`${body}x.${sig}`, secret, t0 + 1000)).toBeNull();
    expect(verifyState(s, secret, t0 + 11 * 60_000)).toBeNull();
    expect(verifyState('', secret)).toBeNull();
    expect(verifyState('garbage', secret)).toBeNull();
  });
});

describe('Meta webhook signature', () => {
  const body = Buffer.from('{"object":"page","entry":[]}');
  const good = 'sha256=' + crypto.createHmac('sha256', 'app-secret').update(body).digest('hex');
  it('accepts only the exact signature of the raw body', () => {
    expect(verifyMetaSignature(body, good, 'app-secret')).toBe(true);
    expect(verifyMetaSignature(Buffer.from('{"object":"page","entry":[1]}'), good, 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, good, 'wrong')).toBe(false);
    expect(verifyMetaSignature(body, undefined, 'app-secret')).toBe(false);
    expect(verifyMetaSignature(undefined, good, 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, good, undefined)).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=abc', 'app-secret')).toBe(false);
  });
});
