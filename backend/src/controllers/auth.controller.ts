import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import {
  generateAccessToken,
  generateRefreshToken,
  generateReferralCode,
} from '../utils/generateToken';
import { sendPasswordResetEmail, sendOtpEmail, sendWelcomeEmail } from '../services/email.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { Role, CommissionTier, VendorCategory } from '@prisma/client';

const SALT_ROUNDS = 12;

const buildUserPayload = (user: {
  id: string; name: string; email: string; phone: string | null; role: Role; avatar: string | null;
}) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar });

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createAndDispatchOtp(userId: string, email: string, name: string): Promise<void> {
  await prisma.emailOtp.deleteMany({ where: { userId } });
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.emailOtp.create({ data: { userId, code, expiresAt } });
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[OTP] ${email} → ${code}`);
  }
  void sendOtpEmail(email, name, code);
}

export const register = catchAsync(async (req: Request, res: Response) => {
  const {
    name, email, phone, password, role,
    referralCode,
    commissionTier, businessName, category, address, city, state,
    vehicleType,
  } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isEmailVerified) {
      await createAndDispatchOtp(existing.id, existing.email, existing.name);
      return apiResponse.success(res, 'A new verification code has been sent to your email.', {
        userId: existing.id,
        email: existing.email,
        role: existing.role,
      }, 200);
    }
    return apiResponse.error(res, 'Email already registered.', 409);
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const newReferralCode = generateReferralCode();

  let referredById: string | undefined;
  if (referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode } });
    if (referrer) referredById = referrer.id;
  }

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name, email, password: hashed,
        role: role as Role,
        referralCode: newReferralCode,
        referredById,
        ...(phone?.trim() ? { phone: phone.trim() } : {}),
      },
    });

    if (role === 'CUSTOMER') {
      await tx.customer.create({ data: { userId: newUser.id } });
    }

    if (role === 'VENDOR') {
      const slug =
        businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
        '-' +
        newUser.id.slice(0, 6);
      await tx.vendor.create({
        data: {
          userId: newUser.id,
          businessName,
          slug,
          category: category as VendorCategory,
          address,
          city,
          ...(state?.trim() ? { state: state.trim() } : {}),
          commissionTier: commissionTier as CommissionTier,
          isPharmacyFlagged: category === 'PHARMACY',
        },
      });
    }

    if (role === 'RIDER') {
      await tx.rider.create({ data: { userId: newUser.id, vehicleType } });
    }

    if (referredById) {
      await tx.referral.create({ data: { referrerId: referredById, refereeId: newUser.id } });
    }

    return newUser;
  });

  await createAndDispatchOtp(user.id, user.email, user.name);

  return apiResponse.success(res, 'Registration successful. Check your email for a verification code.', {
    userId: user.id,
    email: user.email,
    role: user.role,
  }, 201);
});

export const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const { userId, otp } = req.body;

  const record = await prisma.emailOtp.findFirst({
    where: { userId, used: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return apiResponse.error(res, 'Invalid or expired code.', 400);
  if (record.code !== otp) return apiResponse.error(res, 'Incorrect code. Please try again.', 400);
  if (new Date() > record.expiresAt) return apiResponse.error(res, 'This code has expired. Please request a new one.', 400);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, vendor: { select: { businessName: true } } },
  });

  await prisma.$transaction([
    prisma.emailOtp.update({ where: { id: record.id }, data: { used: true } }),
    prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } }),
  ]);

  if (user) {
    void sendWelcomeEmail(user.email, user.name, user.role, user.vendor?.businessName ?? undefined);
  }

  return apiResponse.success(res, 'Email verified successfully.');
});

export const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  if (user.isEmailVerified) return apiResponse.error(res, 'Email is already verified.', 400);

  await createAndDispatchOtp(user.id, user.email, user.name);

  return apiResponse.success(res, 'A new verification code has been sent to your email.');
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) return apiResponse.error(res, 'No account found with this email address.', 404);
  if (!user.isActive) return apiResponse.error(res, 'Account suspended. Contact support.', 403);

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return apiResponse.error(res, 'Incorrect password. Please try again.', 401);

  const accessToken = generateAccessToken({ userId: user.id, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id, role: user.role });

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

  let approvalStatus: string | undefined;
  if (user.role === 'VENDOR') {
    const vendor = await prisma.vendor.findUnique({ where: { userId: user.id }, select: { approvalStatus: true } });
    approvalStatus = vendor?.approvalStatus;
  } else if (user.role === 'RIDER') {
    const rider = await prisma.rider.findUnique({ where: { userId: user.id }, select: { approvalStatus: true } });
    approvalStatus = rider?.approvalStatus;
  }

  return apiResponse.success(res, 'Login successful.', {
    user: { ...buildUserPayload(user), ...(approvalStatus !== undefined ? { approvalStatus } : {}) },
    accessToken,
    refreshToken,
  });
});

export const activationStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;

  if (role === 'VENDOR') {
    const vendor = await prisma.vendor.findUnique({ where: { userId }, select: { approvalStatus: true } });
    return apiResponse.success(res, 'Status fetched.', { approvalStatus: vendor?.approvalStatus ?? 'PENDING' });
  }

  if (role === 'RIDER') {
    const rider = await prisma.rider.findUnique({ where: { userId }, select: { approvalStatus: true } });
    return apiResponse.success(res, 'Status fetched.', { approvalStatus: rider?.approvalStatus ?? 'PENDING' });
  }

  return apiResponse.success(res, 'Status fetched.', { approvalStatus: 'APPROVED' });
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  let decoded: { userId: string; role: string };
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as {
      userId: string; role: string;
    };
  } catch {
    return apiResponse.error(res, 'Invalid refresh token.', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || user.refreshToken !== refreshToken) {
    return apiResponse.error(res, 'Refresh token revoked.', 401);
  }

  const newAccessToken = generateAccessToken({ userId: user.id, role: user.role });
  const newRefreshToken = generateRefreshToken({ userId: user.id, role: user.role });

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefreshToken } });

  return apiResponse.success(res, 'Token refreshed.', {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
});

export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  if (req.user?.userId) {
    await prisma.user.update({ where: { id: req.user.userId }, data: { refreshToken: null } });
  }
  return apiResponse.success(res, 'Logged out successfully.');
});

export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true, name: true, email: true, phone: true,
      role: true, avatar: true, isEmailVerified: true,
      mfaEnabled: true,
      referralCode: true, freeDeliveryCredits: true,
      createdAt: true,
    },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  return apiResponse.success(res, 'User fetched.', user);
});

export const updateProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, phone, photoUrl } = req.body as {
    name?: string; phone?: string; photoUrl?: string;
  };

  const data: Record<string, unknown> = {};
  if (name?.trim())    data.name   = name.trim();
  if (phone !== undefined) data.phone  = phone.trim() || null;
  if (photoUrl !== undefined) data.avatar = photoUrl || null;

  if (Object.keys(data).length === 0) {
    return apiResponse.error(res, 'No fields to update.', 400);
  }

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data,
    select: { id: true, name: true, email: true, phone: true, role: true, avatar: true },
  });

  return apiResponse.success(res, 'Profile updated.', user);
});

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return apiResponse.success(res, 'If that email exists, a reset link has been sent.');

  const resetToken = generateReferralCode() + Date.now().toString(36);
  const hashedToken = await bcrypt.hash(resetToken, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  void sendPasswordResetEmail(email, resetToken);
  return apiResponse.success(res, 'If that email exists, a reset link has been sent.');
});

export const changePassword = catchAsync(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, password: true },
  });
  if (!user || !user.password) return apiResponse.error(res, 'User not found.', 404);

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return apiResponse.error(res, 'Current password is incorrect.', 401);

  if (newPassword === currentPassword) {
    return apiResponse.error(res, 'New password must be different from your current password.', 400);
  }

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

  return apiResponse.success(res, 'Password changed successfully.');
});

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { token, password } = req.body;

  const users = await prisma.user.findMany({
    where: {
      passwordResetToken: { not: null },
      passwordResetExpiresAt: { gt: new Date() },
    },
    select: { id: true, passwordResetToken: true },
  });

  let targetUser: { id: string } | null = null;

  for (const u of users) {
    if (!u.passwordResetToken) continue;
    const match = await bcrypt.compare(token, u.passwordResetToken);
    if (match) { targetUser = u; break; }
  }

  if (!targetUser) return apiResponse.error(res, 'Invalid or expired reset token.', 400);

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: targetUser.id },
    data: { password: hashed, passwordResetToken: null, passwordResetExpiresAt: null },
  });

  return apiResponse.success(res, 'Password reset successfully.');
});
