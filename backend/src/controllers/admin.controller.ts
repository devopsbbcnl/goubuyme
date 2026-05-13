import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApprovalStatus, CommissionTier, DocumentStatus, DocumentType, LicenseStatus, OrderStatus, PaymentStatus, PayoutStatus, Role, VendorCategory } from '@prisma/client';
import { updateVendorBadge } from './vendor.controller';
import { notifyUser } from '../services/notification.service';
import { generateReferralCode } from '../utils/generateToken';
import logger from '../utils/logger';

// GET /admin/dashboard
export const getDashboardStats = catchAsync(async (_req: Request, res: Response) => {
  const [
    totalOrders,
    revenueAgg,
    activeVendors,
    onlineRiders,
    pendingVendors,
    recentOrders,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { paymentStatus: PaymentStatus.PAID },
    }),
    prisma.vendor.count({ where: { approvalStatus: ApprovalStatus.APPROVED } }),
    prisma.rider.count({ where: { isOnline: true } }),
    prisma.vendor.findMany({
      where: { approvalStatus: ApprovalStatus.PENDING },
      select: { id: true, businessName: true, category: true, city: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true,
        customer: { select: { user: { select: { name: true } } } },
        vendor: { select: { businessName: true } },
        rider: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);

  return apiResponse.success(res, 'Dashboard stats fetched.', {
    totalRevenue: revenueAgg._sum.totalAmount ?? 0,
    totalOrders,
    activeVendors,
    onlineRiders,
    pendingVendors,
    recentOrders: recentOrders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      customerName: o.customer.user.name,
      vendorName: o.vendor.businessName,
      riderName: o.rider?.user.name ?? null,
    })),
  });
});

// GET /admin/vendors
export const getAdminVendors = catchAsync(async (req: Request, res: Response) => {
  const { status, search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const where: Record<string, unknown> = {};
  if (status && status !== 'ALL') where.approvalStatus = status as ApprovalStatus;
  if (search) where.businessName = { contains: search, mode: 'insensitive' };

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      select: {
        id: true, businessName: true, category: true, city: true,
        rating: true, approvalStatus: true, verificationBadge: true, createdAt: true,
        user: { select: { name: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.vendor.count({ where }),
  ]);

  const vendorIds = vendors.map(v => v.id);
  const revenueRows = vendorIds.length > 0
    ? await prisma.order.groupBy({
        by: ['vendorId'],
        where: { vendorId: { in: vendorIds }, paymentStatus: PaymentStatus.PAID },
        _sum: { totalAmount: true },
      })
    : [];
  const revenueMap = new Map(revenueRows.map(r => [r.vendorId, r._sum.totalAmount ?? 0]));

  const data = vendors.map(v => ({
    id: v.id,
    businessName: v.businessName,
    ownerName: v.user.name,
    category: v.category,
    city: v.city,
    rating: v.rating,
    approvalStatus: v.approvalStatus,
    verificationBadge: v.verificationBadge,
    createdAt: v.createdAt,
    totalOrders: v._count.orders,
    totalRevenue: revenueMap.get(v.id) ?? 0,
  }));

  return apiResponse.paginated(res, 'Vendors fetched.', data, {
    page: pageNum, limit: limitNum, total,
    totalPages: Math.ceil(total / limitNum),
  });
});

// PATCH /admin/vendors/:id/status
export const updateVendorStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const valid: string[] = ['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'];
  if (!valid.includes(status)) return apiResponse.error(res, 'Invalid status.', 400);

  const vendor = await prisma.vendor.update({
    where: { id },
    data: { approvalStatus: status as ApprovalStatus },
    select: { id: true, businessName: true, approvalStatus: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: `VENDOR_${status}`,
      entity: 'Vendor',
      entityId: id,
    },
  });

  return apiResponse.success(res, `Vendor ${status.toLowerCase()}.`, vendor);
});

