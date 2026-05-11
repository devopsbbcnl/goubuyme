import { Request, Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { haversineDistance, estimateDeliveryMinutes } from '../services/distance.service';
import { ApprovalStatus, CommissionTier, LicenseType, OrderStatus, VerificationBadge } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

// ── Badge recomputation ───────────────────────────────────────────────────────
export async function updateVendorBadge(vendorId: string): Promise<void> {
  const [doc, biz, licenses] = await Promise.all([
    prisma.vendorDocument.findUnique({ where: { vendorId }, select: { status: true } }),
    prisma.vendorBusinessVerification.findUnique({ where: { vendorId }, select: { status: true } }),
    prisma.vendorLicense.findMany({ where: { vendorId, status: 'VERIFIED' }, select: { id: true }, take: 1 }),
  ]);

  let badge: VerificationBadge = VerificationBadge.UNVERIFIED;
  if (doc?.status === 'VERIFIED') badge = VerificationBadge.ID_VERIFIED;
  if (biz?.status === 'VERIFIED')  badge = VerificationBadge.BUSINESS_VERIFIED;
  if (licenses.length > 0)         badge = VerificationBadge.PREMIUM_VERIFIED;

  await prisma.vendor.update({ where: { id: vendorId }, data: { verificationBadge: badge } });
}

const DEFAULT_RADIUS = parseFloat(process.env.DEFAULT_VENDOR_RADIUS_KM || '10');

const vendorSelect = {
  id: true, businessName: true, slug: true, description: true,
  logo: true, coverImage: true, category: true, city: true, state: true,
  latitude: true, longitude: true, isOpen: true, rating: true,
  totalRatings: true, openingTime: true, closingTime: true,
  avgDeliveryTime: true, commissionTier: true, verificationBadge: true,
};

export const getVendors = catchAsync(async (req: Request, res: Response) => {
  const {
    lat, lng, radius, category, search,
    page = '1', limit = '20',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, parseInt(limit));
  const radiusKm = parseFloat(radius || String(DEFAULT_RADIUS));

  const where: Record<string, unknown> = { approvalStatus: ApprovalStatus.APPROVED };
  if (category && category !== 'ALL') where.category = category;
  if (search) where.businessName = { contains: search, mode: 'insensitive' };

  const vendors = await prisma.vendor.findMany({
    where,
    select: {
      ...vendorSelect,
      menuItems: { select: { price: true }, where: { isAvailable: true }, take: 1, orderBy: { price: 'asc' } },
    },
    orderBy: { rating: 'desc' },
  });

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);
  const hasLocation = !isNaN(userLat) && !isNaN(userLng);

  const enriched = vendors
    .map((v) => {
      const distanceKm =
        hasLocation && v.latitude && v.longitude
          ? haversineDistance(userLat, userLng, v.latitude, v.longitude)
          : null;
      return {
        ...v,
        latitude: undefined,
        longitude: undefined,
        distanceKm: distanceKm ? Math.round(distanceKm * 10) / 10 : null,
        estimatedMinutes: distanceKm ? estimateDeliveryMinutes(distanceKm) : null,
        minOrderPrice: v.menuItems[0]?.price ?? 0,
        menuItems: undefined,
      };
    })
    .filter((v) => !hasLocation || v.distanceKm === null || v.distanceKm <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  const total = enriched.length;
  const paginated = enriched.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  return apiResponse.paginated(res, 'Vendors fetched.', paginated, {
    page: pageNum, limit: limitNum, total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const getVendorById = catchAsync(async (req: Request, res: Response) => {
  const vendor = await prisma.vendor.findFirst({
    where: { id: req.params.id, approvalStatus: ApprovalStatus.APPROVED },
    select: vendorSelect,
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);
  return apiResponse.success(res, 'Vendor fetched.', vendor);
});

export const getVendorMenu = catchAsync(async (req: Request, res: Response) => {
  const vendor = await prisma.vendor.findFirst({
    where: { id: req.params.id, approvalStatus: ApprovalStatus.APPROVED },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const items = await prisma.menuItem.findMany({
    where: { vendorId: req.params.id, isAvailable: true },
    select: {
      id: true, name: true, description: true, price: true,
      image: true, category: true, isAvailable: true, isFeatured: true,
    },
    orderBy: [{ isFeatured: 'desc' }, { category: 'asc' }, { name: 'asc' }],
  });

  return apiResponse.success(res, 'Menu fetched.', items);
});

// ─── Protected vendor-only handlers ───────────────────────────────────────────

export const getMyVendorProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    include: {
      user: { select: { name: true, email: true, phone: true, avatar: true } },
      payoutAccount: { select: { bankName: true, accountNumber: true, accountName: true } },
    },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor profile not found.', 404);
  return apiResponse.success(res, 'Vendor profile fetched.', vendor);
});

export const updateMyVendorProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { businessName, description, logo, coverImage, address, city, state, openingTime, closingTime, avgDeliveryTime } = req.body;
  const vendor = await prisma.vendor.update({
    where: { userId: req.user!.userId },
    data: {
      ...(businessName      && { businessName }),
      ...(description       !== undefined && { description }),
      ...(logo              !== undefined && { logo }),
      ...(coverImage        !== undefined && { coverImage }),
      ...(address           && { address }),
      ...(city              && { city }),
      ...(state             && { state }),
      ...(openingTime       !== undefined && { openingTime }),
      ...(closingTime       !== undefined && { closingTime }),
      ...(avgDeliveryTime   !== undefined && { avgDeliveryTime: avgDeliveryTime !== null ? Number(avgDeliveryTime) : null }),
    },
    select: vendorSelect,
  });
  return apiResponse.success(res, 'Vendor profile updated.', vendor);
});

export const toggleStoreStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { isOpen: true },
  });
  if (!existing) return apiResponse.error(res, 'Vendor not found.', 404);
  const vendor = await prisma.vendor.update({
    where: { userId: req.user!.userId },
    data: { isOpen: !existing.isOpen },
    select: { id: true, isOpen: true },
  });
  return apiResponse.success(res, `Store is now ${vendor.isOpen ? 'open' : 'closed'}.`, vendor);
});

