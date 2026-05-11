import { Socket, Namespace } from 'socket.io';
import logger from '../utils/logger';

export const setupOrderSocket = (socket: Socket, _ns: Namespace): void => {
  socket.on('order:join', ({ orderId }: { orderId: string }) => {
    socket.join(`order:${orderId}`);
    logger.info(`Socket ${socket.id} joined order:${orderId}`);
  });

  socket.on('order:updateStatus', ({ orderId, status }: { orderId: string; status: string }) => {
    socket.to(`order:${orderId}`).emit('order:status', { orderId, status });
  });

  socket.on('vendor:join', ({ vendorId }: { vendorId: string }) => {
    socket.join(`vendor:${vendorId}`);
  });
};