// GET /admin/riders
export const getAdminRiders = catchAsync(async (req: Request, res: Response) => {
  const { status, search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const where: Record<string, unknown> = {};
  if (status && status !== 'ALL') where.approvalStatus = status as ApprovalStatus;
  if (search) where.user = { name: { contains: search, mode: 'insensitive' } };

  const [riders, total] = await Promise.all([
    prisma.rider.findMany({
      where,
      select: {
        id: true, vehicleType: true, plateNumber: true,
        isOnline: true, approvalStatus: true, rating: true, createdAt: true,
        user: { select: { name: true, phone: true } },
        _count: { select: { deliveries: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.rider.count({ where }),
  ]);

  const riderIds = riders.map(r => r.id);
  const earningRows = riderIds.length > 0
    ? await prisma.earning.groupBy({
        by: ['riderId'],
        where: { riderId: { in: riderIds } },
        _sum: { netAmount: true },
      })
    : [];
  const earningsMap = new Map(earningRows.map(e => [e.riderId, e._sum.netAmount ?? 0]));

  const data = riders.map(r => ({
    id: r.id,
    name: r.user.name,
    phone: r.user.phone,
    vehicleType: r.vehicleType,
    plateNumber: r.plateNumber,
    isOnline: r.isOnline,
    approvalStatus: r.approvalStatus,
    rating: r.rating,
    createdAt: r.createdAt,
    totalDeliveries: r._count.deliveries,
    totalEarnings: earningsMap.get(r.id) ?? 0,
  }));

  return apiResponse.paginated(res, 'Riders fetched.', data, {
    page: pageNum, limit: limitNum, total,
    totalPages: Math.ceil(total / limitNum),
  });
});

// GET /admin/riders/:id
export const getAdminRiderDetail = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const rider = await prisma.rider.findUnique({
    where: { id },
    select: {
      id: true, vehicleType: true, plateNumber: true,
      isOnline: true, isAvailable: true, approvalStatus: true,
      rating: true, totalRatings: true,
      latitude: true, longitude: true,
      createdAt: true, updatedAt: true,
      user: {
        select: {
          name: true, email: true, phone: true, avatar: true,
          isEmailVerified: true, isActive: true, createdAt: true,
        },
      },
      document: {
        select: {
          id: true, ninNumber: true, ninImageUrl: true, selfieUrl: true,
          vehicleImageUrl: true, guarantorName: true, guarantorPhone: true,
          guarantorAddress: true, status: true, reviewNote: true,
          createdAt: true, updatedAt: true,
        },
      },
      _count: { select: { deliveries: true } },
    },
  });

  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);

  const earningAgg = await prisma.earning.aggregate({
    where: { riderId: id },
    _sum: { netAmount: true },
  });

  return apiResponse.success(res, 'Rider detail fetched.', {
    ...rider,
    totalDeliveries: rider._count.deliveries,
    totalEarnings: earningAgg._sum.netAmount ?? 0,
  });
});

// PATCH /admin/riders/:id/status
export const updateRiderStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const valid: string[] = ['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'];
  if (!valid.includes(status)) return apiResponse.error(res, 'Invalid status.', 400);

  const rider = await prisma.rider.update({
    where: { id },
    data: { approvalStatus: status as ApprovalStatus },
    select: { id: true, approvalStatus: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: `RIDER_${status}`,
      entity: 'Rider',
      entityId: id,
    },
  });

  return apiResponse.success(res, `Rider ${status.toLowerCase()}.`, rider);
});

// GET /admin/customers
export const getAdminCustomers = catchAsync(async (req: Request, res: Response) => {
  const { search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const where: Record<string, unknown> = search
    ? {
        user: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }
    : {};

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true, createdAt: true,
        user: { select: { name: true, email: true, phone: true, isActive: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.customer.count({ where }),
  ]);

  const customerIds = customers.map(c => c.id);
  const spentRows = customerIds.length > 0
    ? await prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: customerIds }, paymentStatus: PaymentStatus.PAID },
        _sum: { totalAmount: true },
      })
    : [];
  const spentMap = new Map(spentRows.map(r => [r.customerId, r._sum.totalAmount ?? 0]));

  const data = customers.map(c => ({
    id: c.id,
    name: c.user.name,
    email: c.user.email,
    phone: c.user.phone,
    isActive: c.user.isActive,
    createdAt: c.createdAt,
    totalOrders: c._count.orders,
    totalSpent: spentMap.get(c.id) ?? 0,
  }));

  return apiResponse.paginated(res, 'Customers fetched.', data, {
    page: pageNum, limit: limitNum, total,
    totalPages: Math.ceil(total / limitNum),
  });
});