export const getVendorDashboardStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, rating: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayOrders, pendingOrders, todayRevenue] = await Promise.all([
    prisma.order.count({ where: { vendorId: vendor.id, createdAt: { gte: today, lt: tomorrow } } }),
    prisma.order.count({ where: { vendorId: vendor.id, status: OrderStatus.PENDING } }),
    prisma.order.aggregate({
      where: { vendorId: vendor.id, createdAt: { gte: today, lt: tomorrow }, paymentStatus: 'PAID' },
      _sum: { subtotal: true },
    }),
  ]);

  const weeklyOrders: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    weeklyOrders.push(
      await prisma.order.count({ where: { vendorId: vendor.id, createdAt: { gte: day, lt: nextDay } } }),
    );
  }

  return apiResponse.success(res, 'Stats fetched.', {
    todayOrders,
    pendingOrders,
    todayRevenue: todayRevenue._sum.subtotal ?? 0,
    rating: vendor.rating,
    weeklyOrders,
  });
});

export const getMyOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const { status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const where: Record<string, unknown> = { vendorId: vendor.id };
  if (!status || status === 'ACTIVE') {
    where.status = { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] };
  } else if (status !== 'ALL') {
    where.status = status;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { include: { user: { select: { name: true, phone: true } } } },
        items: { select: { name: true, quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.order.count({ where }),
  ]);

  const data = orders.map(o => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customer: o.customer.user.name,
    customerPhone: o.customer.user.phone,
    items: o.items.map(i => `${i.name} x${i.quantity}`),
    subtotal: o.subtotal,
    total: o.totalAmount,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    note: o.note,
    createdAt: o.createdAt,
  }));

  return apiResponse.paginated(res, 'Orders fetched.', data, {
    page: pageNum, limit: limitNum, total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const updateMyOrderStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const { orderId } = req.params;
  const { action, reason } = req.body as { action: string; reason?: string };

  const order = await prisma.order.findFirst({ where: { id: orderId, vendorId: vendor.id } });
  if (!order) return apiResponse.error(res, 'Order not found.', 404);

  const validFrom: Record<string, OrderStatus[]> = {
    accept: [OrderStatus.PENDING, OrderStatus.CONFIRMED],
    ready:  [OrderStatus.PREPARING],
    reject: [OrderStatus.PENDING, OrderStatus.CONFIRMED],
  };
  const transitionTo: Record<string, OrderStatus> = {
    accept: OrderStatus.PREPARING,
    ready:  OrderStatus.READY,
    reject: OrderStatus.CANCELLED,
  };

  if (!validFrom[action]) return apiResponse.error(res, 'Invalid action.', 400);
  if (!validFrom[action].includes(order.status as OrderStatus)) {
    return apiResponse.error(res, `Cannot ${action} order with status ${order.status}.`, 400);
  }

  const transition = { to: transitionTo[action] };

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: transition.to,
      ...(action === 'reject' && reason ? { cancelReason: reason } : {}),
    },
    select: { id: true, orderNumber: true, status: true },
  });

  return apiResponse.success(res, 'Order status updated.', updated);
});

