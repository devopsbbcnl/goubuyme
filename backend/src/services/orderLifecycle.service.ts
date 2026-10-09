import { OrderActorType, OrderEventType, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import prisma from '../config/db';
import { getIO } from '../config/socket';
import { issueCredit } from './storeCredit.service';
import { notifyUser } from './notification.service';
import { haversineDistance } from './distance.service';
import {
  ACTIVE_DELIVERY_STATUSES,
  ADMIN_CANCELLABLE,
  canAssignRider,
  checkGoodwillCredit,
  rankRidersByDistance,
} from './orderRules';

// Single home for order state changes. Every status change goes through transitionOrder() so the
// OrderEvent timeline and Order.statusChangedAt stay complete, and every cancellation goes through
// cancelOrderWithRefund() so stock, refunds and rider release behave the same no matter who cancels
// (customer, vendor, escalation job, admin — and later the ops agents).

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export interface OrderActor {
  type: OrderActorType;
  id?: string | null;
}

export class OrderActionError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message);
    this.name = 'OrderActionError';
  }
}

const isRootClient = (db: Db): db is typeof prisma => '$transaction' in db;

const emitOrderStatus = (orderId: string, status: string) => {
  try {
    getIO().of('/orders').to(`order:${orderId}`).emit('order:status', { orderId, status });
  } catch { /* socket may not be connected */ }
};

export async function recordOrderEvent(db: Db, input: {
  orderId: string;
  type: OrderEventType;
  actor: OrderActor;
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  note?: string | null;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  await db.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      note: input.note ? input.note.slice(0, 500) : null,
      meta: input.meta,
    },
  });
}

export interface TransitionInput {
  orderId: string;
  from: readonly OrderStatus[];
  to: OrderStatus;
  actor: OrderActor;
  note?: string | null;
  /** Extra fields written in the same update (cancelReason, paymentStatus, ...). */
  data?: Prisma.OrderUpdateManyMutationInput;
  /** Extra guard conditions, e.g. the payment status the caller based its decision on. */
  where?: Prisma.OrderWhereInput;
}

async function applyTransition(tx: Tx, input: TransitionInput): Promise<OrderStatus | null> {
  const current = await tx.order.findUnique({ where: { id: input.orderId }, select: { status: true } });
  if (!current || !input.from.includes(current.status)) return null;

  // Compare-and-set on the status we just read: if anyone else moved the order in between,
  // count is 0 and the caller gets null instead of silently overwriting their change.
  const res = await tx.order.updateMany({
    where: { ...input.where, id: input.orderId, status: current.status },
    data: { ...input.data, status: input.to, statusChangedAt: new Date() },
  });
  if (res.count === 0) return null;

  await recordOrderEvent(tx, {
    orderId: input.orderId,
    type: OrderEventType.STATUS_CHANGED,
    actor: input.actor,
    fromStatus: current.status,
    toStatus: input.to,
    note: input.note,
  });
  return current.status;
}

/**
 * Moves an order to `to` only if it is currently in one of `from`. Returns the previous status,
 * or null if the order doesn't exist or has already moved on.
 */
export function transitionOrder(db: Db, input: TransitionInput): Promise<OrderStatus | null> {
  return isRootClient(db)
    ? db.$transaction((tx) => applyTransition(tx, input))
    : applyTransition(db, input);
}

export interface CancelOrderInput {
  orderId: string;
  from: readonly OrderStatus[];
  actor: OrderActor;
  cancelReason?: string | null;
  /** Ledger reason for the refund credit, e.g. 'VENDOR_REJECT_REFUND'. */
  creditReason: string;
  data?: Prisma.OrderUpdateManyMutationInput;
  /** Runs inside the cancellation transaction, e.g. to record a vendor incident. */
  inTransaction?: (tx: Tx) => Promise<void>;
}

export interface CancelledOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  wasPaid: boolean;
  previousStatus: OrderStatus;
  vendorId: string;
  customerUserId: string;
  vendorUserId: string;
  riderUserId: string | null;
}

/**
 * Cancels an order: status → CANCELLED, reserved stock restored, assigned rider released, and a
 * paid order refunded as store credit. Throws OrderActionError if the order isn't in `from`.
 * Notifications are left to the caller since the wording depends on who cancelled.
 */
