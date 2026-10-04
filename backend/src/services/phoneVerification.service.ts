import crypto from 'crypto';
import prisma from '../config/db';
import logger from '../utils/logger';
import { generateOtpCode, hashOtp, otpMatches } from '../utils/otp';
import { sendSms } from './sms.service';

const OTP_PURPOSE = 'phone-otp';
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;

export class PhoneVerificationError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfterSeconds?: number) {
    super(message);
  }
}

/**
 * Canonical Nigerian mobile number: +234 followed by 10 digits starting 7/8/9.
 * Accepts 0803…, 803…, 234803…, +234 803 … Returns null if it isn't one.
 */
export const normalizeNigerianMobile = (input: string): string | null => {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('234')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[789]\d{9}$/.test(digits) ? `+234${digits}` : null;
};

const assertPhoneAvailable = async (userId: string, phone: string): Promise<void> => {
  const taken = await prisma.user.findFirst({
    where: { phone, id: { not: userId }, deletedAt: null },
    select: { id: true },
  });
  if (taken) throw new PhoneVerificationError('This phone number is already linked to another account.', 409);
};

/**
 * Sends a verification code to `requestedPhone`, or to the user's current phone
 * when none is given. Enforces a resend cooldown and an hourly cap per user.
 */
export async function sendPhoneOtp(userId: string, requestedPhone?: string): Promise<{ phone: string; expiresInSeconds: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, isPhoneVerified: true },
  });
  if (!user) throw new PhoneVerificationError('User not found.', 404);

  const phone = normalizeNigerianMobile(requestedPhone?.trim() || user.phone || '');
  if (!phone) throw new PhoneVerificationError('Enter a valid Nigerian mobile number, e.g. 08031234567.', 400);
  if (user.isPhoneVerified && user.phone === phone) {
    throw new PhoneVerificationError('This phone number is already verified.', 400);
  }
  await assertPhoneAvailable(userId, phone);

  const now = Date.now();
  const recent = await prisma.phoneOtp.findMany({
    where: { userId, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - recent[0].createdAt.getTime())) / 1000);
    throw new PhoneVerificationError(`Please wait ${wait}s before requesting another code.`, 429, wait);
  }
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    throw new PhoneVerificationError('Too many codes requested. Please try again in an hour.', 429, 3600);
  }

  const code = generateOtpCode();
  const id = crypto.randomUUID();
  const [, otp] = await prisma.$transaction([
    // Only the newest code is ever valid.
    prisma.phoneOtp.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.phoneOtp.create({
      data: { id, userId, phone, codeHash: hashOtp(OTP_PURPOSE, id, code), expiresAt: new Date(now + CODE_TTL_MS) },
    }),
  ]);

  const sent = await sendSms(
    phone,
    `Your GoBuyMe verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
    { channel: (process.env.TERMII_OTP_CHANNEL as 'dnd' | 'generic' | undefined) ?? 'dnd' },
  );

  if (!sent) {
    if (process.env.NODE_ENV !== 'production' && !process.env.TERMII_API_KEY) {
      // Local development without Termii credentials: surface the code in the
      // server console only, mirroring the email OTP behaviour.
      logger.info(`[PHONE OTP] ${phone} → ${code}`);
    } else {
      await prisma.phoneOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      throw new PhoneVerificationError('We could not send the SMS right now. Please try again shortly.', 502);
    }
  }

  return { phone, expiresInSeconds: CODE_TTL_MS / 1000 };
}

/** Confirms a code. On success the verified number becomes the user's phone. */
export async function verifyPhoneOtp(userId: string, code: string): Promise<{ phone: string }> {
  const otp = await prisma.phoneOtp.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt.getTime() < Date.now()) {
    throw new PhoneVerificationError('This code has expired. Please request a new one.', 400);
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new PhoneVerificationError('Too many incorrect attempts. Please request a new code.', 429);
  }

  if (!otpMatches(OTP_PURPOSE, otp.id, code, otp.codeHash)) {
    const updated = await prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const left = MAX_ATTEMPTS - updated.attempts;
    throw new PhoneVerificationError(
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Please request a new code.',
      left > 0 ? 400 : 429,
    );
  }

  // The number may have been claimed by someone else since the code was sent.
  await assertPhoneAvailable(userId, otp.phone);

  const now = new Date();
  await prisma.$transaction([
    prisma.phoneOtp.update({ where: { id: otp.id }, data: { consumedAt: now } }),
    prisma.user.update({
      where: { id: userId },
      data: { phone: otp.phone, isPhoneVerified: true, phoneVerifiedAt: now },
    }),
    prisma.auditLog.create({
      data: { userId, action: 'PHONE_VERIFIED', entity: 'User', entityId: userId, meta: { method: 'sms_otp' } },
    }),
  ]);

  return { phone: otp.phone };
}