// GET /admin/audit
export const getAuditLogs = catchAsync(async (req: Request, res: Response) => {
  const { action, entity, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (entity) where.entity = entity;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true, action: true, entity: true, entityId: true,
        meta: true, ip: true, createdAt: true,
        user: { select: { name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return apiResponse.paginated(res, 'Audit logs fetched.', logs, {
    page: pageNum, limit: limitNum, total,
    totalPages: Math.ceil(total / limitNum),
  });
});

// GET /admin/orders
export const getAdminOrders = catchAsync(async (req: Request, res: Response) => {
  const { status, search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const where: Record<string, unknown> = {};
  if (status && status !== 'ALL') where.status = status as OrderStatus;
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { customer: { user: { name: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true,
        customer: { select: { user: { select: { name: true } } } },
        vendor: { select: { businessName: true } },
        rider: { select: { user: { select: { name: true } } } },
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
    status: o.status,
    totalAmount: o.totalAmount,
    createdAt: o.createdAt,
    customerName: o.customer.user.name,
    vendorName: o.vendor.businessName,
    riderName: o.rider?.user.name ?? null,
  }));

  return apiResponse.paginated(res, 'Orders fetched.', data, {
    page: pageNum, limit: limitNum, total,
    totalPages: Math.ceil(total / limitNum),
  });
});

// GET /admin/payouts
export const getAdminPayouts = catchAsync(async (_req: Request, res: Response) => {
  const [vendorPending, vendorCompleted, riderPending, riderCompleted] = await Promise.all([
    prisma.vendorPayout.groupBy({
      by: ['vendorId'],
      where: { payoutStatus: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
      _sum: { netAmount: true },
    }),
    prisma.vendorPayout.groupBy({
      by: ['vendorId'],
      where: { payoutStatus: PayoutStatus.COMPLETED },
      _max: { createdAt: true },
    }),
    prisma.earning.groupBy({
      by: ['riderId'],
      where: { payoutStatus: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
      _sum: { netAmount: true },
    }),
    prisma.earning.groupBy({
      by: ['riderId'],
      where: { payoutStatus: PayoutStatus.COMPLETED },
      _max: { createdAt: true },
    }),
  ]);

  const allVendorIds = [...new Set([
    ...vendorPending.map(v => v.vendorId),
    ...vendorCompleted.map(v => v.vendorId),
  ])];
  const allRiderIds = [...new Set([
    ...riderPending.map(r => r.riderId),
    ...riderCompleted.map(r => r.riderId),
  ])];

  const [vendors, riders] = await Promise.all([
    prisma.vendor.findMany({
      where: { id: { in: allVendorIds } },
      select: { id: true, businessName: true },
    }),
    prisma.rider.findMany({
      where: { id: { in: allRiderIds } },
      select: { id: true, user: { select: { name: true } } },
    }),
  ]);

  const vendorNameMap      = new Map(vendors.map(v => [v.id, v.businessName]));
  const riderNameMap       = new Map(riders.map(r => [r.id, r.user.name]));
  const vendorPendingMap   = new Map(vendorPending.map(v => [v.vendorId, v._sum.netAmount ?? 0]));
  const vendorCompletedMap = new Map(vendorCompleted.map(v => [v.vendorId, v._max.createdAt ?? null]));
  const riderPendingMap    = new Map(riderPending.map(r => [r.riderId, r._sum.netAmount ?? 0]));
  const riderCompletedMap  = new Map(riderCompleted.map(r => [r.riderId, r._max.createdAt ?? null]));

  const vendorRows = allVendorIds.map(id => {
    const pending = vendorPendingMap.get(id) ?? 0;
    return {
      id: `v_${id}`,
      name: vendorNameMap.get(id) ?? 'Unknown Vendor',
      type: 'Vendor',
      amountDue: pending,
      lastPaidAt: vendorCompletedMap.get(id) ?? null,
      status: pending > 0 ? 'PENDING' : 'PAID',
    };
  });

  const riderRows = allRiderIds.map(id => {
    const pending = riderPendingMap.get(id) ?? 0;
    return {
      id: `r_${id}`,
      name: riderNameMap.get(id) ?? 'Unknown Rider',
      type: 'Rider',
      amountDue: pending,
      lastPaidAt: riderCompletedMap.get(id) ?? null,
      status: pending > 0 ? 'PENDING' : 'PAID',
    };
  });

  return apiResponse.success(res, 'Payouts fetched.', [...vendorRows, ...riderRows]);
});

// PATCH /admin/payouts/:id/pay
export const processManualPayout = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // "v_{vendorId}" or "r_{riderId}"
  const { initiateTransfer } = await import('../services/paystack.service');

  const isVendor = id.startsWith('v_');
  const isRider  = id.startsWith('r_');
  if (!isVendor && !isRider) return apiResponse.error(res, 'Invalid payout ID.', 400);

  const entityId = id.slice(2);

  if (isVendor) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: entityId },
      select: { id: true, businessName: true, userId: true, payoutAccount: true },
    });
    if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);
    if (!vendor.payoutAccount?.paystackRecipientCode) {
      return apiResponse.error(res, 'Vendor has no payout account registered.', 400);
    }

    const pendingRecords = await prisma.vendorPayout.findMany({
      where: { vendorId: entityId, payoutStatus: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
      select: { id: true, netAmount: true },
    });
    if (!pendingRecords.length) return apiResponse.error(res, 'No pending payout for this vendor.', 400);

    const amount = pendingRecords.reduce((s, r) => s + r.netAmount, 0);

    const batch = await prisma.payoutBatch.create({
      data: {
        batchDate: new Date(),
        totalVendorPayout: amount,
        status: PayoutStatus.PROCESSING,
      },
    });

    await prisma.vendorPayout.updateMany({
      where: { id: { in: pendingRecords.map(r => r.id) } },
      data: { payoutStatus: PayoutStatus.PROCESSING, payoutBatchId: batch.id },
    });

    const { transferCode } = await initiateTransfer(
      vendor.payoutAccount.paystackRecipientCode,
      amount,
      `GoBuyMe Vendor Payout — ${vendor.businessName}`,
    );

    await prisma.payoutBatch.update({
      where: { id: batch.id },
      data: { paystackBatchRef: transferCode },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'VENDOR_PAYOUT_INITIATED',
        entity: 'Vendor',
        entityId,
        meta: { amount, transferCode, batchId: batch.id },
      },
    });

    notifyUser(vendor.userId, {
      title: 'Payout Initiated 💸',
      body: `Your payout of ₦${amount.toLocaleString()} has been initiated and will arrive in your bank account shortly.`,
      type: 'payout',
      data: { amount, transferCode },
    }).catch(() => {});

    return apiResponse.success(res, 'Vendor payout initiated.', { id, amount, transferCode });
  }

  // Rider path
  const rider = await prisma.rider.findUnique({
    where: { id: entityId },
    select: { id: true, userId: true, payoutAccount: true },
  });
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);
  if (!rider.payoutAccount?.paystackRecipientCode) {
    return apiResponse.error(res, 'Rider has no payout account registered.', 400);
  }

  const pendingRecords = await prisma.earning.findMany({
    where: { riderId: entityId, payoutStatus: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } },
    select: { id: true, netAmount: true },
  });
  if (!pendingRecords.length) return apiResponse.error(res, 'No pending payout for this rider.', 400);

  const amount = pendingRecords.reduce((s, r) => s + r.netAmount, 0);

  const batch = await prisma.payoutBatch.create({
    data: {
      batchDate: new Date(),
      totalRiderPayout: amount,
      status: PayoutStatus.PROCESSING,
    },
  });

  await prisma.earning.updateMany({
    where: { id: { in: pendingRecords.map(r => r.id) } },
    data: { payoutStatus: PayoutStatus.PROCESSING, payoutBatchId: batch.id },
  });

  const riderName = await prisma.user.findUnique({
    where: { id: rider.userId },
    select: { name: true },
  });

  const { transferCode } = await initiateTransfer(
    rider.payoutAccount.paystackRecipientCode,
    amount,
    `GoBuyMe Rider Payout — ${riderName?.name ?? entityId}`,
  );

  await prisma.payoutBatch.update({
    where: { id: batch.id },
    data: { paystackBatchRef: transferCode },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'RIDER_PAYOUT_INITIATED',
      entity: 'Rider',
      entityId,
      meta: { amount, transferCode, batchId: batch.id },
    },
  });

  notifyUser(rider.userId, {
    title: 'Payout Initiated 💸',
    body: `Your earnings of ₦${amount.toLocaleString()} have been initiated and will arrive in your bank account shortly.`,
    type: 'payout',
    data: { amount, transferCode },
  }).catch(() => {});

  return apiResponse.success(res, 'Rider payout initiated.', { id, amount, transferCode });
});

