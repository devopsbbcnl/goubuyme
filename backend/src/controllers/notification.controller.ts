import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';

export const registerPushToken = catchAsync(async (req: AuthRequest, res: Response) => {
  const { token } = req.body;
  if (!token) return apiResponse.error(res, 'Push token required.', 400);

  await prisma.user.update({ where: { id: req.user!.userId }, data: { pushToken: token } });
  return apiResponse.success(res, 'Push token registered.');
});

export const getNotifications = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '30' } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  const [notifications, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.notification.count({ where: { userId: req.user!.userId } }),
  ]);

  return apiResponse.paginated(res, 'Notifications fetched.', notifications, {
    page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum),
  });
});

export const markNotificationRead = catchAsync(async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: { isRead: true },
  });
  return apiResponse.success(res, 'Notification read.');
});

export const markAllRead = catchAsync(async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data: { isRead: true },
  });
  return apiResponse.success(res, 'All notifications marked as read.');
});
