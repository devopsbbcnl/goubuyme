'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import api from '@/services/api';

interface OrderDetail {
  id: string; orderNumber: string; status: string; totalAmount: number; deliveryFee: number;
  note?: string; createdAt: string; paymentMethod: string; paymentStatus: string;
  deliveryPin?: string;
  isCancellable?: boolean;
  cancellableUntil?: string | null;
  vendor: { businessName: string; address: string; logoUrl?: string };
  deliveryAddress: string;
  customer?: { user: { phone?: string } };
  rider?: { user: { name: string; phone: string } };
  items: {
    id: string;
    quantity: number;
    price: number;
    name: string;
    menuItem?: { image?: string };
    selections?: { label: string; price: number }[] | null;
  }[];
}

const STEPS = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED'];
const STEP_LABELS: Record<string, string> = {
  PENDING: 'Order placed', CONFIRMED: 'Confirmed', PREPARING: 'Being prepared',
  READY: 'Ready for pickup', PICKED_UP: 'On the way', DELIVERED: 'Delivered',
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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

  const cancelWindowMs = order?.cancellableUntil ? new Date(order.cancellableUntil).getTime() - now : 0;
  const canCancel = Boolean(order?.isCancellable) && cancelWindowMs > 0;

  // Tick every second while the cancellation window is open so the countdown stays
  // live and the button hides the instant it lapses.
  useEffect(() => {
    if (!order?.isCancellable || !order?.cancellableUntil) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [order?.isCancellable, order?.cancellableUntil]);

  const handleCancel = useCallback(async () => {
    const ok = await confirmDialog(
      "You can cancel free of charge while the vendor hasn't accepted your order. Any payment made is refunded to your GoBuyMe store credit.",
      { title: 'Cancel this order?', confirmLabel: 'Cancel Order', cancelLabel: 'Keep order' },
    );
    if (!ok) return;
    setCancelling(true);
    try {
      await api.post(`/orders/${id}/cancel`, { reason: 'Cancelled by customer' });
      const r = await api.get(`/orders/${id}`);
      setOrder(r.data.data);
      toast('Order cancelled — any payment was refunded to your store credit', 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message ?? 'This order can no longer be cancelled', 'error');
      api.get(`/orders/${id}`).then(r => setOrder(r.data.data)).catch(() => {});
    } finally {
      setCancelling(false);
    }
  }, [confirmDialog, id, toast]);

  const cancelCountdown = (() => {
    const total = Math.max(0, Math.floor(cancelWindowMs / 1000));
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
  })();

  if (authLoading || !user || loading) return <div className="page-body"><div className="inner"><div className="sk" style={{ height: 400 }} /></div></div>;
  if (!order) return <div className="page-body"><div className="inner"><div className="empty"><div className="emoji">📦</div><h3>Order not found</h3></div></div></div>;

  const step = STEPS.indexOf(order.status);

  return (
    <div className="page-body">
      <div className="inner">
        <h1 className="t-page" style={{ marginBottom: 28 }}>Order #{order.orderNumber}</h1>
        <div className="layout-grid" style={{ gap: 24 }}>

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

            {/* Cancel window */}
            {(canCancel || cancelling) && (
              <div className="card card-pad">
                <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Changed your mind?</h3>
                <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  {cancelling
                    ? 'Cancelling your order…'
                    : `You can cancel this order for the next ${cancelCountdown}, until the vendor accepts it. Any payment is refunded to your store credit.`}
                </p>
                <button className="btn btn-danger" disabled={cancelling} onClick={handleCancel}>
                  {cancelling ? <span className="spin" /> : 'Cancel Order'}
                </button>
              </div>
            )}

            {/* Delivery PIN */}
            {order.deliveryPin && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
              <div className="card card-pad" style={{ textAlign: 'center' }}>
                <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>🔒 Delivery PIN</h3>
                <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  Share this PIN with your rider only when your order arrives.
                </p>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 16, color: 'var(--brand)' }}>
                  {order.deliveryPin.split('').join('  ')}
                </div>
              </div>
            )}

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
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    {(item.selections ?? []).map((s, si) => (
                      <div key={si} className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        + {s.label}{s.price > 0 ? ` (₦${s.price.toLocaleString()})` : ''}
                      </div>
                    ))}
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>× {item.quantity}</div>
                  </div>
                  <span style={{ fontWeight: 700 }}>₦{(item.price * item.quantity).toLocaleString()}</span>
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
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>📍 {order.deliveryAddress}</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                📞 {order.customer?.user.phone || 'No phone on file'}
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>💳 {order.paymentMethod.replace(/_/g, ' ')}</div>
              <div className="muted" style={{ fontSize: 13 }}>🕐 {new Date(order.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
