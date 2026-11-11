import { Request, Response } from 'express';
import { Prisma, PromotionStatus } from '@prisma/client';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { notifyUser } from '../services/notification.service';

const STATUSES = Object.values(PromotionStatus) as string[];

// GET /admin/promotions?status=PENDING|APPROVED|REJECTED|ALL&search=&live=true&page=&limit=
export const listAdminPromotions = catchAsync(async (req: Request, res: Response) => {
  const { status = 'PENDING', search, live, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

  const where: Prisma.VendorPromotionWhereInput = {};
  if (status !== 'ALL') {
    if (!STATUSES.includes(status)) return apiResponse.error(res, 'Invalid status.', 400);
    where.approvalStatus = status as PromotionStatus;
  }
  if (live === 'true') where.isActive = true;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { vendor: { businessName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [rows, total, grouped, liveCount] = await Promise.all([
    prisma.vendorPromotion.findMany({
      where,
      select: {
        id: true, title: true, imageUrl: true, imagePosition: true, code: true, isActive: true,
        approvalStatus: true, reviewedAt: true, rejectionReason: true, createdAt: true, updatedAt: true,
        vendor: { select: { id: true, businessName: true, city: true, state: true, category: true, commissionTier: true, approvalStatus: true } },
      },
      // Oldest first for the review queue so nothing waits forever; newest first otherwise.
      orderBy: { updatedAt: status === 'PENDING' ? 'asc' : 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.vendorPromotion.count({ where }),
    prisma.vendorPromotion.groupBy({ by: ['approvalStatus'], _count: { _all: true } }),
    prisma.vendorPromotion.count({ where: { isActive: true, approvalStatus: PromotionStatus.APPROVED } }),
  ]);

  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0, live: liveCount };
  for (const g of grouped) counts[g.approvalStatus] = g._count._all;

  return res.status(200).json({
    status: 'success',
    message: 'OK',
    data: rows,
    counts,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) },
  });
});

// PATCH /admin/promotions/:id/approve
export const approvePromotion = catchAsync(async (req: AuthRequest, res: Response) => {
  const promo = await prisma.vendorPromotion.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, approvalStatus: true, vendor: { select: { id: true, userId: true, businessName: true } } },
  });
  if (!promo) return apiResponse.error(res, 'Promotion not found.', 404);
  if (promo.approvalStatus === PromotionStatus.APPROVED) return apiResponse.error(res, 'Already approved.', 409);

  const updated = await prisma.vendorPromotion.update({
    where: { id: promo.id },
    data: { approvalStatus: PromotionStatus.APPROVED, reviewedById: req.user!.userId, reviewedAt: new Date(), rejectionReason: null },
  });
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId, action: 'PROMOTION_APPROVED', entity: 'VendorPromotion', entityId: promo.id,
      meta: { title: promo.title, vendorId: promo.vendor.id, vendor: promo.vendor.businessName, from: promo.approvalStatus },
    },
  });
  notifyUser(promo.vendor.userId, {
    title: 'Promotion approved 🎉',
    body: `"${promo.title}" was approved. Open Promotions and set it live to show it to customers.`,
    type: 'account',
    data: { promotionId: promo.id, status: 'APPROVED' },
  }).catch(() => {});
  return apiResponse.success(res, 'Promotion approved.', updated);
});

// PATCH /admin/promotions/:id/reject  { reason }
// Also works on an approved card: it takes a live card down and asks the vendor to fix it.
export const rejectPromotion = catchAsync(async (req: AuthRequest, res: Response) => {
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 5) return apiResponse.error(res, 'Give the vendor a reason (at least 5 characters).', 400);
  if (reason.length > 500) return apiResponse.error(res, 'Reason is too long (max 500 characters).', 400);

  const promo = await prisma.vendorPromotion.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, approvalStatus: true, isActive: true, vendor: { select: { id: true, userId: true, businessName: true } } },
  });
  if (!promo) return apiResponse.error(res, 'Promotion not found.', 404);
  if (promo.approvalStatus === PromotionStatus.REJECTED) return apiResponse.error(res, 'Already rejected.', 409);

  const updated = await prisma.vendorPromotion.update({
    where: { id: promo.id },
    data: { approvalStatus: PromotionStatus.REJECTED, isActive: false, reviewedById: req.user!.userId, reviewedAt: new Date(), rejectionReason: reason },
  });
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId, action: 'PROMOTION_REJECTED', entity: 'VendorPromotion', entityId: promo.id,
      meta: { title: promo.title, vendorId: promo.vendor.id, vendor: promo.vendor.businessName, from: promo.approvalStatus, wasLive: promo.isActive, reason },
    },
  });
  notifyUser(promo.vendor.userId, {
    title: 'Promotion needs changes',
    body: `"${promo.title}" was not approved: ${reason} Edit it and resubmit.`,
    type: 'account',
    data: { promotionId: promo.id, status: 'REJECTED' },
  }).catch(() => {});
  return apiResponse.success(res, 'Promotion rejected.', updated);
});
