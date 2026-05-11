import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { haversineDistance, estimateDeliveryMinutes } from '../services/distance.service';
import { calcRiderEarning } from '../services/payout.service';
import { OrderStatus } from '@prisma/client';
import { getIO } from '../config/socket';
import { notifyUser } from '../services/notification.service';

const resolveRider = async (userId: string) =>
  prisma.rider.findUnique({ where: { userId }, select: { id: true } });

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor(diffMs / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1)  return `${h}h ago`;
  if (m >= 1)  return `${m}m ago`;
  return 'Just now';
}

// GET /riders/me
export const getMyRiderProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await prisma.rider.findUnique({
    where: { userId: req.user!.userId },
    include: {
      user: { select: { name: true, email: true, phone: true, avatar: true } },
      payoutAccount: { select: { bankName: true, accountNumber: true, accountName: true } },
    },
  });
  if (!rider) return apiResponse.error(res, 'Rider profile not found.', 404);
  return apiResponse.success(res, 'Rider profile fetched.', rider);
});

// PATCH /riders/me/online  — toggle isOnline + isAvailable
export const toggleOnlineStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.rider.findUnique({
    where: { userId: req.user!.userId },
    select: { isOnline: true },
  });
  if (!existing) return apiResponse.error(res, 'Rider not found.', 404);

  const rider = await prisma.rider.update({
    where: { userId: req.user!.userId },
    data: { isOnline: !existing.isOnline, isAvailable: !existing.isOnline },
    select: { id: true, isOnline: true, isAvailable: true },
  });
  return apiResponse.success(res, `Rider is now ${rider.isOnline ? 'online' : 'offline'}.`, rider);
});

// GET /riders/me/stats
export const getRiderDashboardStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await prisma.rider.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, rating: true, isOnline: true },
  });
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayDeliveries, todayEarningsAgg, nearbyJobs] = await Promise.all([
    prisma.order.count({
      where: { riderId: rider.id, status: OrderStatus.DELIVERED, updatedAt: { gte: today, lt: tomorrow } },
    }),
    prisma.earning.aggregate({
      where: { riderId: rider.id, createdAt: { gte: today, lt: tomorrow } },
      _sum: { netAmount: true },
    }),
    prisma.order.count({ where: { status: OrderStatus.READY, riderId: null } }),
  ]);

  // Weekly earnings — last 7 days oldest first
  const weeklyEarnings: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const agg = await prisma.earning.aggregate({
      where: { riderId: rider.id, createdAt: { gte: day, lt: nextDay } },
      _sum: { netAmount: true },
    });
    weeklyEarnings.push(agg._sum.netAmount ?? 0);
  }

  return apiResponse.success(res, 'Stats fetched.', {
    todayDeliveries,
    todayEarnings: todayEarningsAgg._sum.netAmount ?? 0,
    rating: rider.rating,
    isOnline: rider.isOnline,
    nearbyJobs,
    weeklyEarnings,
  });
});