// POST /admin/payouts/run-batch  — fires the cron payout job immediately (for testing)
export const triggerPayoutBatch = catchAsync(async (_req: AuthRequest, res: Response) => {
  const { runPayoutBatch } = await import('../services/payout.service');
  runPayoutBatch().catch(err => logger.error('Manual payout batch error', err));
  return apiResponse.success(res, 'Payout batch triggered. Check server logs for progress.');
});

const TIER_COOLDOWN_DAYS = 14;
const TIER_RATE_LABELS: Record<CommissionTier, string> = {
  TIER_1: '3%',
  TIER_2: '7.5%',
};

// PATCH /admin/vendors/:id/tier
export const updateVendorTier = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { tier } = req.body;

  if (!Object.values(CommissionTier).includes(tier)) {
    return apiResponse.error(res, 'Invalid tier. Must be TIER_1 or TIER_2.', 400);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, businessName: true, userId: true, commissionTier: true, tierChangedAt: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  if (vendor.commissionTier === tier) {
    return apiResponse.error(res, `Vendor is already on ${tier}.`, 400);
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
    where: { id },
    data: { commissionTier: tier as CommissionTier, tierChangedAt: new Date() },
    select: { id: true, businessName: true, commissionTier: true, tierChangedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'VENDOR_TIER_CHANGED',
      entity: 'Vendor',
      entityId: id,
      meta: { from: previousTier, to: tier },
    },
  });

  notifyUser(vendor.userId, {
    title: 'Commission Tier Updated',
    body: `Your commission tier has been changed to ${tier} (${TIER_RATE_LABELS[tier as CommissionTier]} platform fee). This applies to all future orders.`,
    type: 'account',
    data: { from: previousTier, to: tier },
  }).catch(() => {});

  return apiResponse.success(res, 'Vendor tier updated.', updated);
});

