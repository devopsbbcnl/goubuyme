import { Socket } from 'socket.io';
import prisma from '../config/db';
import logger from '../utils/logger';
import { getIdentity } from './auth';

/**
 * Clients may only *listen* on /orders. Every state change (status updates, chat
 * messages, new orders) is emitted by the REST controllers after they validate and
 * persist it, so there are deliberately no client→server relay events here: those
 * used to let any connected socket fake order statuses or chat senders.
 *
 * Personal rooms (user:, vendor:) are joined automatically at connection time from
 * the verified identity — see sockets/index.ts.
 */
export const setupOrderSocket = (socket: Socket): void => {
  socket.on('order:join', async ({ orderId }: { orderId: string }) => {
    const identity = getIdentity(socket);
    if (!identity || typeof orderId !== 'string') return;

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true, vendorId: true, riderId: true },
      });
      if (!order) return;

      const isParty =
        (identity.customerId && order.customerId === identity.customerId) ||
        (identity.vendorId && order.vendorId === identity.vendorId) ||
        (identity.riderId && order.riderId === identity.riderId);
      if (!isParty) {
        logger.warn(`Socket ${socket.id} (user ${identity.userId}) denied join for order:${orderId}`);
        return;
      }

      socket.join(`order:${orderId}`);
    } catch (err) {
      logger.error(`order:join failed for ${orderId}: ${(err as Error).message}`);
    }
  });
};
