'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';
import { useRiderLiveLocation } from '@/hooks/useRiderLiveLocation';
import api from '@/services/api';

// MapLibre touches window/DOM at import time — must stay out of the server bundle.
const DeliveryMap = dynamic(() => import('@/components/rider/DeliveryMap'), { ssr: false });

// Rider-visible flow: READY (assigned, heading to vendor) → PICKED_UP (heading to
// customer) → DELIVERED. The backend has no separate "en route" status — PICKED_UP
// already means the rider is en route to the customer.
const STATUS_STEPS = ['READY', 'PICKED_UP', 'DELIVERED'] as const;
type OrderStatus = typeof STATUS_STEPS[number];
const LABEL: Record<string, string> = { READY: 'Heading to restaurant', PICKED_UP: 'Delivering to customer', DELIVERED: 'Delivered!' };
const NEXT: Record<string, { label: string; next: string }> = {
  READY: { label: 'Mark as Picked Up', next: 'PICKED_UP' },
  PICKED_UP: { label: 'Mark as Delivered', next: 'DELIVERED' },
};

// Flat shape returned by GET /riders/me/active (see rider.controller.ts getActiveDelivery)
interface ActiveOrder {
  orderId: string; orderNumber: string; status: string; fee: number; riderId: string;
  customerName: string; customerPhone: string | null; customerAddress: string;
  customerLat: number | null; customerLng: number | null;
  vendorName: string; vendorLat: number | null; vendorLng: number | null;
}

export default function RiderActivePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/riders/me/active').then(r => setOrder(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const isActive = !!order && order.status !== 'DELIVERED';
  const { position: riderPosition } = useRiderLiveLocation(order?.riderId ?? null, isActive);

  const updateStatus = async (status: string, deliveryPin?: string) => {
    if (!order) return;
    setUpdating(true);
    try {
      await api.patch(`/riders/me/orders/${order.orderId}/status`, { status, ...(deliveryPin ? { deliveryPin } : {}) });
      setOrder(o => o ? { ...o, status } : o);
      if (status === 'DELIVERED') {
        setPinModalOpen(false);
        setTimeout(() => router.push('/rider'), 2000);
      }
    } catch (err: any) {
      if (status === 'DELIVERED') {
        setPinError(err?.response?.data?.message ?? 'Failed to confirm delivery. Try again.');
      }
    } finally { setUpdating(false); }
  };

  const openPinModal = () => {
    setPin('');
    setPinError(null);
    setPinModalOpen(true);
  };

  const confirmPin = () => {
    if (pin.length !== 4) return;
    setPinError(null);
    updateStatus('DELIVERED', pin);
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
      <div className="layout-grid" style={{ gap: 24 }}>

        {/* Live map */}
        {order.vendorLat != null && order.vendorLng != null && order.customerLat != null && order.customerLng != null ? (
          <DeliveryMap
            vendor={{ lat: order.vendorLat, lng: order.vendorLng, name: order.vendorName }}
            customer={{ lat: order.customerLat, lng: order.customerLng, name: order.customerAddress }}
            riderPosition={riderPosition}
          />
        ) : (
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, border: '1px solid var(--line)' }}>
            🗺️
          </div>
        )}

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
              <div><div style={{ fontSize: 16, fontWeight: 800 }}>{order.vendorName}</div><div className="muted" style={{ fontSize: 12 }}>Order #{order.orderNumber}</div></div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--rider)' }}>+₦{order.fee?.toLocaleString()}</div>
            </div>
            <div className="route" style={{ marginBottom: 14 }}>
              <div className="pt pick"><div className="gnode"><div className="o" /><div className="ln" /></div><div className="ad"><div className="lab">Pick up</div><div className="val">{order.vendorName}</div></div></div>
              <div className="pt drop"><div className="gnode"><div className="o" /></div><div className="ad"><div className="lab">Deliver to</div><div className="val">{order.customerAddress}</div></div></div>
            </div>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>👤 {order.customerName}</div>
              {order.customerPhone && (
                <a href={`tel:${order.customerPhone}`} className="btn btn-ghost btn-sm" style={{ width: 'fit-content', display: 'flex', gap: 6 }}>
                  📞 {order.customerPhone}
                </a>
              )}
            </div>
          </div>

          {action && order.status !== 'DELIVERED' && (
            <button
              className="btn btn-rider btn-block btn-lg"
              onClick={() => (action.next === 'DELIVERED' ? openPinModal() : updateStatus(action.next))}
              disabled={updating}
            >
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

      {pinModalOpen && (
        <div className="modal-overlay" onClick={() => !updating && setPinModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Delivery PIN</h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p className="muted" style={{ fontSize: 13 }}>
                Ask the customer for their 4-digit delivery PIN and enter it to confirm the handover.
              </p>
              <input
                className={`input${pinError ? ' error' : ''}`}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                placeholder="0000"
                autoFocus
                style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: 12 }}
              />
              {pinError && <p className="input-error">{pinError}</p>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setPinModalOpen(false)} disabled={updating}>Cancel</button>
              <button className="btn btn-rider" onClick={confirmPin} disabled={pin.length !== 4 || updating}>
                {updating ? <><span className="spin" />Confirming…</> : 'Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