// GET /admin/vendors/:id
export const getVendorDetail = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: {
      id: true, businessName: true, slug: true, description: true,
      logo: true, coverImage: true, category: true,
      address: true, city: true, state: true,
      latitude: true, longitude: true,
      isOpen: true, approvalStatus: true, commissionTier: true, verificationBadge: true,
      rating: true, totalRatings: true,
      openingTime: true, closingTime: true, avgDeliveryTime: true,
      createdAt: true, updatedAt: true,
      user: {
        select: {
          name: true, email: true, phone: true,
          isEmailVerified: true, isActive: true, createdAt: true,
        },
      },
      document: {
        select: {
          id: true, type: true, number: true,
          imageUrl: true, imageUrlBack: true, selfieUrl: true, bvn: true,
          status: true, reviewNote: true,
          createdAt: true, updatedAt: true,
        },
      },
      businessVerification: {
        select: {
          id: true, cacNumber: true, cacImageUrl: true, tin: true, directorNin: true,
          status: true, reviewNote: true, createdAt: true, updatedAt: true,
        },
      },
      licenses: {
        select: {
          id: true, type: true, licenseNumber: true, imageUrl: true, expiresAt: true,
          status: true, reviewNote: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' as const },
      },
      _count: { select: { orders: true, menuItems: true } },
    },
  });

  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const revenueAgg = await prisma.order.aggregate({
    where: { vendorId: id, paymentStatus: PaymentStatus.PAID },
    _sum: { totalAmount: true },
  });

  return apiResponse.success(res, 'Vendor detail fetched.', {
    ...vendor,
    totalOrders: vendor._count.orders,
    totalMenuItems: vendor._count.menuItems,
    totalRevenue: revenueAgg._sum.totalAmount ?? 0,
  });
});

// PATCH /admin/vendors/:id/document/status
export const updateVendorDocumentStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, reviewNote } = req.body;

  const validStatuses: string[] = ['VERIFIED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    return apiResponse.error(res, 'Invalid document status. Must be VERIFIED or REJECTED.', 400);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, userId: true, businessName: true, document: { select: { id: true } } },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);
  if (!vendor.document) return apiResponse.error(res, 'Vendor has no document on file.', 404);

  const updated = await prisma.vendorDocument.update({
    where: { vendorId: id },
    data: {
      status: status as DocumentStatus,
      reviewNote: reviewNote ?? null,
    },
    select: { id: true, type: true, status: true, reviewNote: true, updatedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: `DOCUMENT_${status}`,
      entity: 'VendorDocument',
      entityId: updated.id,
      meta: { vendorId: id, reviewNote: reviewNote ?? null },
    },
  });

  notifyUser(vendor.userId, {
    title: status === 'VERIFIED' ? 'Document Verified ✅' : 'Document Rejected',
    body: status === 'VERIFIED'
      ? 'Your identity document has been verified by the GoBuyMe team.'
      : `Your identity document was rejected. ${reviewNote ? `Reason: ${reviewNote}` : 'Please resubmit a clear photo.'}`,
    type: 'account',
    data: { documentStatus: status },
  }).catch(() => {});

  await updateVendorBadge(id);

  return apiResponse.success(res, `Document ${status.toLowerCase()}.`, updated);
});

