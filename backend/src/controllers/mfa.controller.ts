import { Response } from 'express';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { encryptSecret, decryptSecret } from '../utils/crypto';

const APP_NAME = 'GoBuyMe';

// POST /auth/mfa/setup
export const setupMfa = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, mfaEnabled: true },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  if (user.mfaEnabled) return apiResponse.error(res, 'MFA is already enabled.', 400);

  const secret = generateSecret();
  const otpAuthUrl = generateURI({ issuer: APP_NAME, label: user.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: encryptSecret(secret) },
  });

  return apiResponse.success(res, 'MFA setup initiated.', {
    qrCode: qrCodeDataUrl,
    manualKey: secret,
  });
});

// POST /auth/mfa/verify-setup
export const verifyMfaSetup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { token } = req.body as { token: string };

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, mfaSecret: true, mfaEnabled: true },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  if (user.mfaEnabled) return apiResponse.error(res, 'MFA is already enabled.', 400);
  if (!user.mfaSecret) return apiResponse.error(res, 'MFA setup not initiated. Call /mfa/setup first.', 400);

  const secret = decryptSecret(user.mfaSecret);
  const result = verifySync({ token, secret });
  if (!result.valid) return apiResponse.error(res, 'Invalid code. Please try again.', 400);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  });

  return apiResponse.success(res, 'MFA enabled successfully.');
});

// DELETE /auth/mfa/disable
export const disableMfa = catchAsync(async (req: AuthRequest, res: Response) => {
  const { token } = req.body as { token: string };

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, mfaSecret: true, mfaEnabled: true },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  if (!user.mfaEnabled) return apiResponse.error(res, 'MFA is not enabled.', 400);
  if (!user.mfaSecret) return apiResponse.error(res, 'MFA secret not found.', 400);

  const secret = decryptSecret(user.mfaSecret);
  const result = verifySync({ token, secret });
  if (!result.valid) return apiResponse.error(res, 'Invalid code. Please try again.', 400);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null },
  });

  return apiResponse.success(res, 'MFA disabled successfully.');
});

// GET /auth/mfa/status
export const getMfaStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { mfaEnabled: true },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);

  return apiResponse.success(res, 'MFA status fetched.', { mfaEnabled: user.mfaEnabled });
});
