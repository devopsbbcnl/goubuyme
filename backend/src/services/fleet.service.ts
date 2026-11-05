import { ApprovalStatus, Prisma } from '@prisma/client';
import prisma from '../config/db';

/** How long an unclaimed fleet invite stays valid. */
export const FLEET_INVITE_TTL_DAYS = 14;

/** Riders plus open invites a single company may hold. */
export const MAX_FLEET_SIZE = 200;

export const fleetInviteExpiry = (from: Date = new Date()): Date =>
  new Date(from.getTime() + FLEET_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

/** What `effectiveRiderApproval` needs from a rider row. Spread into a `select`. */
export const RIDER_APPROVAL_SELECT = {
  approvalStatus: true,
  companyId: true,
  approvedViaCompany: true,
  company: { select: { approvalStatus: true } },
} as const;

export interface RiderApprovalInput {
  approvalStatus: ApprovalStatus;
  companyId?: string | null;
  approvedViaCompany?: boolean;
  company?: { approvalStatus: ApprovalStatus } | null;
}

/**
 * The standing a rider should act on. A fleet rider is only as good as their
 * company: rejecting or suspending the company takes its whole fleet off the
 * road at once, and approving it again brings them back. Deriving this (instead
 * of copying the company's status onto every rider) is what makes that work.
 *
 * - An admin's REJECTED / SUSPENDED decision on the rider always wins.
 * - A rider approved only by joining a fleet (`approvedViaCompany`) who no
 *   longer has a company is not approved: joining was the only vetting they had.
 */
export function effectiveRiderApproval(r: RiderApprovalInput): ApprovalStatus {
  if (r.approvalStatus !== 'APPROVED') return r.approvalStatus;
  if (r.company) return r.company.approvalStatus === 'APPROVED' ? 'APPROVED' : 'PENDING';
  if (r.approvedViaCompany && !r.companyId) return 'PENDING';
  return 'APPROVED';
}

/** Prisma filter for riders that may be assigned or dispatched right now. */
export const ASSIGNABLE_RIDER: Prisma.RiderWhereInput = {
  approvalStatus: 'APPROVED',
  OR: [
    { companyId: null, approvedViaCompany: false },
    { company: { approvalStatus: 'APPROVED' } },
  ],
};

/**
 * Join a fleet if this rider's email has a live invite from an APPROVED company.
 * Call it once the rider's email is verified (verify-otp, rider profile fetch).
 *
 * - A rider an admin rejected or suspended is never pulled in.
 * - A rider already in another fleet is left alone.
 * - A PENDING rider is approved by joining (`approvedViaCompany`); an already
 *   approved independent rider just gains the company link.
 *
 * Returns true when the rider joined.
 */
export async function claimFleetInvite(user: { id: string; email: string }): Promise<boolean> {
  const rider = await prisma.rider.findUnique({
    where: { userId: user.id },
    select: { id: true, approvalStatus: true, companyId: true },
  });
  if (!rider) return false;
  if (rider.approvalStatus === 'REJECTED' || rider.approvalStatus === 'SUSPENDED') return false;

  const invite = await prisma.fleetInvite.findFirst({
    where: {
      email: { equals: user.email.trim(), mode: 'insensitive' },
      status: 'INVITED',
      expiresAt: { gt: new Date() },
      company: { approvalStatus: 'APPROVED' },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!invite) return false;
  if (rider.companyId && rider.companyId !== invite.companyId) return false;

  const approvedByJoining = rider.approvalStatus === 'PENDING';

  return prisma.$transaction(async (tx) => {
    // Compare-and-set so two concurrent requests cannot both claim the invite.
    const claimed = await tx.fleetInvite.updateMany({
      where: { id: invite.id, status: 'INVITED' },
      data: { status: 'CLAIMED' },
    });
    if (claimed.count === 0) return false;

    await tx.rider.update({
      where: { id: rider.id },
      data: {
        companyId: invite.companyId,
        ...(approvedByJoining ? { approvalStatus: 'APPROVED', approvedViaCompany: true } : {}),
      },
    });
    return true;
  });
}

/**
 * Take a rider out of a fleet. A rider whose only vetting was joining goes back
 * to PENDING (and offline) so they cannot keep working unreviewed.
 */
export async function removeRiderFromFleet(riderId: string): Promise<void> {
  const rider = await prisma.rider.findUnique({
    where: { id: riderId },
    select: { approvedViaCompany: true },
  });
  if (!rider) return;

  await prisma.rider.update({
    where: { id: riderId },
    data: {
      companyId: null,
      approvedViaCompany: false,
      ...(rider.approvedViaCompany
        ? { approvalStatus: 'PENDING', isOnline: false, isAvailable: false }
        : {}),
    },
  });
}