// PATCH /admin/vendors/:id/business-verification/status
export const updateVendorBusinessVerifStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, reviewNote } = req.body;

  const validStatuses: string[] = ['VERIFIED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    return apiResponse.error(res, 'Invalid status. Must be VERIFIED or REJECTED.', 400);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, userId: true, businessVerification: { select: { id: true } } },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);
  if (!vendor.businessVerification) return apiResponse.error(res, 'No business verification on file.', 404);

  const updated = await prisma.vendorBusinessVerification.update({
    where: { vendorId: id },
    data: { status: status as DocumentStatus, reviewNote: reviewNote ?? null },
    select: { id: true, status: true, reviewNote: true, updatedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: `BUSINESS_VERIFICATION_${status}`,
      entity: 'VendorBusinessVerification',
      entityId: updated.id,
      meta: { vendorId: id, reviewNote: reviewNote ?? null },
    },
  });

  notifyUser(vendor.userId, {
    title: status === 'VERIFIED' ? 'Business Verified ✅' : 'Business Verification Rejected',
    body: status === 'VERIFIED'
      ? 'Your business (CAC) has been verified. Your profile now shows a Business Verified badge.'
      : `Your business verification was rejected. ${reviewNote ? `Reason: ${reviewNote}` : 'Please resubmit accurate information.'}`,
    type: 'account',
    data: { businessVerifStatus: status },
  }).catch(() => {});

  await updateVendorBadge(id);

  return apiResponse.success(res, `Business verification ${status.toLowerCase()}.`, updated);
});

// PATCH /admin/vendors/:id/licenses/:licenseId/status
export const updateVendorLicenseStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id, licenseId } = req.params;
  const { status, reviewNote } = req.body;

  const validStatuses: string[] = ['VERIFIED', 'REJECTED', 'EXPIRED'];
  if (!validStatuses.includes(status)) {
    return apiResponse.error(res, 'Invalid status. Must be VERIFIED, REJECTED, or EXPIRED.', 400);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const license = await prisma.vendorLicense.findFirst({
    where: { id: licenseId, vendorId: id },
  });
  if (!license) return apiResponse.error(res, 'License not found.', 404);

  const updated = await prisma.vendorLicense.update({
    where: { id: licenseId },
    data: { status: status as LicenseStatus, reviewNote: reviewNote ?? null },
    select: { id: true, type: true, status: true, reviewNote: true, updatedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: `LICENSE_${status}`,
      entity: 'VendorLicense',
      entityId: licenseId,
      meta: { vendorId: id, type: license.type, reviewNote: reviewNote ?? null },
    },
  });

  notifyUser(vendor.userId, {
    title: status === 'VERIFIED' ? 'License Verified ✅' : `License ${status === 'EXPIRED' ? 'Expired' : 'Rejected'}`,
    body: status === 'VERIFIED'
      ? `Your ${license.type} license has been verified. Your profile now shows a Premium Verified badge.`
      : `Your ${license.type} license was ${status.toLowerCase()}. ${reviewNote ? `Reason: ${reviewNote}` : 'Please resubmit if needed.'}`,
    type: 'account',
    data: { licenseStatus: status, licenseType: license.type },
  }).catch(() => {});

  await updateVendorBadge(id);

  return apiResponse.success(res, `License ${status.toLowerCase()}.`, updated);
});

