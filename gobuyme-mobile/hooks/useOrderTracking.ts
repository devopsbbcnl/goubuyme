import { useEffect, useState, useRef, useCallback } from 'react';
import { connectSockets } from '@/services/socketService';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

export type OrderStatus =
  | 'PENDING' | 'CONFIRMED' | 'ACCEPTED' | 'PREPARING'
  | 'READY' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface RiderLocation { lat: number; lng: number }
export interface GeoPoint { lat: number; lng: number; name?: string }

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
  const [vendorLocation, setVendorLocation] = useState<GeoPoint | null>(null);
  const [customerLocation, setCustomerLocation] = useState<GeoPoint | null>(null);
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [deliveryPin, setDeliveryPin] = useState<string | null>(null);
  const [items, setItems] = useState<OrderLineItem[]>([]);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [cancellableUntil, setCancellableUntil] = useState<string | null>(null);
  const [isCancellable, setIsCancellable] = useState(false);
  const joined = useRef(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get(`/orders/${orderId}`);
      const order = res.data.data;
      if (order?.status) setStatus(order.status as OrderStatus);
      if (order?.createdAt) setCreatedAt(order.createdAt as string);
      setCancellableUntil((order?.cancellableUntil as string) ?? null);
      setIsCancellable(Boolean(order?.isCancellable));
      if (order?.deliveryPin) setDeliveryPin(order.deliveryPin as string);
      if (typeof order?.vendor?.latitude === 'number' && typeof order?.vendor?.longitude === 'number') {
        setVendorLocation({
          lat: order.vendor.latitude,
          lng: order.vendor.longitude,
          name: order.vendor.businessName ?? 'Vendor',
        });
      }
      if (typeof order?.deliveryLatitude === 'number' && typeof order?.deliveryLongitude === 'number') {
        setCustomerLocation({
          lat: order.deliveryLatitude,
          lng: order.deliveryLongitude,
          name: order.deliveryAddress ?? 'Delivery address',
        });
      }
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
      // Any transition out of PENDING/CONFIRMED (e.g. the vendor accepting) ends the
      // customer's cancellation window — re-fetch so isCancellable reflects that.
      if (s !== 'PENDING' && s !== 'CONFIRMED') {
        setIsCancellable(false);
      }
      fetchOrder();
    };
    const onLocation = ({ lat, lng }: RiderLocation) => setRiderLocation({ lat, lng });

    ordersSocket.on('order:status', onStatus);
    ordersSocket.on('rider:location', onLocation);

    return () => {
      ordersSocket.off('order:status', onStatus);
      ordersSocket.off('rider:location', onLocation);
    };
  }, [orderId, user?.token, fetchOrder]);

  return {
    status,
    riderLocation,
    vendorLocation,
    customerLocation,
    rider,
    deliveryPin,
    items,
    createdAt,
    cancellableUntil,
    isCancellable,
    refresh: fetchOrder,
  };
}