export const getMyEarnings = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [thisMonth, pending, allTime] = await Promise.all([
    prisma.vendorPayout.aggregate({
      where: { vendorId: vendor.id, createdAt: { gte: monthStart } },
      _sum: { netAmount: true }, _count: true,
    }),
    prisma.vendorPayout.aggregate({
      where: { vendorId: vendor.id, payoutStatus: 'PENDING' },
      _sum: { netAmount: true },
    }),
    prisma.vendorPayout.aggregate({
      where: { vendorId: vendor.id },
      _sum: { netAmount: true }, _count: true,
    }),
  ]);

  return apiResponse.success(res, 'Earnings fetched.', {
    thisMonth:    { amount: thisMonth._sum.netAmount ?? 0, orders: thisMonth._count },
    pendingPayout: pending._sum.netAmount ?? 0,
    allTime:      { amount: allTime._sum.netAmount ?? 0, orders: allTime._count },
  });
});

// ─── Menu management ──────────────────────────────────────────────────────────

const menuItemSelect = {
  id: true, name: true, description: true, price: true,
  image: true, category: true, isAvailable: true, isFeatured: true,
};

const resolveVendorId = async (userId: string): Promise<string | null> => {
  const v = await prisma.vendor.findUnique({ where: { userId }, select: { id: true } });
  return v?.id ?? null;
};

export const getMyMenuItems = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendorId = await resolveVendorId(req.user!.userId);
  if (!vendorId) return apiResponse.error(res, 'Vendor not found.', 404);

  const items = await prisma.menuItem.findMany({
    where: { vendorId },
    select: menuItemSelect,
    orderBy: [{ isFeatured: 'desc' }, { category: 'asc' }, { name: 'asc' }],
  });
  return apiResponse.success(res, 'Menu items fetched.', items);
});

export const createMenuItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendorId = await resolveVendorId(req.user!.userId);
  if (!vendorId) return apiResponse.error(res, 'Vendor not found.', 404);

  const { name, description, price, image, category, isAvailable, isFeatured } = req.body as {
    name?: string; description?: string; price?: number; image?: string;
    category?: string; isAvailable?: boolean; isFeatured?: boolean;
  };

  if (!name?.trim())                    return apiResponse.error(res, 'Item name is required.', 400);
  if (price === undefined || price <= 0) return apiResponse.error(res, 'Valid price is required.', 400);

  const item = await prisma.menuItem.create({
    data: {
      vendorId,
      name:        name.trim(),
      description: description?.trim() || null,
      price:       Number(price),
      image:       image        || null,
      category:    category?.trim() || null,
      isAvailable: isAvailable  ?? true,
      isFeatured:  isFeatured   ?? false,
    },
    select: menuItemSelect,
  });
  return apiResponse.success(res, 'Menu item created.', item, 201);
});

