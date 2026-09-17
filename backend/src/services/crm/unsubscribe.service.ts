import crypto from 'crypto';

// Signed, non-expiring unsubscribe tokens for marketing emails. The HMAC ties a token to one
// user id, so a link can only ever opt out the person it was sent to.

const secret = () => {
  const s = process.env.MARKETING_UNSUBSCRIBE_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('No secret configured for unsubscribe tokens');
  return s;
};

const sign = (userId: string) =>
  crypto.createHmac('sha256', secret()).update(`unsubscribe:${userId}`).digest('base64url');

export const unsubscribeToken = (userId: string) => `${Buffer.from(userId).toString('base64url')}.${sign(userId)}`;

/** Returns the user id for a valid token, or null. Constant-time comparison. */
export const verifyUnsubscribeToken = (token: string): string | null => {
  const [idPart, sig] = token.split('.');
  if (!idPart || !sig) return null;
  const userId = Buffer.from(idPart, 'base64url').toString('utf8');
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return userId;
};
