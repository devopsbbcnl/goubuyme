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

  socket.on('user:join', ({ userId }: { userId: string }) => {
    socket.join(`user:${userId}`);
    logger.info(`Socket ${socket.id} joined user:${userId}`);
  });

  socket.on('message:send', ({ conversationId, content }: { conversationId: string; content: string }) => {
    socket.to(`conversation:${conversationId}`).emit('message:receive', { conversationId, content, senderId: socket.handshake.auth.userId });
    logger.info(`Message sent in conversation:${conversationId}`);
  });

  socket.on('message:read', ({ conversationId }: { conversationId: string }) => {
    socket.to(`conversation:${conversationId}`).emit('message:read', { conversationId });
    logger.info(`Messages marked as read in conversation:${conversationId}`);
  });
};
