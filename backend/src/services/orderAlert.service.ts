import prisma from '../config/db';
import logger from '../utils/logger';
import { sendTelegramAlert } from './telegram.service';
import { describeOrderEvent, firstName, formatTelegramOrderAlert } from './orderAlertRules';

// Announces order progress to admins: a row in the in-app feed (Admin bell) and a Telegram post to
// the support group. Every order change already writes an OrderEvent, so this polls those rather than
// hooking each code path — a new way of changing an order is covered without anyone remembering to
// call it. OrderAlert.orderEventId is unique, so an event is announced at most once.

const adminBase = () => (process.env.ADMIN_URL ?? '').split(',')[0].trim().replace(/\/$/, '');

// How far back a tick looks. Long enough to ride out a restart, short enough that a deploy never
// replays an old day of orders into the support chat.
const LOOKBACK_MS = 15 * 60_000;
const BATCH = 100;

export const ordersChatId = (): string | undefined =>
  process.env.TELEGRAM_ORDERS_CHAT_ID || undefined;

export async function runOrderAlertTick(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const events = await prisma.orderEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
    include: {
      order: {
        select: {
          orderNumber: true, totalAmount: true, paymentMethod: true, paymentStatus: true, cancelReason: true,
          vendor: { select: { businessName: true } },
          customer: { select: { user: { select: { name: true } } } },
          rider: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!events.length) return 0;

  const done = await prisma.orderAlert.findMany({
    where: { orderEventId: { in: events.map((e) => e.id) } },
    select: { orderEventId: true },
  });
  const seen = new Set(done.map((d) => d.orderEventId));

  let announced = 0;
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    const o = ev.order;
    const orderInfo = {
      orderNumber: o.orderNumber,
      totalAmount: o.totalAmount,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      cancelReason: o.cancelReason,
      vendorName: o.vendor.businessName,
      customerFirstName: firstName(o.customer.user.name),
      riderName: o.rider?.user.name ?? null,
    };
    const content = describeOrderEvent(ev, orderInfo);
    // Quiet events still get a row so they are not re-evaluated every tick.
    let row;
    try {
      row = await prisma.orderAlert.create({
        data: {
          orderEventId: ev.id, orderId: ev.orderId, orderNumber: o.orderNumber,
          kind: content?.kind ?? 'SKIPPED', urgent: content?.urgent ?? false,
          title: content?.title ?? '', summary: content?.summary ?? '',
        },
      });
    } catch {
      continue; // another tick/instance announced it first
    }
    if (!content) continue;

    const base = adminBase();
    const sent = await sendTelegramAlert(
      formatTelegramOrderAlert(content, orderInfo, base ? `${base}/orders` : undefined),
      { chatId: ordersChatId() },
    );
    if (sent) await prisma.orderAlert.update({ where: { id: row.id }, data: { telegramSentAt: new Date() } }).catch(() => {});
    else logger.warn(`Order alert ${content.kind} #${o.orderNumber}: Telegram not delivered`);
    announced++;
  }
  return announced;
}

/** Recent announced events for the admin bell (quiet "SKIPPED" rows are excluded). */
export const listOrderAlerts = (limit = 30) =>
  prisma.orderAlert.findMany({
    where: { kind: { not: 'SKIPPED' } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, orderId: true, orderNumber: true, kind: true, urgent: true, title: true, summary: true, createdAt: true },
  });
