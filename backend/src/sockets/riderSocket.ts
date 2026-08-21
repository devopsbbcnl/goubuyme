import { Socket, Namespace } from 'socket.io';
import prisma from '../config/db';
import { recordError } from '../utils/recordError';

export const setupRiderSocket = (socket: Socket, ns: Namespace): void => {
  socket.on('rider:join', ({ riderId }: { riderId: string }) => {
    socket.join(`rider:${riderId}`);
  });

  socket.on(
    'rider:updateLocation',
    async ({ riderId, latitude, longitude }: { riderId: string; latitude: number; longitude: number }) => {
      try {
        await prisma.rider.update({ where: { id: riderId }, data: { latitude, longitude } });
        ns.emit('rider:location', { riderId, lat: latitude, lng: longitude });
      } catch (err) {
        recordError('rider-socket', 'rider:updateLocation failed', err, { riderId });
      }
    },
  );

  socket.on('order:accept', ({ orderId }: { orderId: string }) => {
    socket.to(`order:${orderId}`).emit('order:assigned', { orderId });
  });
};