export const updateMenuItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendorId = await resolveVendorId(req.user!.userId);
  if (!vendorId) return apiResponse.error(res, 'Vendor not found.', 404);

  const exists = await prisma.menuItem.findFirst({
    where: { id: req.params.itemId, vendorId },
    select: { id: true },
  });
  if (!exists) return apiResponse.error(res, 'Menu item not found.', 404);

  const { name, description, price, image, category, isAvailable, isFeatured } = req.body as {
    name?: string; description?: string | null; price?: number; image?: string | null;
    category?: string | null; isAvailable?: boolean; isFeatured?: boolean;
  };

  const item = await prisma.menuItem.update({
    where: { id: req.params.itemId },
    data: {
      ...(name?.trim()             !== undefined && { name: name!.trim() }),
      ...(description              !== undefined && { description: description?.trim() || null }),
      ...(price                    !== undefined && { price: Number(price) }),
      ...(image                    !== undefined && { image: image || null }),
      ...(category                 !== undefined && { category: category?.trim() || null }),
      ...(isAvailable              !== undefined && { isAvailable }),
      ...(isFeatured               !== undefined && { isFeatured }),
    },
    select: menuItemSelect,
  });
  return apiResponse.success(res, 'Menu item updated.', item);
});

export const deleteMenuItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendorId = await resolveVendorId(req.user!.userId);
  if (!vendorId) return apiResponse.error(res, 'Vendor not found.', 404);

  const exists = await prisma.menuItem.findFirst({
    where: { id: req.params.itemId, vendorId },
    select: { id: true },
  });
  if (!exists) return apiResponse.error(res, 'Menu item not found.', 404);

  const inOrders = await prisma.orderItem.count({ where: { menuItemId: req.params.itemId } });
  if (inOrders > 0) {
    return apiResponse.error(res, 'Item has existing orders. Mark it unavailable instead.', 409);
  }

  await prisma.menuItem.delete({ where: { id: req.params.itemId } });
  return apiResponse.success(res, 'Menu item deleted.');
});

// GET /vendors/me/payout-account
export const getPayoutAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, payoutAccount: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  if (!vendor.payoutAccount) {
    return apiResponse.success(res, 'No payout account registered.', null);
  }

  return apiResponse.success(res, 'Payout account fetched.', {
    id: vendor.payoutAccount.id,
    bankName: vendor.payoutAccount.bankName,
    accountNumber: `****${vendor.payoutAccount.accountNumber.slice(-4)}`,
    accountName: vendor.payoutAccount.accountName,
    isRegistered: !!vendor.payoutAccount.paystackRecipientCode,
  });
});

// PATCH /vendors/me/tier
const TIER_COOLDOWN_DAYS = 14;

export const switchMyTier = catchAsync(async (req: AuthRequest, res: Response) => {
  const { tier } = req.body;

  if (!Object.values(CommissionTier).includes(tier)) {
    return apiResponse.error(res, 'Invalid tier. Must be TIER_1 or TIER_2.', 400);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, commissionTier: true, tierChangedAt: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  if (vendor.commissionTier === tier) {
    return apiResponse.error(res, `You are already on ${tier}.`, 400);
  }

  if (vendor.tierChangedAt) {
    const daysSince = (Date.now() - vendor.tierChangedAt.getTime()) / 86_400_000;
    if (daysSince < TIER_COOLDOWN_DAYS) {
      const daysLeft = Math.ceil(TIER_COOLDOWN_DAYS - daysSince);
      return apiResponse.error(
        res,
        `Tier can only be changed every ${TIER_COOLDOWN_DAYS} days. ${daysLeft} day(s) remaining.`,
        400,
      );
    }
  }

  const previousTier = vendor.commissionTier;

  const updated = await prisma.vendor.update({
    where: { id: vendor.id },
    data: { commissionTier: tier as CommissionTier, tierChangedAt: new Date() },
    select: { id: true, commissionTier: true, tierChangedAt: true },
  });

  // Deactivate all promotions when downgrading to TIER_1
  if (tier === CommissionTier.TIER_1) {
    await prisma.vendorPromotion.updateMany({
      where: { vendorId: vendor.id, isActive: true },
      data: { isActive: false },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'VENDOR_TIER_SELF_SWITCH',
      entity: 'Vendor',
      entityId: vendor.id,
      meta: { from: previousTier, to: tier },
    },
  });

  return apiResponse.success(res, 'Commission tier updated.', updated);
});

// POST /vendors/me/payout-account
export const savePayoutAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { bankName, bankCode, accountNumber, accountName } = req.body;
  if (!bankName || !bankCode || !accountNumber || !accountName) {
    return apiResponse.error(res, 'bankName, bankCode, accountNumber and accountName are required.', 400);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, businessName: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const { createTransferRecipient } = await import('../services/paystack.service');
  const recipientCode = await createTransferRecipient(vendor.businessName, accountNumber, bankCode);

  const account = await prisma.payoutAccount.upsert({
    where: { vendorId: vendor.id },
    create: {
      vendorId: vendor.id,
      bankName,
      accountNumber,
      accountName,
      paystackRecipientCode: recipientCode,
    },
    update: {
      bankName,
      accountNumber,
      accountName,
      paystackRecipientCode: recipientCode,
    },
  });

  return apiResponse.success(res, 'Payout account saved.', {
    id: account.id,
    bankName: account.bankName,
    accountNumber: `****${account.accountNumber.slice(-4)}`,
    accountName: account.accountName,
    isRegistered: true,
  });
});

