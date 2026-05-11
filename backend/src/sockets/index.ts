import { Server } from 'socket.io';
import { setupOrderSocket } from './orderSocket';
import { setupRiderSocket } from './riderSocket';
import logger from '../utils/logger';

export const setupSockets = (io: Server): void => {
  const ordersNs = io.of('/orders');
  const ridersNs = io.of('/riders');

  ordersNs.on('connection', (socket) => {
    logger.info(`Orders socket connected: ${socket.id}`);
    setupOrderSocket(socket, ordersNs);
    socket.on('disconnect', () => logger.info(`Orders socket disconnected: ${socket.id}`));
  });

  ridersNs.on('connection', (socket) => {
    logger.info(`Riders socket connected: ${socket.id}`);
    setupRiderSocket(socket, ridersNs);
    socket.on('disconnect', () => logger.info(`Riders socket disconnected: ${socket.id}`));
  });
};
