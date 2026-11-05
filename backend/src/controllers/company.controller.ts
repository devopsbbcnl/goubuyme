import { Response } from 'express';
import { OrderStatus } from '@prisma/client';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { recordError } from '../utils/recordError';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendFleetInviteEmail } from '../services/email.service';
import {
  MAX_FLEET_SIZE,
  effectiveRiderApproval,
  fleetInviteExpiry,
  removeRiderFromFleet,
} from '../services/fleet.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACTIVE_STATUSES: OrderStatus[] = [OrderStatus.READY, OrderStatus.PICKED_UP];

const resolveCompany = (userId: string) =>
  prisma.logisticsCompany.findUnique({ where: { userId } });

// GET /company/me
export const getMyCompany = catchAsync(async (req: AuthRequest, res: Response) => {
  const company = await resolveCompany(req.user!.userId);
  if (!company) return apiResponse.error(res, 'Company profile not found.', 404);

  const now = new Date();
  const [riders, online, openInvites, delivered, user] = await Promise.all([
    prisma.rider.count({ where: { companyId: company.id } }),
    prisma.rider.count({ where: { companyId: company.id, isOnline: true } }),
    prisma.fleetInvite.count({ where: { companyId: company.id, status: 'INVITED', expiresAt: { gt: now } } }),
    prisma.order.count({ where: { status: OrderStatus.DELIVERED, rider: { companyId: company.id } } }),
    prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true, email: true, phone: true, avatar: true, avatarPosition: true },
    }),
  ]);

  return apiResponse.success(res, 'Company fetched.', {
    ...company,
    owner: user,
    stats: { riders, online, openInvites, delivered, capacity: MAX_FLEET_SIZE },
  });
});

// PATCH /company/me
export const updateMyCompany = catchAsync(async (req: AuthRequest, res: Response) => {
  const company = await resolveCompany(req.user!.userId);
  if (!company) return apiResponse.error(res, 'Company profile not found.', 404);

  const b = req.body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
  const data: Record<string, unknown> = {};

  const companyName = str(b.companyName);
  if (companyName !== undefined) {
    if (companyName.length < 2 || companyName.length > 150) {
      return apiResponse.error(res, 'Company name must be 2 to 150 characters.', 400);
    }
    if (companyName.toLowerCase() !== company.companyName.toLowerCase()) {
      const taken = await prisma.logisticsCompany.findFirst({
        where: { companyName: { equals: companyName, mode: 'insensitive' }, id: { not: company.id } },
        select: { id: true },
      });
      if (taken) return apiResponse.error(res, 'A logistics company with this name already exists.', 409);
    }
    data.companyName = companyName;
  }
  for (const key of ['address', 'city', 'state'] as const) {
    const v = str(b[key]);
    if (v !== undefined) {
      if (!v) return apiResponse.error(res, `${key} cannot be empty.`, 400);
      data[key] = v;
    }
  }
  const reg = str(b.registrationNumber);
  if (reg !== undefined) data.registrationNumber = reg || null;
  for (const key of ['latitude', 'longitude'] as const) {
    if (typeof b[key] === 'number' && Number.isFinite(b[key] as number)) data[key] = b[key];
  }

  if (Object.keys(data).length === 0) return apiResponse.error(res, 'No fields to update.', 400);

  const updated = await prisma.logisticsCompany.update({ where: { id: company.id }, data });
  return apiResponse.success(res, 'Company updated.', updated);
});

// GET /company/me/fleet — riders in the fleet plus open invites
export const getFleet = catchAsync(async (req: AuthRequest, res: Response) => {
  const company = await resolveCompany(req.user!.userId);
  if (!company) return apiResponse.error(res, 'Company profile not found.', 404);

  const [riders, invites] = await Promise.all([
    prisma.rider.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, vehicleType: true, plateNumber: true, isOnline: true, rating: true, totalRatings: true,
        approvalStatus: true, companyId: true, approvedViaCompany: true,
        company: { select: { approvalStatus: true } },
        user: { select: { name: true, email: true, phone: true, avatar: true, avatarPosition: true } },
        _count: { select: { deliveries: { where: { status: OrderStatus.DELIVERED } } } },
      },
    }),
    prisma.fleetInvite.findMany({
      where: { companyId: company.id, status: 'INVITED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, expiresAt: true, createdAt: true },
    }),
  ]);

  const now = Date.now();
  return apiResponse.success(res, 'Fleet fetched.', {
    riders: riders.map((r) => ({
      id: r.id,
      name: r.user.name,
      email: r.user.email,
      phone: r.user.phone,
      avatar: r.user.avatar,
      avatarPosition: r.user.avatarPosition,
      vehicleType: r.vehicleType,
      plateNumber: r.plateNumber,
      isOnline: r.isOnline,
      rating: r.rating,
      totalRatings: r.totalRatings,
      deliveries: r._count.deliveries,
      approvalStatus: effectiveRiderApproval(r),
    })),
    invites: invites.map((i) => ({ ...i, expired: i.expiresAt.getTime() <= now })),
    capacity: MAX_FLEET_SIZE,
  });
});

