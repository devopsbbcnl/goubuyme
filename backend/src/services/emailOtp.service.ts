import crypto from 'crypto';
import prisma from '../config/db';
import { generateOtpCode, hashOtp, otpMatches } from '../utils/otp';
import { sendOtpEmail } from './email.service';

const OTP_PURPOSE = 'email-otp';
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const HISTORY_MS = 24 * 60 * 60 * 1000;

export class EmailOtpError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfterSeconds?: number) {
    super(message);
  }
}

/**
 * Issues a fresh email code, invalidating any earlier one. Throws EmailOtpError
 * (429) inside the resend cooldown or past the hourly cap, which also stops the
 * unauthenticated resend endpoint being used to flood someone's inbox.
 */
export async function issueEmailOtp(userId: string, email: string, name: string): Promise<void> {
  const now = Date.now();

  // Rows are kept (marked used) rather than deleted so the hourly cap can count
  // them; anything older than a day is no longer needed for that.
  await prisma.emailOtp.deleteMany({ where: { userId, createdAt: { lt: new Date(now - HISTORY_MS) } } });

  const recent = await prisma.emailOtp.findMany({
    where: { userId, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - recent[0].createdAt.getTime())) / 1000);
    throw new EmailOtpError(`Please wait ${wait}s before requesting another code.`, 429, wait);
  }
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    throw new EmailOtpError('Too many codes requested. Please try again in an hour.', 429, 3600);
  }

  const code = generateOtpCode();
  const id = crypto.randomUUID();
  await prisma.$transaction([
    // Only the newest code is ever valid.
    prisma.emailOtp.updateMany({ where: { userId, used: false }, data: { used: true } }),
    prisma.emailOtp.create({
      data: { id, userId, codeHash: hashOtp(OTP_PURPOSE, id, code), expiresAt: new Date(now + CODE_TTL_MS) },
    }),
  ]);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[OTP] ${email} → ${code}`);
  }
  void sendOtpEmail(email, name, code);
}

/**
 * Like issueEmailOtp, but swallows the cooldown/cap: for flows (registration
 * retry, login of an unverified account) where a code sent moments ago is still
 * valid and the user should just be told to check their inbox.
 */
export async function issueEmailOtpIfAllowed(userId: string, email: string, name: string): Promise<void> {
  try {
    await issueEmailOtp(userId, email, name);
  } catch (err) {
    if (!(err instanceof EmailOtpError)) throw err;
  }
}

/**
 * Checks a code against the user's newest unused one, counting failed attempts.
 * Returns the row id on success; the caller marks it used in its own transaction
 * alongside the change the code authorises.
 */
export async function checkEmailOtp(userId: string, code: string): Promise<string> {
  const otp = await prisma.emailOtp.findFirst({
    where: { userId, used: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt.getTime() < Date.now()) {
    throw new EmailOtpError('This code has expired. Please request a new one.', 400);
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new EmailOtpError('Too many incorrect attempts. Please request a new code.', 429);
  }

  if (!otpMatches(OTP_PURPOSE, otp.id, code, otp.codeHash)) {
    const { attempts } = await prisma.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const left = MAX_ATTEMPTS - attempts;
    throw new EmailOtpError(
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Please request a new code.',
      left > 0 ? 400 : 429,
    );
  }

  return otp.id;
}
