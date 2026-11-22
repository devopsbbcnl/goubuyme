import { Request, Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { verifyUploads } from '../services/uploadVerification.service';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { isReviewer, reviewVendorIds } from '../services/reviewAccess';

const formatDiscount = (discount: number, isPercent: boolean): string => {
  if (discount === 0 && !isPercent) return 'Free Delivery';
  if (isPercent) return `${discount}% OFF`;
  return `₦${discount.toLocaleString()} OFF`;
};

const deriveType = (discount: number, isPercent: boolean): 'percent' | 'flat' | 'free_delivery' => {
  if (discount === 0 && !isPercent) return 'free_delivery';
  if (isPercent) return 'percent';
  return 'flat';
};

// GET /api/v1/offers
export const getOffers = catchAsync(async (req: Request, res: Response) => {
  const now = new Date();
  // Offers tied to a review-only vendor are only shown to the reviewer accounts.
  const hiddenVendorIds = (await isReviewer((req as AuthRequest).user?.userId)) ? [] : await reviewVendorIds();
  const offers = await prisma.offer.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(hiddenVendorIds.length ? { AND: [{ OR: [{ vendorId: null }, { vendorId: { notIn: hiddenVendorIds } }] }] } : {}),
    },
    select: {
      id: true, title: true, description: true, code: true,
      discount: true, isPercent: true, expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const data = offers.map(o => ({
    id: o.id,
    code: o.code ?? '',
    title: o.title,
    description: o.description ?? '',
    discount: formatDiscount(o.discount, o.isPercent),
    expiry: o.expiresAt
      ? o.expiresAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'No expiry',
    used: false,
    type: deriveType(o.discount, o.isPercent),
  }));

  return apiResponse.success(res, 'Offers fetched.', data);
});

// POST /api/v1/admin/offers
export const createOffer = catchAsync(async (req: AuthRequest, res: Response) => {
  const { title, description, imageUrl, code, discount, isPercent, minOrder, vendorId, expiresAt } = req.body;
  { const bad = await verifyUploads([imageUrl]); if (bad) return apiResponse.error(res, bad, 400); }

  const offer = await prisma.offer.create({
    data: {
      title,
      description,
      imageUrl,
      code: code ? (code as string).toUpperCase() : undefined,
      discount: parseFloat(discount),
      isPercent: isPercent ?? true,
      minOrder: minOrder != null ? parseFloat(minOrder) : 0,
      vendorId: vendorId ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return apiResponse.success(res, 'Offer created.', offer, 201);
});

// PATCH /api/v1/admin/offers/:id
export const updateOffer = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { title, description, imageUrl, code, discount, isPercent, minOrder, vendorId, expiresAt, isActive } = req.body;
  { const bad = await verifyUploads([imageUrl]); if (bad) return apiResponse.error(res, bad, 400); }

  const offer = await prisma.offer.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(code !== undefined && { code: (code as string).toUpperCase() }),
      ...(discount !== undefined && { discount: parseFloat(discount) }),
      ...(isPercent !== undefined && { isPercent }),
      ...(minOrder !== undefined && { minOrder: parseFloat(minOrder) }),
      ...(vendorId !== undefined && { vendorId }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return apiResponse.success(res, 'Offer updated.', offer);
});
