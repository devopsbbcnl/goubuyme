import prisma from '../config/db';
import { getIO } from '../config/socket';
import { notifyUser } from './notification.service';
import { sendSms } from './sms.service';
import { sendWebPush } from './webPush.service';
import { sendVendorNewOrderEmail } from './email.service';
import { vendorOrderContacts } from './vendorRecipients';
import { recordError } from '../utils/recordError';

// Tells the vendor a new order is waiting. Called once per order, and only when the order is
// really theirs to prepare: at creation for cash-on-delivery / store-credit orders, and from
// settleSuccessfulPayment for card/transfer orders once Paystack confirms the money. Every
// channel is a "now" channel (socket, push, browser push, SMS) except email, which is the
// slower backup. None of it may block or fail the caller.
export async function alertVendorOfNewOrder(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return;

    try {
      getIO().of('/orders').to(`vendor:${order.vendorId}`).emit('order:new', { order });
    } catch { /* socket may not be connected */ }

    const payload = {
      role: 'VENDOR' as const,
      title: 'New order! 🔔',
      body: `Order #${order.orderNumber} — ₦${order.totalAmount.toLocaleString()}. Tap to review and accept.`,
      type: 'order',
      data: { orderId: order.id },
    };

    // A branch with its own manager alerts the manager's devices (and the owner too, unless they
    // turned that off); everything else alerts the owner as before.
    const contacts = await vendorOrderContacts(order.vendorId);
    for (const c of contacts) {
      notifyUser(c.userId, payload).catch(() => {});
      sendWebPush(c.userId, { ...payload, requireInteraction: true }).catch(() => {});
      if (c.phone) {
        sendSms(c.phone, `GoBuyMe: New order #${order.orderNumber} (₦${order.totalAmount.toLocaleString()}). Open the app to accept.`).catch(() => {});
      }
      if (c.email && !c.email.endsWith('.invalid')) {
        sendVendorNewOrderEmail(c.email, order.orderNumber, order.totalAmount).catch(() => {});
      }
    }
  } catch (err) {
    recordError('vendor-order-alert', 'Failed to alert vendor of new order', err, { orderId });
  }
}
