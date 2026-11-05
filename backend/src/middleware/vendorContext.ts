import { RequestHandler } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { AuthRequest } from './auth.middleware';

/** Header the vendor apps send to say which of the owner's locations a request is for. */
export const VENDOR_CONTEXT_HEADER = 'x-vendor-id';

/**
 * Decides which vendor location a vendor request acts on.
 *
 * - A **branch manager** (a separate login the owner created) always acts on their own branch,
 *   whatever the header says. Naming any other location is refused.
 * - The **owner** acts on the location the header selects, if they own it (a branch carries the
 *   owner's `userId`, so "owns it" is `vendor.userId === caller`). Without the header the request
 *   targets the main business, which keeps every existing client working.
 *
 * Routes that must always act on the main business (payout account, tier, documents, branch and
 * login management) are mounted behind `requireOwner` instead, so managers cannot reach them.
 */
export const vendorContext: RequestHandler = async (request, res, next) => {
  const req = request as AuthRequest;
  try {
    const userId = req.user!.userId;
    const raw = req.headers[VENDOR_CONTEXT_HEADER];
    const requested = (Array.isArray(raw) ? raw[0] : raw) || undefined;

    const managed = await prisma.vendor.findFirst({
      where: { managerUserId: userId },
      select: { id: true, manager: { select: { isActive: true } } },
    });
    if (managed) {
      // Switching a login off must bite immediately, not when the 15-minute access token runs out.
      if (managed.manager?.isActive === false) {
        apiResponse.error(res, 'Your access to this branch has been turned off by the business owner.', 403);
        return;
      }
      if (requested && requested !== managed.id) {
        apiResponse.error(res, 'You can only manage your own branch.', 403);
        return;
      }
      req.vendorId = managed.id;
      req.isBranchManager = true;
      next();
      return;
    }

    if (!requested) {
      next();
      return;
    }
    const owned = await prisma.vendor.findFirst({ where: { id: requested, userId }, select: { id: true } });
    if (!owned) {
      apiResponse.error(res, 'That location does not belong to your account.', 403);
      return;
    }
    req.vendorId = owned.id;
    next();
  } catch (err) {
    next(err);
  }
};

/** Blocks branch managers. Owner-only areas: branches and logins, payouts, plan, verification. */
export const requireOwner: RequestHandler = async (request, res, next) => {
  const req = request as AuthRequest;
  try {
    const managed = await prisma.vendor.findFirst({ where: { managerUserId: req.user!.userId }, select: { id: true } });
    if (managed) {
      apiResponse.error(res, 'Only the business owner can do this.', 403);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Prisma `where` for the vendor a request acts on: the selected location when the context
 * middleware ran, otherwise the account's main business.
 */
export const actingVendorWhere = (req: AuthRequest) =>
  req.vendorId ? { id: req.vendorId } : { userId: req.user!.userId, parentVendorId: null };
