// Access control for the SMOIS module. Runs after verifyToken. Super admins are always in;
// everyone else needs an active SmoisMember row, so holding another admin role never leaks in
// and SMOIS membership never opens other admin modules (those routes list their roles explicitly).
import { RequestHandler } from 'express';
import prisma from '../config/db';
import { AuthRequest, verifyToken } from './auth.middleware';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { Capability, SmoisAccess, can } from '../services/smois/workflow';

export interface SmoisRequest extends AuthRequest {
  smois?: SmoisAccess;
}

const ELIGIBLE_ROLES = ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN', 'SOCIAL_MEDIA'];

export const resolveSmoisAccess = async (userId: string, role: string): Promise<SmoisAccess | null> => {
  if (!ELIGIBLE_ROLES.includes(role)) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } });
  if (!user?.isActive || !ELIGIBLE_ROLES.includes(user.role)) return null;

  if (user.role === 'SUPER_ADMIN') {
    return { userId, memberId: null, level: 'SUPER', canApprove: true, canPublish: true, canEmergencyPublish: true, canConnectAccounts: true };
  }
  const m = await prisma.smoisMember.findUnique({ where: { userId } });
  if (!m || !m.isActive) return null;
  return {
    userId, memberId: m.id, level: m.role,
    canApprove: m.canApprove, canPublish: m.canPublish,
    canEmergencyPublish: m.canEmergencyPublish, canConnectAccounts: m.canConnectAccounts,
  };
};

const loadAccess: RequestHandler = catchAsync(async (req, res, next) => {
  const r = req as SmoisRequest;
  const access = await resolveSmoisAccess(r.user!.userId, r.user!.role);
  if (!access) return apiResponse.error(res, 'You do not have access to the social media workspace.', 403);
  r.smois = access;
  next();
});

export const requireCapability = (cap: Capability): RequestHandler => (req, res, next) => {
  const access = (req as SmoisRequest).smois;
  if (!access || !can(access, cap)) return apiResponse.error(res, 'Forbidden. Insufficient permissions.', 403);
  next();
};

/** verifyToken + membership, optionally gated on a capability. */
export const smoisAuth = (cap?: Capability): RequestHandler[] =>
  cap ? [verifyToken, loadAccess, requireCapability(cap)] : [verifyToken, loadAccess];
