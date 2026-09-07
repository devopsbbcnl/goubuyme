'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import Image from 'next/image';
import api from '@/services/api';

interface Order {
  id: string; orderNumber: string; status: string; totalAmount: number; createdAt: string;
  vendor: { businessName: string; logoUrl?: string };
  isCancellable?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'badge-warning', CONFIRMED: 'badge-info', PREPARING: 'badge-info',
  PICKED_UP: 'badge-info', EN_ROUTE: 'badge-info', DELIVERED: 'badge-success',
  CANCELLED: 'badge-error',
};

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  const load = useCallback(() => {
    return api.get('/orders').then(r => setOrders(r.data.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      load().finally(() => setLoading(false));
    }
  }, [user, load]);

  const handleCancel = useCallback(async (orderId: string) => {
    const ok = await confirmDialog(
      "You can cancel free of charge while the vendor hasn't accepted your order. Any payment made is refunded to your GoBuyMe store credit.",
      { title: 'Cancel this order?', confirmLabel: 'Cancel Order', cancelLabel: 'Keep order' },
    );
    if (!ok) return;
    setCancellingId(orderId);
    try {
      await api.post(`/orders/${orderId}/cancel`, { reason: 'Cancelled by customer' });
      await load();
      toast('Order cancelled — any payment was refunded to your store credit', 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message ?? 'This order can no longer be cancelled', 'error');
      load();
    } finally {
      setCancellingId(null);
    }
  }, [confirmDialog, load, toast]);

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
              <div key={o.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <Link href={`/orders/${o.id}`} className="card" style={{ display: 'flex', gap: 16, padding: 20, alignItems: 'center' }}>
                  {o.vendor.logoUrl ? <Image src={o.vendor.logoUrl} alt="" width={52} height={52} style={{ borderRadius: 8, objectFit: 'cover' }} /> : <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏪</div>}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{o.vendor.businessName}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>#{o.orderNumber} · {new Date(o.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--brand)', marginBottom: 6 }}>₦{o.totalAmount.toLocaleString()}</div>
                    <span className={`badge ${STATUS_COLOR[o.status] ?? 'badge-neutral'}`}>{o.status.replace(/_/g, ' ')}</span>
                  </div>
                </Link>
                {o.isCancellable && (
                  <button
                    className="btn btn-danger btn-sm"
                    style={{ alignSelf: 'flex-start', marginTop: 8 }}
                    disabled={cancellingId === o.id}
                    onClick={() => handleCancel(o.id)}
                  >
                    {cancellingId === o.id ? <span className="spin" /> : 'Cancel Order'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
