import { Response, NextFunction, RequestHandler } from 'express';
import { verifySync } from 'otplib';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { AuthRequest } from './auth.middleware';
import { decryptSecret } from '../utils/crypto';

export const requireMfa: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthRequest;
  if (!authReq.user?.userId) {
    apiResponse.error(res, 'Unauthorized.', 401);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: authReq.user.userId },
    select: { mfaEnabled: true, mfaSecret: true },
  });

  if (!user) {
    apiResponse.error(res, 'User not found.', 404);
    return;
  }

  if (!user.mfaEnabled) {
    next();
    return;
  }

  const code = req.headers['x-mfa-code'] as string | undefined;
  if (!code) {
    apiResponse.error(res, 'MFA code required. Open your authenticator app and enter the 6-digit code.', 403);
    return;
  }

  const secret = decryptSecret(user.mfaSecret!);
  const result = verifySync({ token: code, secret });
  if (!result.valid) {
    apiResponse.error(res, 'Invalid MFA code. Please try again with a fresh code.', 403);
    return;
  }

  next();
};
