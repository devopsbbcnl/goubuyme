import { OrderStatus } from '@prisma/client';
import prisma from '../config/db';
import { getIO } from '../config/socket';

// Statuses during which the customer of an order may see the assigned rider moving.
const TRACKABLE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY,
  OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT,
];

export const isValidCoordinate = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' && typeof lng === 'number' &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/**
 * Persists a rider's latest position and fans it out ONLY to parties entitled to
 * it: the rider's own room on /riders, and the order rooms of that rider's active
 * deliveries on /orders (where the customer tracking screen listens). Never a
 * namespace-wide broadcast.
 */
export const publishRiderLocation = async (riderId: string, lat: number, lng: number): Promise<void> => {
  await prisma.rider.update({ where: { id: riderId }, data: { latitude: lat, longitude: lng } });

  const io = getIO();
  io.of('/riders').to(`rider:${riderId}`).emit('rider:location', { riderId, lat, lng });

  const activeOrders = await prisma.order.findMany({
    where: { riderId, status: { in: TRACKABLE_STATUSES } },
    select: { id: true },
  });
  const ordersNs = io.of('/orders');
  for (const { id } of activeOrders) {
    ordersNs.to(`order:${id}`).emit('rider:location', { orderId: id, lat, lng });
  }
};
