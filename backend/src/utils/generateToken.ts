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
