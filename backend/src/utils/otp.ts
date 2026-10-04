import crypto from 'crypto';

/** Shared primitives for one-time codes (email + SMS). */

export const OTP_LENGTH = 6;

/** Uniformly random 6-digit code from the CSPRNG (never Math.random). */
export const generateOtpCode = (): string =>
  crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');

// One key per purpose, derived from the access secret, so a hash from one OTP
// table can never validate against another.
const otpKey = (purpose: string): Buffer =>
  crypto.createHmac('sha256', process.env.JWT_ACCESS_SECRET as string).update(purpose).digest();

/**
 * Codes are stored only as an HMAC bound to their row id: a database leak does not
 * reveal live codes, and a stored hash cannot be replayed against another row.
 */
export const hashOtp = (purpose: string, rowId: string, code: string): string =>
  crypto.createHmac('sha256', otpKey(purpose)).update(`${rowId}:${code}`).digest('hex');

export const otpMatches = (purpose: string, rowId: string, code: string, storedHash: string): boolean => {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashOtp(purpose, rowId, String(code ?? '')), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