export async function cancelOrderWithRefund(input: CancelOrderInput): Promise<CancelledOrder> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        items: { select: { menuItemId: true, quantity: true } },
        customer: { select: { userId: true } },
        vendor: { select: { userId: true } },
        rider: { select: { id: true, userId: true } },
      },
    });
    if (!order) throw new OrderActionError('Order not found.', 404);
    if (!input.from.includes(order.status)) {
      throw new OrderActionError(`Order is ${order.status} and can no longer be cancelled.`);
    }

    const wasPaid = order.paymentStatus === PaymentStatus.PAID;
    const previousStatus = await applyTransition(tx, {
      orderId: order.id,
      from: input.from,
      to: OrderStatus.CANCELLED,
      actor: input.actor,
      note: input.cancelReason,
      // Guard on payment status too, so a payment landing mid-cancel isn't marked refunded unpaid.
      where: { paymentStatus: order.paymentStatus },
      data: {
        ...input.data,
        ...(input.cancelReason !== undefined ? { cancelReason: input.cancelReason } : {}),
        ...(wasPaid ? { paymentStatus: PaymentStatus.REFUNDED, creditIssued: { increment: order.totalAmount } } : {}),
        ...(order.stockReserved ? { stockReserved: false } : {}),
      },
    });
    if (!previousStatus) throw new OrderActionError('This order just changed status. Refresh and try again.');

    if (order.stockReserved) {
      await Promise.all(order.items.map((item) =>
        tx.menuItem.update({
          where: { id: item.menuItemId },
          data: { stockQuantity: { increment: item.quantity } },
        }),
      ));
    }
    if (order.rider) {
      await tx.rider.update({ where: { id: order.rider.id }, data: { isAvailable: true } });
    }
    await input.inTransaction?.(tx);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      wasPaid,
      previousStatus,
      vendorId: order.vendorId,
      customerUserId: order.customer.userId,
      vendorUserId: order.vendor.userId,
      riderUserId: order.rider?.userId ?? null,
    };
  });

  if (result.wasPaid) {
    issueCredit(result.customerUserId, result.totalAmount, input.creditReason, result.id).catch(() => {});
  }
  emitOrderStatus(result.id, OrderStatus.CANCELLED);
  return result;
}

// ─── Admin / agent order actions ────────────────────────────────────────────────

export async function adminCancelOrder(orderId: string, actor: OrderActor, reason: string): Promise<CancelledOrder> {
  const cancelled = await cancelOrderWithRefund({
    orderId,
    from: ADMIN_CANCELLABLE,
    actor,
    cancelReason: reason,
    creditReason: 'ADMIN_CANCEL_REFUND',
  });

  notifyUser(cancelled.customerUserId, {
    title: 'Order cancelled',
    body: cancelled.wasPaid
      ? `GoBuyMe support cancelled order #${cancelled.orderNumber}. ₦${cancelled.totalAmount.toLocaleString()} was added to your account as store credit.`
      : `GoBuyMe support cancelled order #${cancelled.orderNumber}.`,
    type: 'order',
    data: { orderId: cancelled.id },
  }).catch(() => {});
  notifyUser(cancelled.vendorUserId, {
    title: 'Order cancelled by GoBuyMe',
    body: `Order #${cancelled.orderNumber} was cancelled by GoBuyMe support. No action is needed.`,
    type: 'order',
    data: { orderId: cancelled.id },
  }).catch(() => {});
  if (cancelled.riderUserId) {
    notifyUser(cancelled.riderUserId, {
      title: 'Delivery cancelled',
      body: `Order #${cancelled.orderNumber} was cancelled by GoBuyMe support. You're free to take another job.`,
      type: 'order',
      data: { orderId: cancelled.id },
    }).catch(() => {});
  }
  return cancelled;
}

/** Riders who could take this order now: approved, online, active account, no delivery in progress. */
export async function getCandidateRiders(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { riderId: true, vendor: { select: { latitude: true, longitude: true } } },
  });
  if (!order) throw new OrderActionError('Order not found.', 404);

  const riders = await prisma.rider.findMany({
    where: {
      approvalStatus: 'APPROVED',
      isOnline: true,
      user: { isActive: true },
      deliveries: { none: { status: { in: ACTIVE_DELIVERY_STATUSES } } },
      ...(order.riderId ? { id: { not: order.riderId } } : {}),
    },
    select: {
      id: true, latitude: true, longitude: true, vehicleType: true, isAvailable: true, rating: true,
      user: { select: { id: true, name: true, phone: true } },
    },
    take: 100,
  });

  return rankRidersByDistance(riders, order.vendor, haversineDistance).slice(0, 15).map((r) => ({
    id: r.id,
    userId: r.user.id,
    name: r.user.name,
    phone: r.user.phone,
    vehicleType: r.vehicleType,
    isAvailable: r.isAvailable,
    rating: r.rating,
    distanceKm: r.distanceKm,
  }));
}