// GET /riders/me/available-jobs  — READY orders with no rider assigned
export const getAvailableJobs = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await prisma.rider.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, isOnline: true, latitude: true, longitude: true },
  });
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);
  if (!rider.isOnline) return apiResponse.success(res, 'Rider is offline.', []);

  const orders = await prisma.order.findMany({
    where: { status: OrderStatus.READY, riderId: null },
    include: {
      vendor: { select: { businessName: true, coverImage: true, latitude: true, longitude: true } },
      customer: { include: { user: { select: { name: true } } } },
      items: { select: { name: true, quantity: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const data = orders.map(o => {
    const distanceKm =
      rider.latitude != null && rider.longitude != null &&
      o.vendor.latitude != null && o.vendor.longitude != null
        ? Math.round(haversineDistance(rider.latitude!, rider.longitude!, o.vendor.latitude!, o.vendor.longitude!) * 10) / 10
        : null;

    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      vendor: o.vendor.businessName,
      vendorImg: o.vendor.coverImage,
      vendorLat: o.vendor.latitude,
      vendorLng: o.vendor.longitude,
      customer: o.customer.user.name,
      customerAddress: o.deliveryAddress,
      customerLat: o.deliveryLatitude,
      customerLng: o.deliveryLongitude,
      itemCount: o.items.length,
      fee: o.deliveryFee,
      distanceKm,
      eta: distanceKm != null ? `${estimateDeliveryMinutes(distanceKm)} min` : null,
    };
  });

  return apiResponse.success(res, 'Available jobs fetched.', data);
});

// POST /riders/me/accept/:orderId
export const acceptJob = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await resolveRider(req.user!.userId);
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const { orderId } = req.params;

  // Ensure no active delivery already
  const active = await prisma.order.findFirst({
    where: { riderId: rider.id, status: { in: [OrderStatus.READY, OrderStatus.PICKED_UP] } },
    select: { id: true },
  });
  if (active) return apiResponse.error(res, 'You already have an active delivery.', 400);

  const order = await prisma.order.findFirst({
    where: { id: orderId, status: OrderStatus.READY, riderId: null },
    include: {
      vendor: { select: { businessName: true, latitude: true, longitude: true } },
      customer: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!order) return apiResponse.error(res, 'Job no longer available.', 404);

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { riderId: rider.id },
    }),
    prisma.rider.update({
      where: { id: rider.id },
      data: { isAvailable: false },
    }),
  ]);

  notifyUser(order.customer.user.id, {
    title: 'Rider assigned! 🏍️',
    body: `A rider has accepted your order ${order.orderNumber} and is heading to pick it up.`,
    type: 'order',
    data: { orderId: order.id },
  }).catch(() => {});

  try {
    getIO().of('/orders').to(`order:${orderId}`).emit('order:status', { orderId, status: 'ASSIGNED' });
  } catch { /* socket may not be connected */ }

  return apiResponse.success(res, 'Job accepted.', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer.user.name,
    customerAddress: order.deliveryAddress,
    customerLat: order.deliveryLatitude,
    customerLng: order.deliveryLongitude,
    vendorName: order.vendor.businessName,
    vendorLat: order.vendor.latitude,
    vendorLng: order.vendor.longitude,
    fee: order.deliveryFee,
  });
});

// GET /riders/me/active  — current in-progress delivery
export const getActiveDelivery = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await resolveRider(req.user!.userId);
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const order = await prisma.order.findFirst({
    where: { riderId: rider.id, status: { in: [OrderStatus.READY, OrderStatus.PICKED_UP] } },
    select: {
      id: true, orderNumber: true, status: true, deliveryFee: true,
      deliveryAddress: true, deliveryLatitude: true, deliveryLongitude: true,
      vendor: { select: { businessName: true, latitude: true, longitude: true } },
      customer: { include: { user: { select: { name: true } } } },
    },
  });

  if (!order) return apiResponse.success(res, 'No active delivery.', null);

  return apiResponse.success(res, 'Active delivery fetched.', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    fee: order.deliveryFee,
    customerName: order.customer.user.name,
    customerAddress: order.deliveryAddress,
    customerLat: order.deliveryLatitude,
    customerLng: order.deliveryLongitude,
    vendorName: order.vendor.businessName,
    vendorLat: order.vendor.latitude,
    vendorLng: order.vendor.longitude,
  });
});

