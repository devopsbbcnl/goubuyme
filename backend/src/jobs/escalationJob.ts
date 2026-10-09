import prisma from '../config/db';
import { OrderActorType, OrderStatus, PaymentStatus } from '@prisma/client';
import { cancelOrderWithRefund, OrderActionError } from '../services/orderLifecycle.service';
import { sendSms } from '../services/sms.service';
import { sendWhatsappMessage } from '../services/whatsapp.service';
import { notifyUser } from '../services/notification.service';
import { localTimeInZone } from '../services/storeHours.service';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

// Vendor order-response escalation: reminder → urgent → auto-cancel-with-refund. Runs every
// 10s (node-cron's 5-field syntax can't express seconds, so a plain interval is a better fit
// for this granularity than a 6-field cron expression) and mirrors staleOrderJob.ts's structure.
const POLL_MS = 10_000;
const REMINDER_MINUTES = 3;
const URGENT_MINUTES = 5;
const AUTO_CANCEL_MINUTES = 10;
const BUSINESS_HOURS_START = 6; // 6am
const BUSINESS_HOURS_END = 23; // 11pm

function isWithinBusinessHours(timezone: string): boolean {
  const { minutes } = localTimeInZone(timezone);
  const hour = Math.floor(minutes / 60);
  return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
}

async function autoCancelForNoResponse(order: {
  id: string;
  orderNumber: string;
  vendorId: string;
  customerId: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  stockReserved: boolean;
  items: { menuItemId: string; quantity: number }[];
  customer: { userId: string };
  vendor: { userId: string };
}): Promise<void> {
  let wasPaid: boolean;
  try {
    ({ wasPaid } = await cancelOrderWithRefund({
      orderId: order.id,
      // Only while still unaccepted — if the vendor accepts in the same instant, their accept wins.
      from: [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      actor: { type: OrderActorType.SYSTEM },
      cancelReason: 'no_response_timeout',
      creditReason: 'ORDER_AUTO_CANCEL_REFUND',
      data: { autoCancelledAt: new Date() },
      inTransaction: async (tx) => {
        await tx.vendorIncident.create({
          data: { vendorId: order.vendorId, orderId: order.id, incidentType: 'no_response_timeout' },
        });
      },
    }));
  } catch (err) {
    if (err instanceof OrderActionError) return; // vendor acted (or customer cancelled) in the meantime
    throw err;
  }

  notifyUser(order.customer.userId, {
    title: 'Order cancelled',
    body: wasPaid
      ? `The vendor didn't respond to order #${order.orderNumber} in time. It's been cancelled and ₦${order.totalAmount.toLocaleString()} was added as GoBuyMe store credit.`
      : `The vendor didn't respond to order #${order.orderNumber} in time. It's been cancelled.`,
    type: 'order',
    data: { orderId: order.id },
  }).catch(() => {});

  notifyUser(order.vendor.userId, {
    title: 'Order auto-cancelled',
    body: `Order #${order.orderNumber} was auto-cancelled after 10 minutes of no response. This affects your response-rate score.`,
    type: 'order',
    data: { orderId: order.id },
  }).catch(() => {});
}

export const startEscalationJob = (): void => {
  setInterval(async () => {
    try {
      const candidates = await prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
          vendorNotifiedAt: { not: null },
          vendorViewedAt: null,
          autoCancelledAt: null,
        },
        include: {
          items: { select: { menuItemId: true, quantity: true } },
          customer: { select: { userId: true } },
          vendor: { select: { userId: true, timezone: true, user: { select: { phone: true } } } },
        },
      });

      for (const order of candidates) {
        if (!order.vendorNotifiedAt) continue;
        if (!isWithinBusinessHours(order.vendor.timezone)) continue;

        const elapsedMinutes = (Date.now() - order.vendorNotifiedAt.getTime()) / 60_000;
        const vendorPhone = order.vendor.user.phone;

        if (elapsedMinutes >= AUTO_CANCEL_MINUTES) {
          await autoCancelForNoResponse(order as any).catch((err) =>
            recordError('escalation-job', 'Auto-cancel failed', err, { orderId: order.id }),
          );
          continue;
        }

        if (elapsedMinutes >= URGENT_MINUTES && !order.urgentSentAt) {
          if (vendorPhone) {
            // WhatsApp first — it's cheaper than SMS. Only fall back to SMS if WhatsApp
            // isn't configured or the send actually fails (unread/undelivered WhatsApp).
            const delivered = await sendWhatsappMessage(vendorPhone, 'urgent_order_alert', [order.orderNumber]);
            if (!delivered) {
              sendSms(vendorPhone, `GoBuyMe URGENT: Order #${order.orderNumber} expires in 5 min. Accept now or it auto-cancels with a customer refund.`).catch(() => {});
            }
          }
          await prisma.order.update({ where: { id: order.id }, data: { urgentSentAt: new Date() } });
        } else if (elapsedMinutes >= REMINDER_MINUTES && !order.reminderSentAt) {
          if (vendorPhone) {
            const delivered = await sendWhatsappMessage(vendorPhone, 'order_reminder_alert', [order.orderNumber]);
            if (!delivered) {
              sendSms(vendorPhone, `GoBuyMe reminder: Order #${order.orderNumber} is still waiting for you to accept.`).catch(() => {});
            }
          }
          await prisma.order.update({ where: { id: order.id }, data: { reminderSentAt: new Date() } });
        }
      }
    } catch (err) {
      recordError('escalation-job', 'Escalation tick failed', err);
    }
  }, POLL_MS);
  logger.info(`Vendor order escalation job scheduled (every ${POLL_MS / 1000}s)`);
};