// POST /company/me/fleet/invites  { email }
export const inviteRider = catchAsync(async (req: AuthRequest, res: Response) => {
  const company = await resolveCompany(req.user!.userId);
  if (!company) return apiResponse.error(res, 'Company profile not found.', 404);
  if (company.approvalStatus !== 'APPROVED') {
    return apiResponse.error(res, 'Your company must be approved before you can invite riders.', 403);
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return apiResponse.error(res, 'Enter a valid email address.', 400);
  }

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    select: { role: true, rider: { select: { companyId: true } } },
  });
  if (existingUser) {
    if (existingUser.role !== 'RIDER') {
      return apiResponse.error(res, 'That email belongs to an account that is not a rider account.', 409);
    }
    if (existingUser.rider?.companyId === company.id) {
      return apiResponse.error(res, 'That rider is already in your fleet.', 409);
    }
    if (existingUser.rider?.companyId) {
      return apiResponse.error(res, 'That rider already belongs to another fleet.', 409);
    }
  }

  const now = new Date();
  const [riders, open] = await Promise.all([
    prisma.rider.count({ where: { companyId: company.id } }),
    prisma.fleetInvite.count({ where: { companyId: company.id, status: 'INVITED', expiresAt: { gt: now } } }),
  ]);
  const prior = await prisma.fleetInvite.findUnique({
    where: { companyId_email: { companyId: company.id, email } },
    select: { status: true, expiresAt: true },
  });
  const alreadyCounted = prior?.status === 'INVITED' && prior.expiresAt > now;
  if (!alreadyCounted && riders + open >= MAX_FLEET_SIZE) {
    return apiResponse.error(res, `A fleet can hold up to ${MAX_FLEET_SIZE} riders and open invites.`, 409);
  }

  // Re-inviting reopens a claimed/revoked/expired invite with a fresh expiry.
  const invite = await prisma.fleetInvite.upsert({
    where: { companyId_email: { companyId: company.id, email } },
    create: { companyId: company.id, email, expiresAt: fleetInviteExpiry() },
    update: { status: 'INVITED', expiresAt: fleetInviteExpiry() },
    select: { id: true, email: true, expiresAt: true, createdAt: true },
  });

  sendFleetInviteEmail(email, company.companyName).catch((err) =>
    recordError('company', 'Fleet invite email failed', err, { companyId: company.id }),
  );

  return apiResponse.success(res, 'Invite sent.', invite, 201);
});

// DELETE /company/me/fleet/invites/:id
export const revokeInvite = catchAsync(async (req: AuthRequest, res: Response) => {
  const company = await resolveCompany(req.user!.userId);
  if (!company) return apiResponse.error(res, 'Company profile not found.', 404);

  const result = await prisma.fleetInvite.updateMany({
    where: { id: req.params.id, companyId: company.id, status: 'INVITED' },
    data: { status: 'REVOKED' },
  });
  if (result.count === 0) return apiResponse.error(res, 'Invite not found.', 404);
  return apiResponse.success(res, 'Invite revoked.');
});

// DELETE /company/me/fleet/riders/:riderId
export const removeRider = catchAsync(async (req: AuthRequest, res: Response) => {
  const company = await resolveCompany(req.user!.userId);
  if (!company) return apiResponse.error(res, 'Company profile not found.', 404);

  const rider = await prisma.rider.findFirst({
    where: { id: req.params.riderId, companyId: company.id },
    select: { id: true },
  });
  if (!rider) return apiResponse.error(res, 'Rider not found in your fleet.', 404);

  const active = await prisma.order.findFirst({
    where: { riderId: rider.id, status: { in: ACTIVE_STATUSES } },
    select: { orderNumber: true },
  });
  if (active) {
    return apiResponse.error(res, `This rider is on order #${active.orderNumber}. Remove them after it is delivered.`, 409);
  }

  await removeRiderFromFleet(rider.id);
  return apiResponse.success(res, 'Rider removed from your fleet.');
});

// GET /company/me/deliveries?page=&limit=&status=
export const getFleetDeliveries = catchAsync(async (req: AuthRequest, res: Response) => {
  const company = await resolveCompany(req.user!.userId);
  if (!company) return apiResponse.error(res, 'Company profile not found.', 404);

  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const status = String(req.query.status ?? '');
  const where = {
    rider: { companyId: company.id },
    ...(Object.values(OrderStatus).includes(status as OrderStatus) ? { status: status as OrderStatus } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, orderNumber: true, status: true, deliveryFee: true, deliveryAddress: true, createdAt: true,
        vendor: { select: { businessName: true } },
        rider: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return apiResponse.success(res, 'Deliveries fetched.', {
    deliveries: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      deliveryFee: o.deliveryFee,
      deliveryAddress: o.deliveryAddress,
      vendorName: o.vendor.businessName,
      riderId: o.rider?.id ?? null,
      riderName: o.rider?.user.name ?? null,
      createdAt: o.createdAt,
    })),
    page,
    limit,
    total,
  });
});
