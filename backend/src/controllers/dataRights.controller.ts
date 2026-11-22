/**
 * Data-subject access request: "give me a copy of my data" (NDPA register G30).
 * GET /auth/my-data returns the signed-in person's own data as a JSON download.
 * It never includes passwords, tokens or secrets, and identity numbers are masked (the person already knows them,
 * and a stolen session should not be able to download them).
 */
import { Response } from 'express';
import prisma from '../config/db';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { readId, maskId } from '../utils/crypto';
import { POLICY_VERSION } from '../config/policy';

export const exportMyData = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, phone: true, role: true, avatar: true, createdAt: true,
      isEmailVerified: true, isPhoneVerified: true, preferredLocale: true,
      marketingOptIn: true, marketingConsentAt: true, marketingConsentSource: true, analyticsOptIn: true,
      termsAcceptedAt: true, policyVersion: true, ageConfirmedAt: true, notificationPrefs: true,
    },
  });

  const [customer, vendors, rider, company, notifications, tickets, pushSubs] = await Promise.all([
    prisma.customer.findUnique({ where: { userId }, select: { id: true } }),
    prisma.vendor.findMany({ where: { userId } }),
    prisma.rider.findUnique({ where: { userId }, include: { document: true } }),
    prisma.logisticsCompany.findUnique({ where: { userId } }),
    prisma.notification.count({ where: { userId } }),
    prisma.ticket.findMany({ where: { requesterId: userId }, select: { id: true, subject: true, status: true, createdAt: true } }),
    prisma.pushSubscription.count({ where: { userId } }),
  ]);

  const [addresses, favorites, orders] = customer
    ? await Promise.all([
        prisma.address.findMany({ where: { customerId: customer.id } }),
        prisma.favorite.count({ where: { customerId: customer.id } }),
        prisma.order.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' },
          take: 1000,
          include: { items: { select: { name: true, quantity: true, price: true } } },
        }),
      ])
    : [[], 0, []];

  const riderOut = rider
    ? {
        ...rider,
        document: rider.document
          ? {
              ninNumberMasked: maskId(readId(rider.document.ninNumber)),
              status: rider.document.status,
              guarantorName: rider.document.guarantorName,
              guarantorPhone: rider.document.guarantorPhone,
              guarantorAddress: rider.document.guarantorAddress,
              hasNinPhoto: !!rider.document.ninImageUrl,
              hasSelfie: !!rider.document.selfieUrl,
              hasVehiclePhoto: !!rider.document.vehicleImageUrl,
              submittedAt: rider.document.createdAt,
            }
          : null,
      }
    : null;

  await prisma.auditLog.create({
    data: { userId, action: 'DATA_EXPORT_DOWNLOADED', entity: 'User', entityId: userId, meta: { activeRole: req.user!.role } },
  });

  const body = {
    exportedAt: new Date().toISOString(),
    notice: 'This is a copy of the personal data GoBuyMe holds about you. Passwords, sign-in tokens and secrets are never included. Identity numbers are masked.',
    policyVersionInForce: POLICY_VERSION,
    account: user,
    customer: customer ? { addresses, favouritesCount: favorites, orders } : null,
    vendorProfiles: vendors,
    riderProfile: riderOut,
    logisticsCompany: company,
    support: { tickets },
    counts: { notifications, pushRegistrations: pushSubs },
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="my-gobuyme-data.json"');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(JSON.stringify(body, null, 2));
});
