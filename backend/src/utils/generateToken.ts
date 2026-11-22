import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  role: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  } as jwt.SignOptions);
};

/**
 * Refresh tokens are stored as a SHA-256 hash, so a leaked database copy cannot be used to sign in.
 * (They are long random JWTs, so a fast hash is enough; no salt or slow hash is needed.)
 */
export const hashRefreshToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/** True when the presented token is the one on file. Accepts an older plain-text value until that session next refreshes. */
export const refreshTokenMatches = (stored: string | null | undefined, presented: string): boolean => {
  if (!stored) return false;
  const a = Buffer.from(stored);
  const hashed = Buffer.from(hashRefreshToken(presented));
  if (a.length === hashed.length && crypto.timingSafeEqual(a, hashed)) return true;
  // Older rows hold the token itself. A stored 64-character hex value is a hash, never a legacy token (those are JWTs).
  if (/^[a-f0-9]{64}$/.test(stored)) return false;
  const plain = Buffer.from(presented);
  return a.length === plain.length && crypto.timingSafeEqual(a, plain);
};

// Socket tickets are signed with a key derived from the access secret, so a ticket
// can never be replayed as a REST access token (verifyToken uses the raw secret)
// and vice versa. They live 60s: they are only checked once, at socket handshake.
const socketTicketKey = (): Buffer =>
  crypto.createHmac('sha256', process.env.JWT_ACCESS_SECRET as string).update('socket-ticket').digest();

export const generateSocketTicket = (payload: TokenPayload): string =>
  jwt.sign(payload, socketTicketKey(), { expiresIn: '60s' });

export const verifySocketTicket = (ticket: string): TokenPayload =>
  jwt.verify(ticket, socketTicketKey()) as TokenPayload;

export const generateReferralCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'GBM-';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};
