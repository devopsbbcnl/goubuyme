import { Request, Response } from 'express';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import { verifyUnsubscribeToken } from '../../services/crm/unsubscribe.service';

// GET /notifications/preferences
export const getMarketingPreferences = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { marketingOptIn: true } });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  return apiResponse.success(res, 'Preferences fetched.', user);
});

// PATCH /notifications/preferences  { marketingOptIn: boolean }
export const updateMarketingPreferences = catchAsync(async (req: AuthRequest, res: Response) => {
  if (typeof req.body?.marketingOptIn !== 'boolean') return apiResponse.error(res, 'marketingOptIn must be true or false.', 400);
  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: { marketingOptIn: req.body.marketingOptIn },
    select: { marketingOptIn: true },
  });
  return apiResponse.success(res, 'Preferences saved.', user);
});

// POST /marketing/unsubscribe  { token, subscribe?: boolean }  — public, from the email footer link
export const unsubscribeByToken = catchAsync(async (req: Request, res: Response) => {
  const userId = typeof req.body?.token === 'string' ? verifyUnsubscribeToken(req.body.token) : null;
  if (!userId) return apiResponse.error(res, 'This link is invalid.', 400);

  const subscribe = req.body?.subscribe === true;
  const updated = await prisma.user.updateMany({ where: { id: userId, deletedAt: null }, data: { marketingOptIn: subscribe } });
  if (updated.count === 0) return apiResponse.error(res, 'This link is invalid.', 400);
  return apiResponse.success(res, subscribe ? 'You\'re subscribed again.' : 'You\'ve been unsubscribed from promotions.', { marketingOptIn: subscribe });
});