// PATCH /admin/riders/:id/document/status
export const updateRiderDocumentStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, reviewNote } = req.body;

  const validStatuses: string[] = ['VERIFIED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    return apiResponse.error(res, 'Invalid status. Must be VERIFIED or REJECTED.', 400);
  }

  const rider = await prisma.rider.findUnique({
    where: { id },
    select: { id: true, userId: true, document: { select: { id: true } } },
  });
  if (!rider) return apiResponse.error(res, 'Rider not found.', 404);
  if (!rider.document) return apiResponse.error(res, 'Rider has no document on file.', 404);

  const updated = await prisma.riderDocument.update({
    where: { riderId: id },
    data: { status: status as DocumentStatus, reviewNote: reviewNote ?? null },
    select: { id: true, status: true, reviewNote: true, updatedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: `RIDER_DOCUMENT_${status}`,
      entity: 'RiderDocument',
      entityId: updated.id,
      meta: { riderId: id, reviewNote: reviewNote ?? null },
    },
  });

  notifyUser(rider.userId, {
    title: status === 'VERIFIED' ? 'Documents Verified ✅' : 'Documents Rejected',
    body: status === 'VERIFIED'
      ? 'Your identity documents have been verified by the GoBuyMe team.'
      : `Your documents were rejected. ${reviewNote ? `Reason: ${reviewNote}` : 'Please resubmit clear photos.'}`,
    type: 'account',
    data: { documentStatus: status },
  }).catch(() => {});

  return apiResponse.success(res, `Rider document ${status.toLowerCase()}.`, updated);
});

// POST /admin/vendors/create
export const adminCreateVendor = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    name, email, phone, password,
    businessName, category, address, city, state,
    description, logo, coverImage, openingTime, closingTime, tier,
    docType, docNumber, docImageUrl, docImageUrlBack, bvn, selfieUrl,
  } = req.body;

  if (!name?.trim() || !email?.trim() || !password || !businessName?.trim() || !category || !address?.trim() || !city?.trim()) {
    return apiResponse.error(res, 'Name, email, password, business name, category, address, and city are required.', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) return apiResponse.error(res, 'Email already registered.', 409);

  const hashed = await bcrypt.hash(password, 10);
  const referralCode = generateReferralCode();
  const slug = businessName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const result = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashed,
        role: 'VENDOR',
        referralCode,
        isEmailVerified: true,
        isActive: true,
        ...(phone?.trim() ? { phone: phone.trim() } : {}),
      },
    });

    const newVendor = await tx.vendor.create({
      data: {
        userId: newUser.id,
        businessName: businessName.trim(),
        slug: `${slug}-${newUser.id.slice(0, 6)}`,
        category: category as VendorCategory,
        address: address.trim(),
        city: city.trim(),
        ...(state?.trim() ? { state: state.trim() } : {}),
        commissionTier: (tier ?? 'TIER_2') as CommissionTier,
        isPharmacyFlagged: category === 'PHARMACY',
        ...(description?.trim() ? { description: description.trim() } : {}),
        ...(logo ? { logo } : {}),
        ...(coverImage ? { coverImage } : {}),
        ...(openingTime?.trim() ? { openingTime: openingTime.trim() } : {}),
        ...(closingTime?.trim() ? { closingTime: closingTime.trim() } : {}),
      },
    });

    if (docType && docNumber?.trim() && docImageUrl) {
      await tx.vendorDocument.create({
        data: {
          vendorId: newVendor.id,
          type: docType as DocumentType,
          number: docNumber.trim(),
          imageUrl: docImageUrl,
          ...(docImageUrlBack ? { imageUrlBack: docImageUrlBack } : {}),
          ...(bvn?.trim() ? { bvn: bvn.trim() } : {}),
          ...(selfieUrl ? { selfieUrl } : {}),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'VENDOR_CREATED',
        entity: 'Vendor',
        entityId: newVendor.id,
        meta: { createdBy: 'admin', vendorEmail: email },
      },
    });

    return { vendorId: newVendor.id, businessName: newVendor.businessName };
  });

  return apiResponse.success(res, 'Vendor account created successfully.', result, 201);
});

