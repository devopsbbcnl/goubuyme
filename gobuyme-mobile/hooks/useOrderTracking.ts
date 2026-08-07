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

export interface OrderLineItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  selections: { label: string; price: number }[];
}

export function useOrderTracking(orderId: string | null) {
  const { user } = useAuth();
  const [status, setStatus] = useState<OrderStatus>('PENDING');
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [deliveryPin, setDeliveryPin] = useState<string | null>(null);
  const [items, setItems] = useState<OrderLineItem[]>([]);
  const joined = useRef(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get(`/orders/${orderId}`);
      const order = res.data.data;
      if (order?.status) setStatus(order.status as OrderStatus);
      if (order?.deliveryPin) setDeliveryPin(order.deliveryPin as string);
      if (order?.rider) {
        setRider({
          name: order.rider.user?.name ?? 'Rider',
          phone: order.rider.user?.phone ?? null,
          vehicleType: order.rider.vehicleType ?? '',
          rating: order.rider.rating ?? 0,
        });
      }
      if (Array.isArray(order?.items)) {
        setItems(order.items.map((i: any) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          selections: i.selections ?? [],
        })));
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

  return { status, riderLocation, rider, deliveryPin, items };
}