// PATCH /riders/me/orders/:orderId/status  — READY→PICKED_UP, PICKED_UP→DELIVERED
export const updateDeliveryStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await resolveRider(req.user!.userId);
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const { orderId } = req.params;
  const { status: requestedStatus } = req.body as { status: 'PICKED_UP' | 'DELIVERED' };

  const validFrom: Partial<Record<string, OrderStatus>> = {
    PICKED_UP: OrderStatus.READY,
    DELIVERED: OrderStatus.PICKED_UP,
  };

  if (!validFrom[requestedStatus]) return apiResponse.error(res, 'Invalid status.', 400);

  const order = await prisma.order.findFirst({
    where: { id: orderId, riderId: rider.id },
    include: {
      customer: { include: { user: { select: { id: true } } } },
      vendor: { select: { commissionTier: true } },
    },
  });
  if (!order) return apiResponse.error(res, 'Order not found.', 404);
  if (order.status !== validFrom[requestedStatus]) {
    return apiResponse.error(res, `Cannot transition from ${order.status} to ${requestedStatus}.`, 400);
  }

  const targetStatus = OrderStatus[requestedStatus as keyof typeof OrderStatus];
  await prisma.order.update({ where: { id: orderId }, data: { status: targetStatus } });

  if (requestedStatus === 'DELIVERED') {
    const { grossAmount, platformCut, netAmount } = calcRiderEarning(order.deliveryFee);
    await Promise.all([
      prisma.earning.create({
        data: { riderId: rider.id, orderId, grossAmount, platformCut, netAmount },
      }),
      prisma.vendorPayout.create({
        data: {
          vendorId: order.vendorId,
          orderId,
          subtotal: order.subtotal,
          platformFee: order.platformFee,
          netAmount: order.subtotal - order.platformFee,
          commissionTier: order.vendor.commissionTier,
        },
      }),
      prisma.rider.update({ where: { id: rider.id }, data: { isAvailable: true } }),
    ]);

    notifyUser(order.customer.user.id, {
      title: 'Order Delivered! 🎉',
      body: `Your order ${order.orderNumber} has been delivered. Enjoy your meal!`,
      type: 'order',
      data: { orderId: order.id },
    }).catch(() => {});
  }

  try {
    getIO().of('/orders').to(`order:${orderId}`).emit('order:status', { orderId, status: requestedStatus });
  } catch { /* socket may not be connected */ }

  return apiResponse.success(res, 'Status updated.', { orderId, status: requestedStatus });
});

// GET /riders/me/deliveries  — recent completed deliveries
export const getRecentDeliveries = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await resolveRider(req.user!.userId);
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const { limit = '10' } = req.query as Record<string, string>;
  const take = Math.min(50, parseInt(limit));

  const orders = await prisma.order.findMany({
    where: { riderId: rider.id, status: OrderStatus.DELIVERED },
    select: {
      id: true, orderNumber: true, deliveryFee: true, updatedAt: true, rating: true,
      vendor: { select: { businessName: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });

  const orderIds = orders.map(o => o.id);
  const earnings = await prisma.earning.findMany({
    where: { orderId: { in: orderIds } },
    select: { orderId: true, netAmount: true },
  });
  const earningMap = new Map(earnings.map(e => [e.orderId, e.netAmount]));

  const data = orders.map(o => ({
    id: o.orderNumber,
    vendor: o.vendor.businessName,
    amount: earningMap.get(o.id) ?? o.deliveryFee,
    time: formatTimeAgo(o.updatedAt),
    rating: o.rating ?? 0,
  }));

  return apiResponse.success(res, 'Recent deliveries fetched.', data);
});

// GET /riders/me/earnings
export const getRiderEarnings = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await resolveRider(req.user!.userId);
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [thisMonth, pending, allTime] = await Promise.all([
    prisma.earning.aggregate({
      where: { riderId: rider.id, createdAt: { gte: monthStart } },
      _sum: { netAmount: true }, _count: true,
    }),
    prisma.earning.aggregate({
      where: { riderId: rider.id, payoutStatus: 'PENDING' },
      _sum: { netAmount: true },
    }),
    prisma.earning.aggregate({
      where: { riderId: rider.id },
      _sum: { netAmount: true }, _count: true,
    }),
  ]);

  return apiResponse.success(res, 'Earnings fetched.', {
    thisMonth:     { amount: thisMonth._sum.netAmount ?? 0, deliveries: thisMonth._count },
    pendingPayout: pending._sum.netAmount ?? 0,
    allTime:       { amount: allTime._sum.netAmount ?? 0, deliveries: allTime._count },
  });
});