// GET /admin/admins
export const listAdminUsers = catchAsync(async (_req: Request, res: Response) => {
  const adminRoles = ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'] as unknown as Role[];
  const admins = await prisma.user.findMany({
    where: { role: { in: adminRoles } },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return apiResponse.success(res, 'Admin users fetched.', admins);
});

// POST /admin/admins
export const createAdminUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, email, password, role } = req.body;

  const ADMIN_ROLES = ['OPERATIONS_ADMIN', 'SUPPORT_ADMIN'];
  if (!name?.trim() || !email?.trim() || !password) {
    return apiResponse.error(res, 'Name, email, and password are required.', 400);
  }
  if (!ADMIN_ROLES.includes(role)) {
    return apiResponse.error(res, 'Role must be OPERATIONS_ADMIN or SUPPORT_ADMIN.', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) return apiResponse.error(res, 'Email already registered.', 409);

  const hashed = await bcrypt.hash(password, 10);
  const referralCode = generateReferralCode();

  const newUser = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      role: role as unknown as Role,
      referralCode,
      isEmailVerified: true,
      isActive: true,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'ADMIN_CREATED',
      entity: 'User',
      entityId: newUser.id,
      meta: { role, createdEmail: email },
    },
  });

  return apiResponse.success(res, 'Admin user created.', newUser, 201);
});

// PATCH /admin/admins/:id/role
export const updateAdminRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;

  const ADMIN_ROLES = ['OPERATIONS_ADMIN', 'SUPPORT_ADMIN'];
  if (!ADMIN_ROLES.includes(role)) {
    return apiResponse.error(res, 'Role must be OPERATIONS_ADMIN or SUPPORT_ADMIN.', 400);
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return apiResponse.error(res, 'User not found.', 404);
  if (target.role === Role.SUPER_ADMIN) {
    return apiResponse.error(res, 'Super admin role cannot be modified.', 403);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: role as unknown as Role },
    select: { id: true, name: true, email: true, role: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'ADMIN_ROLE_CHANGED',
      entity: 'User',
      entityId: id,
      meta: { from: target.role, to: role },
    },
  });

  return apiResponse.success(res, 'Admin role updated.', updated);
});

// DELETE /admin/admins/:id
export const deactivateAdminUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (id === req.user!.userId) {
    return apiResponse.error(res, 'You cannot deactivate your own account.', 400);
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return apiResponse.error(res, 'User not found.', 404);
  if (target.role === Role.SUPER_ADMIN) {
    return apiResponse.error(res, 'Super admin accounts cannot be deactivated.', 403);
  }

  await prisma.user.update({ where: { id }, data: { isActive: false } });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'ADMIN_DEACTIVATED',
      entity: 'User',
      entityId: id,
    },
  });

  return apiResponse.success(res, 'Admin user deactivated.');
});

// POST /admin/riders/create
export const adminCreateRider = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    name, email, phone, password, vehicleType, plateNumber,
    ninNumber, ninImageUrl, selfieUrl, vehicleImageUrl,
    guarantorName, guarantorPhone, guarantorAddress,
  } = req.body;

  if (!name?.trim() || !email?.trim() || !password || !vehicleType?.trim()) {
    return apiResponse.error(res, 'Name, email, password, and vehicle type are required.', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) return apiResponse.error(res, 'Email already registered.', 409);

  const hashed = await bcrypt.hash(password, 10);
  const referralCode = generateReferralCode();

  const result = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashed,
        role: 'RIDER',
        referralCode,
        isEmailVerified: true,
        isActive: true,
        ...(phone?.trim() ? { phone: phone.trim() } : {}),
      },
    });

    const newRider = await tx.rider.create({
      data: {
        userId: newUser.id,
        vehicleType: vehicleType.trim(),
        ...(plateNumber?.trim() ? { plateNumber: plateNumber.trim().toUpperCase() } : {}),
      },
    });

    if (ninNumber?.trim()) {
      await tx.riderDocument.create({
        data: {
          riderId: newRider.id,
          ninNumber: ninNumber.trim(),
          ...(ninImageUrl      ? { ninImageUrl }                              : {}),
          ...(selfieUrl        ? { selfieUrl }                                : {}),
          ...(vehicleImageUrl  ? { vehicleImageUrl }                          : {}),
          ...(guarantorName?.trim()    ? { guarantorName: guarantorName.trim() }       : {}),
          ...(guarantorPhone?.trim()   ? { guarantorPhone: guarantorPhone.trim() }     : {}),
          ...(guarantorAddress?.trim() ? { guarantorAddress: guarantorAddress.trim() } : {}),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'RIDER_CREATED',
        entity: 'Rider',
        entityId: newRider.id,
        meta: { createdBy: 'admin', riderEmail: email },
      },
    });

    return { riderId: newRider.id, name: newUser.name };
  });

  return apiResponse.success(res, 'Rider account created successfully.', result, 201);
});
