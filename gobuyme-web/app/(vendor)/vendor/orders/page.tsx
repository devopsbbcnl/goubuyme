'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface Order {
  id: string; orderNumber: string; status: string; totalAmount: number; createdAt: string;
  customer: { user: { name: string; phone: string } };
  items: { quantity: number; menuItem: { name: string } }[];
}

const STATUSES = ['', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'];
const BADGE: Record<string, string> = { PENDING: 'badge-warning', CONFIRMED: 'badge-info', PREPARING: 'badge-info', READY: 'badge-success', DELIVERED: 'badge-success', CANCELLED: 'badge-error' };
const NEXT: Record<string, string> = { PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY' };

export default function VendorOrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = () => {
    const p = filter ? `?status=${filter}` : '';
    api.get(`/vendors/me/orders${p}`).then(r => setOrders(r.data.data?.orders ?? r.data.data ?? [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const advance = async (orderId: string, status: string) => {
    setUpdating(orderId);
    try {
      await api.patch(`/vendors/me/orders/${orderId}/status`, { status });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      toast('Order updated', 'success');
    } catch { toast('Update failed', 'error'); }
    finally { setUpdating(null); }
  };

  const reject = async (orderId: string) => {
    if (!confirm('Cancel this order?')) return;
    setUpdating(orderId);
    try {
      await api.patch(`/vendors/me/orders/${orderId}/status`, { status: 'CANCELLED' });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'CANCELLED' } : o));
      toast('Order cancelled', 'info');
    } catch { toast('Update failed', 'error'); }
    finally { setUpdating(null); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 24 }}>
        <h1 className="t-page">Orders</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      <div className="chip-row" style={{ marginBottom: 24 }}>
        {STATUSES.map(s => (
          <button key={s} className={`chip${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 120 }} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="empty"><div className="emoji">📦</div><h3>No orders</h3><p>Orders matching your filter will appear here.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {orders.map(o => (
            <div key={o.id} className="card card-pad">
              <div className="between" style={{ marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 800 }}>#{o.orderNumber}</span>
                  <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>{new Date(o.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${BADGE[o.status] ?? 'badge-neutral'}`}>{o.status}</span>
                  <span style={{ fontWeight: 800, color: 'var(--brand)' }}>₦{o.totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                👤 {o.customer.user.name} · {o.customer.user.phone}
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
                {o.items.map(i => `${i.menuItem.name} ×${i.quantity}`).join(', ')}
              </div>
              {NEXT[o.status] && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => advance(o.id, NEXT[o.status])}
                    disabled={updating === o.id}
                  >
                    {updating === o.id ? <span className="spin" /> : null}
                    Mark as {NEXT[o.status].replace(/_/g, ' ')}
                  </button>
                  {o.status === 'PENDING' && (
                    <button className="btn btn-danger btn-sm" onClick={() => reject(o.id)} disabled={updating === o.id}>
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
