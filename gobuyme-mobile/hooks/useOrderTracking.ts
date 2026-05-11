import { useEffect, useState, useRef, useCallback } from 'react';
import { connectSockets } from '@/services/socketService';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

export type OrderStatus =
  | 'PENDING' | 'CONFIRMED' | 'ACCEPTED' | 'PREPARING'
  | 'READY' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface RiderLocation { lat: number; lng: number }

export interface RiderInfo {
  name: string;
  phone: string | null;
  vehicleType: string;
  rating: number;
}

export function useOrderTracking(orderId: string | null) {
  const { user } = useAuth();
  const [status, setStatus] = useState<OrderStatus>('PENDING');
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const joined = useRef(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get(`/orders/${orderId}`);
      const order = res.data.data;
      if (order?.status) setStatus(order.status as OrderStatus);
      if (order?.rider) {
        setRider({
          name: order.rider.user?.name ?? 'Rider',
          phone: order.rider.user?.phone ?? null,
          vehicleType: order.rider.vehicleType ?? '',
          rating: order.rider.rating ?? 0,
        });
      }
    } catch { /* use socket-only fallback */ }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (!orderId) return;

    const { ordersSocket } = connectSockets(user?.token ?? undefined);

    if (!joined.current) {
      ordersSocket.emit('order:join', { orderId });
      joined.current = true;
    }

    const onStatus = ({ status: s }: { status: OrderStatus }) => {
      setStatus(s);
      if (s === 'PICKED_UP' || s === 'IN_TRANSIT') {
        fetchOrder();
      }
    };
    const onLocation = ({ lat, lng }: RiderLocation) => setRiderLocation({ lat, lng });

    ordersSocket.on('order:status', onStatus);
    ordersSocket.on('rider:location', onLocation);

    return () => {
      ordersSocket.off('order:status', onStatus);
      ordersSocket.off('rider:location', onLocation);
    };
  }, [orderId, user?.token, fetchOrder]);

  return { status, riderLocation, rider };
}