/** Assigns (or reassigns) a rider to a READY order. */
export async function assignRider(orderId: string, riderId: string, actor: OrderActor, note?: string | null) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNumber: true, status: true, riderId: true,
        customer: { select: { userId: true } },
        vendor: { select: { businessName: true } },
        rider: { select: { userId: true } },
      },
    });
    if (!order) throw new OrderActionError('Order not found.', 404);
    if (!canAssignRider(order.status)) {
      throw new OrderActionError(`Riders can only be assigned while the order is READY (it is ${order.status}).`);
    }
    if (order.riderId === riderId) throw new OrderActionError('This rider is already assigned to the order.');

    const rider = await tx.rider.findUnique({
      where: { id: riderId },
      select: { id: true, approvalStatus: true, userId: true, user: { select: { isActive: true, name: true } } },
    });
    if (!rider) throw new OrderActionError('Rider not found.', 404);
    if (rider.approvalStatus !== 'APPROVED' || !rider.user.isActive) {
      throw new OrderActionError('Only approved, active riders can be assigned.', 400);
    }
    const busy = await tx.order.findFirst({
      where: { riderId, status: { in: ACTIVE_DELIVERY_STATUSES } },
      select: { orderNumber: true },
    });
    if (busy) throw new OrderActionError(`${rider.user.name} is already on order #${busy.orderNumber}.`);

    const res = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.READY, riderId: order.riderId },
      data: { riderId, riderAssignedAt: new Date() },
    });
    if (res.count === 0) throw new OrderActionError('This order just changed. Refresh and try again.');

    if (order.riderId) await tx.rider.update({ where: { id: order.riderId }, data: { isAvailable: true } });
    await tx.rider.update({ where: { id: riderId }, data: { isAvailable: false } });
    await recordOrderEvent(tx, {
      orderId,
      type: OrderEventType.RIDER_ASSIGNED,
      actor,
      note,
      meta: { riderId, riderName: rider.user.name, previousRiderId: order.riderId },
    });

    return { order, rider, previousRiderUserId: order.rider?.userId ?? null };
  });

  const { order, rider, previousRiderUserId } = result;
  notifyUser(rider.userId, {
    title: 'New delivery assigned 🏍️',
    body: `GoBuyMe assigned you order #${order.orderNumber} from ${order.vendor.businessName}. Head to the vendor for pickup.`,
    type: 'order',
    data: { orderId: order.id },
  }).catch(() => {});
  if (previousRiderUserId) {
    notifyUser(previousRiderUserId, {
      title: 'Delivery reassigned',
      body: `Order #${order.orderNumber} has been reassigned to another rider. You're free to take another job.`,
      type: 'order',
      data: { orderId: order.id },
    }).catch(() => {});
  }
  notifyUser(order.customer.userId, {
    title: 'Rider assigned! 🏍️',
    body: `A rider is heading to pick up your order ${order.orderNumber}.`,
    type: 'order',
    data: { orderId: order.id },
  }).catch(() => {});
  emitOrderStatus(order.id, 'ASSIGNED');

  return { orderId: order.id, orderNumber: order.orderNumber, riderId: rider.id, riderName: rider.user.name, previousRiderId: order.riderId };
}

/** Removes the rider from a READY order so it goes back into the open jobs list. */
export async function unassignRider(orderId: string, actor: OrderActor, note?: string | null) {
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true, riderId: true, rider: { select: { userId: true } } },
    });
    if (!current) throw new OrderActionError('Order not found.', 404);
    if (!current.riderId) throw new OrderActionError('No rider is assigned to this order.');
    if (!canAssignRider(current.status)) {
      throw new OrderActionError(`A rider can only be removed before pickup (the order is ${current.status}).`);
    }

    const res = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.READY, riderId: current.riderId },
      data: { riderId: null, riderAssignedAt: null },
    });
    if (res.count === 0) throw new OrderActionError('This order just changed. Refresh and try again.');

    await tx.rider.update({ where: { id: current.riderId }, data: { isAvailable: true } });
    await recordOrderEvent(tx, {
      orderId,
      type: OrderEventType.RIDER_UNASSIGNED,
      actor,
      note,
      meta: { previousRiderId: current.riderId },
    });
    return current;
  });

  if (order.rider) {
    notifyUser(order.rider.userId, {
      title: 'Delivery unassigned',
      body: `You've been removed from order #${order.orderNumber}. You're free to take another job.`,
      type: 'order',
      data: { orderId: order.id },
    }).catch(() => {});
  }
  emitOrderStatus(order.id, OrderStatus.READY);
  return { orderId: order.id, orderNumber: order.orderNumber, previousRiderId: order.riderId };
}

export const GOODWILL_CREDIT_REASON = 'ADMIN_GOODWILL';

/** Goodwill store credit to the order's customer, capped per order (see checkGoodwillCredit). */
export async function issueGoodwillCredit(
  orderId: string,
  amount: number,
  actor: OrderActor,
  opts: { isSuperAdmin: boolean; note: string },
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, totalAmount: true, customer: { select: { userId: true } } },
  });
  if (!order) throw new OrderActionError('Order not found.', 404);

  const prior = await prisma.creditTransaction.aggregate({
    where: { orderId, reason: GOODWILL_CREDIT_REASON, type: 'CREDIT' },
    _sum: { amount: true },
  });
  const problem = checkGoodwillCredit({
    amount,
    alreadyIssued: prior._sum.amount ?? 0,
    orderTotal: order.totalAmount,
    isSuperAdmin: opts.isSuperAdmin,
  });
  if (problem) throw new OrderActionError(problem, 400);

  await issueCredit(order.customer.userId, amount, GOODWILL_CREDIT_REASON, order.id, { throwOnError: true });
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { creditIssued: { increment: amount } } }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: OrderEventType.CREDIT_ISSUED,
        actorType: actor.type,
        actorId: actor.id ?? null,
        note: opts.note.slice(0, 500),
        meta: { amount },
      },
    }),
  ]);

  return { orderId: order.id, orderNumber: order.orderNumber, amount };
}
