// Access control for People & Workforce (PWM). Runs after verifyToken. Super admins are always in;
// everyone else needs an active PwmMember row, so another admin role never leaks in and PWM
// membership never opens other admin modules. Permissions are enforced here, not in the UI.
import { RequestHandler } from 'express';
import prisma from '../config/db';
import { AuthRequest, verifyToken } from './auth.middleware';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { Capability, PwmAccess, can } from '../services/pwm/rules';

export interface PwmRequest extends AuthRequest {
  pwm?: PwmAccess;
}

const ELIGIBLE_ROLES = ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'];

export const resolvePwmAccess = async (userId: string, role: string): Promise<PwmAccess | null> => {
  if (!ELIGIBLE_ROLES.includes(role)) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true } });
  if (!user?.isActive || !ELIGIBLE_ROLES.includes(user.role)) return null;

  const employee = await prisma.pwmEmployee.findUnique({ where: { userId }, select: { id: true } });
  const headed = employee
    ? await prisma.pwmDepartment.findMany({ where: { headEmployeeId: employee.id, archivedAt: null }, select: { id: true } })
    : [];
  const base = { userId, employeeId: employee?.id ?? null, headedDepartmentIds: headed.map((d) => d.id) };

  if (user.role === 'SUPER_ADMIN') return { ...base, memberId: null, level: 'SUPER', isMd: false, canViewCompensation: true };
  const m = await prisma.pwmMember.findUnique({ where: { userId } });
  if (!m || !m.isActive) return null;
  return { ...base, memberId: m.id, level: m.role, isMd: m.isMd, canViewCompensation: m.canViewCompensation };
};

const loadAccess: RequestHandler = catchAsync(async (req, res, next) => {
  const r = req as PwmRequest;
  const access = await resolvePwmAccess(r.user!.userId, r.user!.role);
  if (!access) return apiResponse.error(res, 'You do not have access to People & Workforce.', 403);
  r.pwm = access;
  next();
});

export const requirePwmCapability = (cap: Capability): RequestHandler => (req, res, next) => {
  const access = (req as PwmRequest).pwm;
  if (!access || !can(access, cap)) return apiResponse.error(res, 'Forbidden. Insufficient permissions.', 403);
  next();
};

/** verifyToken + membership, optionally gated on a capability. */
export const pwmAuth = (cap?: Capability): RequestHandler[] =>
  cap ? [verifyToken, loadAccess, requirePwmCapability(cap)] : [verifyToken, loadAccess];