// ── Vendor Documents ──────────────────────────────────────────────────────────

const VALID_DOC_TYPES = ['NIN', 'DRIVERS_LICENSE', 'PASSPORT'] as const;

// GET /vendors/me/document
export const getMyDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const doc = await prisma.vendorDocument.findUnique({ where: { vendorId: vendor.id } });
  return apiResponse.success(res, 'OK', doc);
});

// POST /vendors/me/document
export const submitDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const { type, number, imageUrl, imageUrlBack, bvn, selfieUrl } = req.body;

  if (!VALID_DOC_TYPES.includes(type)) {
    return apiResponse.error(res, 'Invalid document type. Must be NIN, DRIVERS_LICENSE, or PASSPORT.', 400);
  }
  if (!number?.trim()) return apiResponse.error(res, 'Document number is required.', 400);
  if (!imageUrl?.trim()) return apiResponse.error(res, 'Document image URL is required.', 400);

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const doc = await prisma.vendorDocument.upsert({
    where: { vendorId: vendor.id },
    create: {
      vendorId: vendor.id,
      type,
      number: number.trim(),
      imageUrl,
      imageUrlBack: imageUrlBack || null,
      bvn: bvn?.trim() || null,
      selfieUrl: selfieUrl || null,
    },
    update: {
      type,
      number: number.trim(),
      imageUrl,
      imageUrlBack: imageUrlBack || null,
      bvn: bvn?.trim() || null,
      selfieUrl: selfieUrl || null,
      status: 'PENDING',
      reviewNote: null,
    },
  });

  return apiResponse.success(res, 'Document submitted for review.', {
    id: doc.id, type: doc.type, status: doc.status,
  });
});

// ── Vendor Promotions ─────────────────────────────────────────────────────────

// GET /vendors/me/promotions
export const getMyPromotions = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const promos = await prisma.vendorPromotion.findMany({
    where: { vendorId: vendor.id },
    orderBy: { createdAt: 'desc' },
  });
  return apiResponse.success(res, 'OK', promos);
});

// POST /vendors/me/promotions
export const createPromotion = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, commissionTier: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  if (vendor.commissionTier !== CommissionTier.TIER_2) {
    return apiResponse.error(res, 'Promotions require the Growth Plan (Tier 2).', 403);
  }

  const { title, imageUrl, code } = req.body;
  if (!title || !imageUrl) {
    return apiResponse.error(res, 'title and imageUrl are required.', 400);
  }

  const promo = await prisma.vendorPromotion.create({
    data: { vendorId: vendor.id, title, imageUrl, code: code || null, isActive: false },
  });
  return apiResponse.success(res, 'Promotion created.', promo, 201);
});

// PATCH /vendors/me/promotions/:id/toggle
export const togglePromotion = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, commissionTier: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  if (vendor.commissionTier !== CommissionTier.TIER_2) {
    return apiResponse.error(res, 'Promotions require the Growth Plan (Tier 2).', 403);
  }

  const promo = await prisma.vendorPromotion.findFirst({
    where: { id: req.params.id, vendorId: vendor.id },
  });
  if (!promo) return apiResponse.error(res, 'Promotion not found.', 404);

  // Activating: deactivate any currently active promo first (only one active at a time)
  if (!promo.isActive) {
    await prisma.vendorPromotion.updateMany({
      where: { vendorId: vendor.id, isActive: true },
      data: { isActive: false },
    });
  }

  const updated = await prisma.vendorPromotion.update({
    where: { id: promo.id },
    data: { isActive: !promo.isActive },
  });
  return apiResponse.success(res, 'Promotion updated.', updated);
});

