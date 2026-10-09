import { Response } from 'express';
import { OrderActorType, Prisma } from '@prisma/client';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  OrderActionError,
  OrderActor,
  adminCancelOrder,
  assignRider,
  getCandidateRiders,
  issueGoodwillCredit,
  unassignRider,
} from '../services/orderLifecycle.service';

// Admin write actions on orders. Thin HTTP wrappers over orderLifecycle.service — the ops agents
// will call the same service functions, so behaviour and limits stay identical for both.

const adminActor = (req: AuthRequest): OrderActor => ({ type: OrderActorType.ADMIN, id: req.user!.userId });

const audit = (req: AuthRequest, action: string, orderId: string, meta: Prisma.InputJsonValue) =>
  prisma.auditLog.create({
    data: { userId: req.user!.userId, action, entity: 'Order', entityId: orderId, meta, ip: req.ip ?? null },
  });

const handle = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof OrderActionError) return apiResponse.error(res, err.message, err.status);
      throw err;
    }
  });

// GET /admin/orders/:id/candidate-riders
export const getOrderCandidateRiders = handle(async (req, res) => {
  const riders = await getCandidateRiders(req.params.id);
  return apiResponse.success(res, 'Candidate riders fetched.', riders);
});

// POST /admin/orders/:id/cancel
export const cancelOrderAsAdmin = handle(async (req, res) => {
  const { reason } = req.body as { reason: string };
  const cancelled = await adminCancelOrder(req.params.id, adminActor(req), reason.trim());
  await audit(req, 'ORDER_ADMIN_CANCELLED', cancelled.id, {
    orderNumber: cancelled.orderNumber,
    previousStatus: cancelled.previousStatus,
    reason,
    refundedAsCredit: cancelled.wasPaid ? cancelled.totalAmount : 0,
  });
  return apiResponse.success(res, 'Order cancelled.', {
    id: cancelled.id,
    status: 'CANCELLED',
    refundedAsCredit: cancelled.wasPaid ? cancelled.totalAmount : 0,
  });
});

// POST /admin/orders/:id/assign-rider
export const assignRiderAsAdmin = handle(async (req, res) => {
  const { riderId, note } = req.body as { riderId: string; note?: string };
  const result = await assignRider(req.params.id, riderId, adminActor(req), note ?? null);
  await audit(req, result.previousRiderId ? 'ORDER_RIDER_REASSIGNED' : 'ORDER_RIDER_ASSIGNED', result.orderId, {
    orderNumber: result.orderNumber, riderId: result.riderId, previousRiderId: result.previousRiderId, note: note ?? null,
  });
  return apiResponse.success(res, `Assigned to ${result.riderName}.`, result);
});

// POST /admin/orders/:id/unassign-rider
export const unassignRiderAsAdmin = handle(async (req, res) => {
  const { note } = req.body as { note?: string };
  const result = await unassignRider(req.params.id, adminActor(req), note ?? null);
  await audit(req, 'ORDER_RIDER_UNASSIGNED', result.orderId, {
    orderNumber: result.orderNumber, previousRiderId: result.previousRiderId, note: note ?? null,
  });
  return apiResponse.success(res, 'Rider removed. The order is back in the open jobs list.', result);
});

// POST /admin/orders/:id/credit
export const issueOrderCreditAsAdmin = handle(async (req, res) => {
  const { amount, note } = req.body as { amount: number; note: string };
  const result = await issueGoodwillCredit(req.params.id, amount, adminActor(req), {
    isSuperAdmin: req.user!.role === 'SUPER_ADMIN',
    note: note.trim(),
  });
  await audit(req, 'ORDER_GOODWILL_CREDIT', result.orderId, { orderNumber: result.orderNumber, amount, note });
  return apiResponse.success(res, `₦${amount.toLocaleString()} credit issued to the customer.`, result);
});
