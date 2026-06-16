'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface OrderDetail {
  id: string; orderNumber: string; status: string; totalAmount: number; deliveryFee: number;
  note?: string; createdAt: string; paymentMethod: string; paymentStatus: string;
  vendor: { businessName: string; address: string; logoUrl?: string };
  deliveryAddress: { label: string; street: string; city: string };
  rider?: { user: { name: string; phone: string } };
  items: { id: string; quantity: number; unitPrice: number; menuItem: { name: string; imageUrl?: string } }[];
}

const STEPS = ['PENDING', 'CONFIRMED', 'PREPARING', 'PICKED_UP', 'EN_ROUTE', 'DELIVERED'];
const STEP_LABELS: Record<string, string> = {
  PENDING: 'Order placed', CONFIRMED: 'Confirmed', PREPARING: 'Being prepared',
  PICKED_UP: 'Picked up', EN_ROUTE: 'On the way', DELIVERED: 'Delivered',
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      api.get(`/orders/${id}`).then(r => setOrder(r.data.data)).catch(() => {}).finally(() => setLoading(false));
      const poll = setInterval(() => api.get(`/orders/${id}`).then(r => setOrder(r.data.data)).catch(() => {}), 10000);
      return () => clearInterval(poll);
    }
  }, [user, id]);

  if (authLoading || !user || loading) return <div className="page-body"><div className="inner"><div className="sk" style={{ height: 400 }} /></div></div>;
  if (!order) return <div className="page-body"><div className="inner"><div className="empty"><div className="emoji">📦</div><h3>Order not found</h3></div></div></div>;

  const step = STEPS.indexOf(order.status);

  return (
    <div className="page-body">
      <div className="inner">
        <h1 className="t-page" style={{ marginBottom: 28 }}>Order #{order.orderNumber}</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Progress */}
            <div className="card card-pad">
              <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 20 }}>Order Progress</h3>
              <div className="steps">
                {STEPS.map((s, i) => {
                  const state = i < step ? 'done' : i === step ? 'active' : 'todo';
                  return (
                    <div key={s} className={`step ${state}`}>
                      <div className="bar"><i /><i /></div>
                      <div className="lbl">{STEP_LABELS[s]}</div>
                    </div>
                  );
                })}
              </div>
              {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--brand)', fontWeight: 700 }}>
                  {STEP_LABELS[order.status] ?? order.status}
                </p>
              )}
            </div>

            {/* Rider info */}
            {order.rider && (
              <div className="card card-pad">
                <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>🏍️ Your Rider</h3>
                <div className="between">
                  <span style={{ fontWeight: 700 }}>{order.rider.user.name}</span>
                  <a href={`tel:${order.rider.user.phone}`} className="btn btn-ghost btn-sm">📞 Call</a>
                </div>
              </div>
            )}

            {/* Items */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 15 }}>Items</div>
              {order.items.map(item => (
                <div key={item.id} className="between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.menuItem.name}</div>
                    <div className="muted" style={{ fontSize: 13 }}>× {item.quantity}</div>
                  </div>
                  <span style={{ fontWeight: 700 }}>₦{(item.unitPrice * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card card-pad">
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Order Summary</h3>
              <div className="between" style={{ marginBottom: 8 }}><span className="muted">Subtotal</span><span style={{ fontWeight: 700 }}>₦{(order.totalAmount - order.deliveryFee).toLocaleString()}</span></div>
              <div className="between" style={{ marginBottom: 8 }}><span className="muted">Delivery</span><span style={{ fontWeight: 700 }}>₦{order.deliveryFee.toLocaleString()}</span></div>
              <div className="divider" />
              <div className="between"><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: 'var(--brand)' }}>₦{order.totalAmount.toLocaleString()}</span></div>
            </div>

            <div className="card card-pad">
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Delivery Details</h3>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>📍 {order.deliveryAddress.street}, {order.deliveryAddress.city}</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>💳 {order.paymentMethod.replace(/_/g, ' ')}</div>
              <div className="muted" style={{ fontSize: 13 }}>🕐 {new Date(order.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
