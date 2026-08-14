import cron from 'node-cron';
import prisma from '../config/db';
import { releaseUnpaidOrder } from '../controllers/order.controller';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@prisma/client';
import logger from '../utils/logger';

// Safety net for the mobile/web checkout flow: if the app never reports back
// (crash, dropped network, closed WebView) after a card/transfer order is
// created, the order would otherwise sit as PENDING/PENDING with reserved
// stock and a live delivery pin forever. Anything unpaid past this TTL gets
// released the same way an explicit cancel or failed-payment webhook would.
const STALE_MINUTES = 30;

export const startStaleOrderJob = (): void => {
  cron.schedule('*/10 * * * *', async () => {
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000);
    const staleOrders = await prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: { not: PaymentMethod.CASH_ON_DELIVERY },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    for (const o of staleOrders) {
      await releaseUnpaidOrder(o.id, 'Payment not completed within time window').catch((err) =>
        logger.error('Stale order release failed', err),
      );
    }
    if (staleOrders.length) {
      logger.info(`Released ${staleOrders.length} stale unpaid order(s).`);
    }
  });
  logger.info(`Stale order cleanup job scheduled (every 10m, ${STALE_MINUTES}m TTL)`);
};