// PATCH /riders/me/location
export const updateLocation = catchAsync(async (req: AuthRequest, res: Response) => {
  const { latitude, longitude } = req.body;
  if (latitude == null || longitude == null) {
    return apiResponse.error(res, 'latitude and longitude are required.', 400);
  }

  const rider = await resolveRider(req.user!.userId);
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  await prisma.rider.update({
    where: { id: rider.id },
    data: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
  });

  try {
    getIO().of('/riders').to(`rider:${rider.id}`).emit('rider:location', {
      riderId: rider.id, lat: latitude, lng: longitude,
    });
  } catch { /* socket may not be connected */ }

  return apiResponse.success(res, 'Location updated.');
});

// GET /riders/me/payout-account
export const getPayoutAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await prisma.rider.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, payoutAccount: true },
  });
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  if (!rider.payoutAccount) {
    return apiResponse.success(res, 'No payout account registered.', null);
  }

  return apiResponse.success(res, 'Payout account fetched.', {
    id: rider.payoutAccount.id,
    bankName: rider.payoutAccount.bankName,
    accountNumber: `****${rider.payoutAccount.accountNumber.slice(-4)}`,
    accountName: rider.payoutAccount.accountName,
    isRegistered: !!rider.payoutAccount.paystackRecipientCode,
  });
});

// POST /riders/me/payout-account
export const savePayoutAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { bankName, bankCode, accountNumber, accountName } = req.body;
  if (!bankName || !bankCode || !accountNumber || !accountName) {
    return apiResponse.error(res, 'bankName, bankCode, accountNumber and accountName are required.', 400);
  }

  const rider = await prisma.rider.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true, user: { select: { name: true } } },
  });
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const { createTransferRecipient } = await import('../services/paystack.service');
  const recipientCode = await createTransferRecipient(rider.user.name, accountNumber, bankCode);

  const account = await prisma.payoutAccount.upsert({
    where: { riderId: rider.id },
    create: {
      riderId: rider.id,
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

// ── Rider Documents ───────────────────────────────────────────────────────────

// GET /riders/me/document
export const getMyRiderDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const rider = await resolveRider(req.user!.userId);
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const doc = await prisma.riderDocument.findUnique({ where: { riderId: rider.id } });
  return apiResponse.success(res, 'OK', doc);
});

// POST /riders/me/document
export const submitRiderDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    ninNumber, ninImageUrl, selfieUrl,
    vehicleImageUrl, guarantorName, guarantorPhone, guarantorAddress,
  } = req.body;

  if (!ninNumber?.trim()) return apiResponse.error(res, 'NIN number is required.', 400);

  const rider = await resolveRider(req.user!.userId);
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const doc = await prisma.riderDocument.upsert({
    where: { riderId: rider.id },
    create: {
      riderId: rider.id,
      ninNumber: ninNumber.trim(),
      ninImageUrl: ninImageUrl || null,
      selfieUrl: selfieUrl || null,
      vehicleImageUrl: vehicleImageUrl || null,
      guarantorName: guarantorName?.trim() || null,
      guarantorPhone: guarantorPhone?.trim() || null,
      guarantorAddress: guarantorAddress?.trim() || null,
    },
    update: {
      ninNumber: ninNumber.trim(),
      ninImageUrl: ninImageUrl || null,
      selfieUrl: selfieUrl || null,
      vehicleImageUrl: vehicleImageUrl || null,
      guarantorName: guarantorName?.trim() || null,
      guarantorPhone: guarantorPhone?.trim() || null,
      guarantorAddress: guarantorAddress?.trim() || null,
      status: 'PENDING',
      reviewNote: null,
    },
  });

  return apiResponse.success(res, 'Documents submitted for review.', {
    id: doc.id, status: doc.status,
  });
});
