import { Server, Socket } from 'socket.io';
import { setupOrderSocket } from './orderSocket';
import { setupRiderSocket } from './riderSocket';
import { socketAuth, getIdentity } from './auth';
import logger from '../utils/logger';

export const setupSockets = (io: Server): void => {
  const ordersNs = io.of('/orders');
  const ridersNs = io.of('/riders');

  ordersNs.use(socketAuth);
  ridersNs.use(socketAuth);

  ordersNs.on('connection', (socket: Socket) => {
    const identity = getIdentity(socket);
    logger.info(`Orders socket connected: ${socket.id} (${identity ? `user ${identity.userId}` : 'guest'})`);

    // Personal rooms come from the verified identity, never from client input.
    if (identity) {
      socket.join(`user:${identity.userId}`);
      if (identity.vendorId) socket.join(`vendor:${identity.vendorId}`);
    }

    setupOrderSocket(socket);
    socket.on('disconnect', () => logger.info(`Orders socket disconnected: ${socket.id}`));
  });

  ridersNs.on('connection', (socket: Socket) => {
    const identity = getIdentity(socket);
    logger.info(`Riders socket connected: ${socket.id} (${identity ? `user ${identity.userId}` : 'guest'})`);

    if (identity?.riderId) socket.join(`rider:${identity.riderId}`);

    setupRiderSocket(socket);
    socket.on('disconnect', () => logger.info(`Riders socket disconnected: ${socket.id}`));
  });
};
