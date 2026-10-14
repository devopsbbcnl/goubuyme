import { Request, Response } from 'express';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import { verifyUnsubscribeToken } from '../../services/crm/unsubscribe.service';
import { invalidateAnalyticsOptIn } from '../../services/analytics.service';
import { NOTIFICATION_CATEGORIES, mergePrefs, resolvePrefs, NotificationCategory } from '../../services/notificationPrefs';

const preferenceSelect = { marketingOptIn: true, analyticsOptIn: true, notificationPrefs: true } as const;

// What the app sees: the two opt-ins plus every category resolved to on/off.
const present = (u: { marketingOptIn: boolean; analyticsOptIn: boolean; notificationPrefs: unknown }) => ({
  marketingOptIn: u.marketingOptIn,
  analyticsOptIn: u.analyticsOptIn,
  categories: resolvePrefs(u.notificationPrefs),
});

// GET /notifications/preferences
export const getMarketingPreferences = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: preferenceSelect });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  return apiResponse.success(res, 'Preferences fetched.', present(user));
});

// PATCH /notifications/preferences  { marketingOptIn?, analyticsOptIn?, categories?: { orders?, earnings?, account? } }
export const updateMarketingPreferences = catchAsync(async (req: AuthRequest, res: Response) => {
  const { marketingOptIn, analyticsOptIn, categories } = req.body ?? {};
  const data: { marketingOptIn?: boolean; analyticsOptIn?: boolean; notificationPrefs?: Record<string, boolean> } = {};
  if (marketingOptIn !== undefined) {
    if (typeof marketingOptIn !== 'boolean') return apiResponse.error(res, 'marketingOptIn must be true or false.', 400);
    data.marketingOptIn = marketingOptIn;
  }
  if (analyticsOptIn !== undefined) {
    if (typeof analyticsOptIn !== 'boolean') return apiResponse.error(res, 'analyticsOptIn must be true or false.', 400);
    data.analyticsOptIn = analyticsOptIn;
  }
  if (categories !== undefined) {
    if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
      return apiResponse.error(res, 'categories must be an object.', 400);
    }
    const changes: Partial<Record<NotificationCategory, boolean>> = {};
    for (const [key, value] of Object.entries(categories)) {
      if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(key)) return apiResponse.error(res, `Unknown category: ${key}.`, 400);
      if (typeof value !== 'boolean') return apiResponse.error(res, `${key} must be true or false.`, 400);
      changes[key as NotificationCategory] = value;
    }
    const current = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { notificationPrefs: true } });
    data.notificationPrefs = mergePrefs(current?.notificationPrefs, changes);
  }
  if (Object.keys(data).length === 0) return apiResponse.error(res, 'Nothing to update.', 400);

  const user = await prisma.user.update({ where: { id: req.user!.userId }, data, select: preferenceSelect });
  if (analyticsOptIn !== undefined) invalidateAnalyticsOptIn(req.user!.userId);
  return apiResponse.success(res, 'Preferences saved.', present(user));
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
