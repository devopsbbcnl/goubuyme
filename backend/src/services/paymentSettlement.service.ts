import { OrderActorType, OrderEventType, OrderStatus, PaymentStatus } from '@prisma/client';
import prisma from '../config/db';
import { issueCredit } from './storeCredit.service';
import { notifyUser } from './notification.service';
import { recordOrderEvent, transitionOrder } from './orderLifecycle.service';

// Applies a successful Paystack charge to its order. Shared by /payments/verify and the
// charge.success webhook — both can fire for the same payment, so every write here is guarded
// and the second caller gets 'already_settled' / 'already_credited' instead of a duplicate effect.

export type SettlementOutcome =
  | 'confirmed'         // normal path: PENDING → CONFIRMED, marked PAID
  | 'late_credited'     // order was already released as unpaid; the money went to store credit
  | 'already_credited'  // late payment that an earlier call already credited
  | 'already_settled'   // order was already PAID
  | 'not_found';

export const LATE_PAYMENT_CREDIT_REASON = 'LATE_PAYMENT_CREDIT';

export async function settleSuccessfulPayment(input: {
  orderId: string;
  reference: string;
  /** Naira actually charged, from Paystack (`amount` is in kobo there). */
  amountPaid: number | null;
  via: 'verify' | 'webhook';
}): Promise<SettlementOutcome> {
  const { orderId, reference, via } = input;

  const confirmed = await transitionOrder(prisma, {
    orderId,
    from: [OrderStatus.PENDING],
    to: OrderStatus.CONFIRMED,
    actor: { type: OrderActorType.SYSTEM },
    note: via === 'verify' ? 'Payment verified' : 'Payment confirmed (Paystack webhook)',
    where: { paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } },
    data: { paystackRef: reference, paymentStatus: PaymentStatus.PAID, paystackVerified: true },
  });
  if (confirmed) return 'confirmed';

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, orderNumber: true, status: true, paymentStatus: true, paystackRef: true,
      totalAmount: true, creditApplied: true, customer: { select: { userId: true } },
    },
  });
  if (!order) return 'not_found';
  if (order.paymentStatus === PaymentStatus.PAID) return 'already_settled';
  if (order.status !== OrderStatus.CANCELLED) return 'already_settled';
  if (order.paymentStatus === PaymentStatus.REFUNDED) return 'already_credited';

  // The order was released as unpaid (abandoned checkout, failed-payment webhook, stale sweep)
  // before this payment landed. Its stock and cart were already restored, so reviving it could
  // oversell — bank the money as store credit instead. Guarded so verify + webhook credit once.
  const amount = input.amountPaid && input.amountPaid > 0
    ? input.amountPaid
    : Math.max(0, order.totalAmount - order.creditApplied);
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: OrderStatus.CANCELLED, paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } },
    data: {
      paymentStatus: PaymentStatus.REFUNDED,
      paystackVerified: true,
      paystackRef: reference,
      creditIssued: { increment: amount },
    },
  });
  if (claimed.count === 0) return 'already_credited';

  await recordOrderEvent(prisma, {
    orderId: order.id,
    type: OrderEventType.CREDIT_ISSUED,
    actor: { type: OrderActorType.SYSTEM },
    note: 'Payment arrived after the order was cancelled',
    meta: { amount, reference, via, latePayment: true },
  });
  await issueCredit(order.customer.userId, amount, LATE_PAYMENT_CREDIT_REASON, order.id, { silent: true });
  notifyUser(order.customer.userId, {
    title: 'Payment added as store credit',
    body: `Your payment for order #${order.orderNumber} came through after the order had been cancelled, so ₦${amount.toLocaleString()} was added to your GoBuyMe store credit.`,
    type: 'store_credit',
    data: { orderId: order.id, amount },
  }).catch(() => {});
  return 'late_credited';
}

export const latePaymentMessage = (amount: number | null) =>
  `This order had already been cancelled before your payment came through${amount ? `, so ₦${amount.toLocaleString()} was` : ', so the amount was'} added to your GoBuyMe store credit. You can use it on your next order.`;