// DELETE /vendors/me/promotions/:id
export const deletePromotion = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const promo = await prisma.vendorPromotion.findFirst({
    where: { id: req.params.id, vendorId: vendor.id },
  });
  if (!promo) return apiResponse.error(res, 'Promotion not found.', 404);

  await prisma.vendorPromotion.delete({ where: { id: promo.id } });
  return apiResponse.success(res, 'Promotion deleted.');
});

// ── Business Verification (Level 2) ──────────────────────────────────────────

// GET /vendors/me/business-verification
export const getMyBusinessVerification = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const biz = await prisma.vendorBusinessVerification.findUnique({ where: { vendorId: vendor.id } });
  return apiResponse.success(res, 'OK', biz);
});

// POST /vendors/me/business-verification
export const submitBusinessVerification = catchAsync(async (req: AuthRequest, res: Response) => {
  const { cacNumber, cacImageUrl, tin, directorNin } = req.body;

  if (!cacNumber?.trim() && !cacImageUrl?.trim()) {
    return apiResponse.error(res, 'At least cacNumber or cacImageUrl is required.', 400);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const biz = await prisma.vendorBusinessVerification.upsert({
    where: { vendorId: vendor.id },
    create: {
      vendorId: vendor.id,
      cacNumber: cacNumber?.trim() || null,
      cacImageUrl: cacImageUrl || null,
      tin: tin?.trim() || null,
      directorNin: directorNin?.trim() || null,
    },
    update: {
      cacNumber: cacNumber?.trim() || null,
      cacImageUrl: cacImageUrl || null,
      tin: tin?.trim() || null,
      directorNin: directorNin?.trim() || null,
      status: 'PENDING',
      reviewNote: null,
    },
  });

  return apiResponse.success(res, 'Business verification submitted for review.', {
    id: biz.id, status: biz.status,
  });
});

// ── Vendor Licenses (Level 3) ─────────────────────────────────────────────────

const VALID_LICENSE_TYPES = Object.values(LicenseType);

// GET /vendors/me/licenses
export const getMyLicenses = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const licenses = await prisma.vendorLicense.findMany({
    where: { vendorId: vendor.id },
    orderBy: { createdAt: 'desc' },
  });
  return apiResponse.success(res, 'OK', licenses);
});

// POST /vendors/me/licenses
export const submitLicense = catchAsync(async (req: AuthRequest, res: Response) => {
  const { type, licenseNumber, imageUrl, expiresAt } = req.body;

  if (!VALID_LICENSE_TYPES.includes(type)) {
    return apiResponse.error(res, `Invalid license type. Must be one of: ${VALID_LICENSE_TYPES.join(', ')}.`, 400);
  }
  if (!licenseNumber?.trim()) return apiResponse.error(res, 'License number is required.', 400);
  if (!imageUrl?.trim()) return apiResponse.error(res, 'License image URL is required.', 400);

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const license = await prisma.vendorLicense.create({
    data: {
      vendorId: vendor.id,
      type,
      licenseNumber: licenseNumber.trim(),
      imageUrl,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return apiResponse.success(res, 'License submitted for review.', {
    id: license.id, type: license.type, status: license.status,
  }, 201);
});

// DELETE /vendors/me/licenses/:id
export const deleteLicense = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const license = await prisma.vendorLicense.findFirst({
    where: { id: req.params.id, vendorId: vendor.id },
  });
  if (!license) return apiResponse.error(res, 'License not found.', 404);

  await prisma.vendorLicense.delete({ where: { id: license.id } });
  await updateVendorBadge(vendor.id);

  return apiResponse.success(res, 'License deleted.');
});

// GET /vendors/active-promotions  (public — feeds the customer homescreen carousel)
export const getActiveVendorPromotions = catchAsync(async (req: Request, res: Response) => {
  const promos = await prisma.vendorPromotion.findMany({
    where: { isActive: true },
    select: {
      id: true, title: true, imageUrl: true, code: true,
      vendor: { select: { businessName: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  return apiResponse.success(res, 'OK', promos);
});
