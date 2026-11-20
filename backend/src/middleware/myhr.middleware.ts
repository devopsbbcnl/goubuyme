// Access control for My HR (employee self-service). Anyone signed in with a login that is linked to their own
// current employee record may use it, and only ever sees that record. Staff-role logins (STAFF) get nothing else.
import { RequestHandler } from 'express';
import prisma from '../config/db';
import { AuthRequest, verifyToken } from './auth.middleware';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';

export interface MyHrRequest extends AuthRequest {
  my?: { userId: string; employeeId: string; departmentId: string | null };
}

const ELIGIBLE_ROLES = ['STAFF', 'SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'];

const loadSelf: RequestHandler = catchAsync(async (req, res, next) => {
  const r = req as MyHrRequest;
  if (!ELIGIBLE_ROLES.includes(r.user!.role)) return apiResponse.error(res, 'My HR is for staff accounts.', 403);
  const user = await prisma.user.findUnique({ where: { id: r.user!.userId }, select: { isActive: true, role: true } });
  if (!user?.isActive || !ELIGIBLE_ROLES.includes(user.role)) return apiResponse.error(res, 'My HR is for staff accounts.', 403);
  const emp = await prisma.pwmEmployee.findUnique({ where: { userId: r.user!.userId }, select: { id: true, status: true, departmentId: true } });
  if (!emp || ['RESIGNED', 'TERMINATED', 'ARCHIVED'].includes(emp.status)) return apiResponse.error(res, 'No active employee record is linked to this login.', 403);
  r.my = { userId: r.user!.userId, employeeId: emp.id, departmentId: emp.departmentId };
  next();
});

export const myHrAuth: RequestHandler[] = [verifyToken, loadSelf];
