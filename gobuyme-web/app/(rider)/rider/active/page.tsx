'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const STATUS_STEPS = ['ACCEPTED', 'PICKED_UP', 'EN_ROUTE', 'DELIVERED'] as const;
type OrderStatus = typeof STATUS_STEPS[number];
const LABEL: Record<string, string> = { ACCEPTED: 'Heading to restaurant', PICKED_UP: 'Order picked up', EN_ROUTE: 'Delivering to customer', DELIVERED: 'Delivered!' };
const NEXT: Record<string, { label: string; next: string }> = { ACCEPTED: { label: 'Mark as Picked Up', next: 'PICKED_UP' }, PICKED_UP: { label: 'Start Delivery', next: 'EN_ROUTE' }, EN_ROUTE: { label: 'Mark as Delivered', next: 'DELIVERED' } };

interface ActiveOrder {
  id: string; orderNumber: string; status: string; deliveryFee: number;
  vendor: { businessName: string; address: string };
  deliveryAddress: { street: string; city: string };
  customer: { user: { name: string; phone: string } };
}

export default function RiderActivePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    api.get('/riders/me/active-order').then(r => setOrder(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const updateStatus = async (status: string) => {
    if (!order) return;
    setUpdating(true);
    try {
      await api.patch(`/riders/orders/${order.id}/status`, { status });
      setOrder(o => o ? { ...o, status } : o);
      if (status === 'DELIVERED') setTimeout(() => router.push('/rider'), 2000);
    } catch {} finally { setUpdating(false); }
  };

  const step = STATUS_STEPS.indexOf(order?.status as OrderStatus);
  const action = order ? NEXT[order.status] : null;

  if (loading) return <div className="kpi-grid"><div className="sk" style={{ height: 300 }} /></div>;

  if (!order) return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 28 }}>Active Delivery</h1>
      <div className="empty">
        <div className="emoji">📭</div>
        <h3>No active delivery</h3>
        <p>Accept a job to start delivering.</p>
        <button className="btn btn-rider" style={{ marginTop: 20 }} onClick={() => router.push('/rider/jobs')}>Browse Jobs</button>
      </div>
    </div>
  );

  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 24 }}>Active Delivery</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>

        {/* Map placeholder */}
        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, border: '1px solid var(--line)' }}>
          🗺️
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Progress */}
          <div className="card card-pad">
            <div className="steps">
              {STATUS_STEPS.map((s, i) => {
                const state = i < step ? 'done' : i === step ? 'active' : 'todo';
                return <div key={s} className={`step ${state}`}><div className="bar"><i /><i /></div><div className="lbl">{LABEL[s]}</div></div>;
              })}
            </div>
            {order.status !== 'DELIVERED' && <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>{LABEL[order.status]}</p>}
          </div>

          {/* Order info */}
          <div className="card card-pad">
            <div className="between" style={{ marginBottom: 14 }}>
              <div><div style={{ fontSize: 16, fontWeight: 800 }}>{order.vendor.businessName}</div><div className="muted" style={{ fontSize: 12 }}>Order #{order.orderNumber}</div></div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--rider)' }}>+₦{order.deliveryFee?.toLocaleString()}</div>
            </div>
            <div className="route" style={{ marginBottom: 14 }}>
              <div className="pt pick"><div className="gnode"><div className="o" /><div className="ln" /></div><div className="ad"><div className="lab">Pick up</div><div className="val">{order.vendor.address}</div></div></div>
              <div className="pt drop"><div className="gnode"><div className="o" /></div><div className="ad"><div className="lab">Deliver to</div><div className="val">{order.deliveryAddress.street}, {order.deliveryAddress.city}</div></div></div>
            </div>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>👤 {order.customer.user.name}</div>
              <a href={`tel:${order.customer.user.phone}`} className="btn btn-ghost btn-sm" style={{ width: 'fit-content', display: 'flex', gap: 6 }}>
                📞 {order.customer.user.phone}
              </a>
            </div>
          </div>

          {action && order.status !== 'DELIVERED' && (
            <button className="btn btn-rider btn-block btn-lg" onClick={() => updateStatus(action.next)} disabled={updating}>
              {updating ? <><span className="spin" />Updating…</> : action.label}
            </button>
          )}
          {order.status === 'DELIVERED' && (
            <div className="card card-pad" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--rider)' }}>Delivery complete!</p>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Redirecting…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
