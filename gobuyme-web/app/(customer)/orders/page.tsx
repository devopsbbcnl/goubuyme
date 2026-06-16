'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface Order { id: string; orderNumber: string; status: string; totalAmount: number; createdAt: string; vendor: { businessName: string; logoUrl?: string }; }

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'badge-warning', CONFIRMED: 'badge-info', PREPARING: 'badge-info',
  PICKED_UP: 'badge-info', EN_ROUTE: 'badge-info', DELIVERED: 'badge-success',
  CANCELLED: 'badge-error',
};

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      api.get('/orders').then(r => setOrders(r.data.data ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="page-body">
      <div className="inner">
        <h1 className="t-page" style={{ marginBottom: 28 }}>Your Orders</h1>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 100, borderRadius: 8 }} />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="empty">
            <div className="emoji">📦</div>
            <h3>No orders yet</h3>
            <p>When you place an order it will appear here.</p>
            <Link href="/vendors" className="btn btn-primary" style={{ marginTop: 24 }}>Order Now</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {orders.map(o => (
              <Link key={o.id} href={`/orders/${o.id}`} className="card" style={{ display: 'flex', gap: 16, padding: 20, alignItems: 'center' }}>
                {o.vendor.logoUrl ? <img src={o.vendor.logoUrl} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} /> : <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏪</div>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{o.vendor.businessName}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>#{o.orderNumber} · {new Date(o.createdAt).toLocaleDateString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: 'var(--brand)', marginBottom: 6 }}>₦{o.totalAmount.toLocaleString()}</div>
                  <span className={`badge ${STATUS_COLOR[o.status] ?? 'badge-neutral'}`}>{o.status.replace(/_/g, ' ')}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
