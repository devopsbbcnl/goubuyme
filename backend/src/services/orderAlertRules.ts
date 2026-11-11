import { OrderEventType, OrderStatus, PaymentStatus } from '@prisma/client';

// Pure rules for admin order alerts: which order events deserve a ping, and what they say.
// No database or network here so the wording and the "stay quiet" cases are unit-testable.

export type OrderAlertKind =
  | 'NEW_ORDER'
  | 'ACCEPTED'
  | 'READY'
  | 'RIDER_ASSIGNED'
  | 'RIDER_UNASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'CREDIT_ISSUED';

export interface AlertEventInput {
  type: OrderEventType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  note: string | null;
  meta: unknown;
}

export interface AlertOrderInput {
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string | null;
  paymentStatus: PaymentStatus;
  cancelReason: string | null;
  vendorName: string;
  customerFirstName: string;
  riderName: string | null;
}

export interface OrderAlertContent {
  kind: OrderAlertKind;
  /** Needs a person's eyes now (cancellations, a rider dropped off a job). */
  urgent: boolean;
  emoji: string;
  title: string;
  /** One plain-text line for the in-app feed. */
  summary: string;
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

const PAYMENT_LABEL: Record<string, string> = {
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  PAYSTACK_USSD: 'USSD',
  CASH_ON_DELIVERY: 'Cash on delivery',
};
export const paymentLabel = (method: string | null): string =>
  (method && PAYMENT_LABEL[method]) || (method ?? 'Unknown');

export const firstName = (full: string | null | undefined): string =>
  (full ?? '').trim().split(/\s+/)[0] || 'Customer';

/**
 * Decides whether an order event should alert admins. Returns null to stay quiet.
 *
 * Online-payment orders are created PENDING before the customer pays, so creation alone is not a
 * "new order" — the alert fires when payment confirms it. Likewise an unpaid PENDING order that is
 * cancelled is an abandoned checkout, not something support needs to chase.
 */
export function describeOrderEvent(event: AlertEventInput, order: AlertOrderInput): OrderAlertContent | null {
  const n = `#${order.orderNumber}`;
  const meta = (event.meta && typeof event.meta === 'object' ? event.meta : {}) as Record<string, unknown>;

  if (event.type === OrderEventType.RIDER_ASSIGNED) {
    const rider = (typeof meta.riderName === 'string' && meta.riderName) || order.riderName || 'A rider';
    return { kind: 'RIDER_ASSIGNED', urgent: false, emoji: '🏍️', title: `Rider assigned ${n}`, summary: `${rider} will deliver ${n} from ${order.vendorName}` };
  }
  if (event.type === OrderEventType.RIDER_UNASSIGNED) {
    return { kind: 'RIDER_UNASSIGNED', urgent: true, emoji: '⚠️', title: `Rider removed ${n}`, summary: `${n} from ${order.vendorName} has no rider again` };
  }
  if (event.type === OrderEventType.CREDIT_ISSUED) {
    const amount = typeof meta.amount === 'number' ? ` of ${naira(meta.amount)}` : '';
    return { kind: 'CREDIT_ISSUED', urgent: false, emoji: '💳', title: `Credit issued ${n}`, summary: `Store credit${amount} issued on ${n}` };
  }
  if (event.type !== OrderEventType.STATUS_CHANGED || !event.toStatus) return null;

  switch (event.toStatus) {
    case OrderStatus.CONFIRMED:
      // Only a first confirmation: created already-confirmed (cash / credit) or confirmed by payment.
      if (event.fromStatus !== null && event.fromStatus !== OrderStatus.PENDING) return null;
      return {
        kind: 'NEW_ORDER', urgent: false, emoji: '🆕', title: `New order ${n}`,
        summary: `${order.customerFirstName} ordered from ${order.vendorName} · ${naira(order.totalAmount)} · ${paymentLabel(order.paymentMethod)}`,
      };
    case OrderStatus.PREPARING:
      return { kind: 'ACCEPTED', urgent: false, emoji: '👨‍🍳', title: `Vendor accepted ${n}`, summary: `${order.vendorName} is preparing ${n}` };
    case OrderStatus.READY:
      return { kind: 'READY', urgent: false, emoji: '📦', title: `Ready for pickup ${n}`, summary: `${n} is ready at ${order.vendorName}` };
    case OrderStatus.PICKED_UP:
      return { kind: 'PICKED_UP', urgent: false, emoji: '🛍️', title: `Picked up ${n}`, summary: `${order.riderName ?? 'The rider'} collected ${n} from ${order.vendorName}` };
    case OrderStatus.IN_TRANSIT:
      return { kind: 'IN_TRANSIT', urgent: false, emoji: '🚚', title: `On the way ${n}`, summary: `${n} is on its way to ${order.customerFirstName}` };
    case OrderStatus.DELIVERED:
      return { kind: 'DELIVERED', urgent: false, emoji: '✅', title: `Delivered ${n}`, summary: `${n} was delivered to ${order.customerFirstName}` };
    case OrderStatus.CANCELLED: {
      const unpaidPending = event.fromStatus === OrderStatus.PENDING
        && order.paymentStatus !== PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.REFUNDED;
      if (unpaidPending) return null;
      const why = event.note || order.cancelReason;
      return {
        kind: 'CANCELLED', urgent: true, emoji: '❌', title: `Cancelled ${n}`,
        summary: `${n} from ${order.vendorName} was cancelled${why ? `: ${why.slice(0, 120)}` : ''}`,
      };
    }
    default:
      return null;
  }
}

const esc = (raw: string) => raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Telegram HTML for a support group. Deliberately leaves out phone numbers and addresses:
 * a group chat is not where personal data belongs. Support opens the order in the console.
 */
export function formatTelegramOrderAlert(
  content: OrderAlertContent,
  order: AlertOrderInput,
  adminUrl?: string,
): string {
  const lines = [
    `${content.emoji} <b>${esc(content.title)}</b>${content.urgent ? '  🚨' : ''}`,
    esc(content.summary),
  ];
  const facts: string[] = [`Vendor: ${esc(order.vendorName)}`, `Total: ${naira(order.totalAmount)}`];
  if (order.riderName) facts.push(`Rider: ${esc(order.riderName)}`);
  lines.push('', facts.join(' · '));
  if (adminUrl) lines.push(`<a href="${esc(adminUrl)}">Open in Admin → Orders</a>`);
  return lines.join('\n');
}
