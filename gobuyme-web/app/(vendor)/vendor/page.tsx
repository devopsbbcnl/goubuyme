'use client';

import { useState, useEffect } from 'react';
import api from '@/services/api';

interface Stats { totalOrders: number; revenue: number; pendingOrders: number; isOpen: boolean; }
interface RecentOrder { id: string; orderNumber: string; status: string; subtotal: number; createdAt: string; customer: string; }

const STATUS_BADGE: Record<string, string> = { PENDING: 'badge-warning', CONFIRMED: 'badge-info', PREPARING: 'badge-info', DELIVERED: 'badge-success', CANCELLED: 'badge-error' };

export default function VendorDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/vendors/me/stats'),
      api.get('/vendors/me/orders?limit=8'),
    ]).then(([sRes, oRes]) => {
      setStats(sRes.data.data);
      setOrders(oRes.data.data?.orders ?? oRes.data.data ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggle = async () => {
    if (!stats) return;
    setToggling(true);
    try {
      await api.patch('/vendors/me/status', { isOpen: !stats.isOpen });
      setStats(s => s ? { ...s, isOpen: !s.isOpen } : s);
    } catch {} finally { setToggling(false); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="t-page">Dashboard</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Overview of your store performance</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{stats?.isOpen ? '🟢 Store is Open' : '🔴 Store is Closed'}</span>
          <label className="switch">
            <input type="checkbox" checked={stats?.isOpen ?? false} onChange={toggle} disabled={toggling} />
            <span className="track" />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 100 }} />)}</div>
      ) : (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Total Orders</div><div className="kpi-val">{stats?.totalOrders ?? 0}</div></div>
          <div className="kpi-card"><div className="kpi-label">Revenue</div><div className="kpi-val">₦{(stats?.revenue ?? 0).toLocaleString()}</div></div>
          <div className="kpi-card"><div className="kpi-label">Pending Orders</div><div className="kpi-val" style={{ color: 'var(--warning)' }}>{stats?.pendingOrders ?? 0}</div></div>
          <div className="kpi-card"><div className="kpi-label">Store Status</div><div className="kpi-val" style={{ fontSize: 18 }}>{stats?.isOpen ? '🟢 Open' : '🔴 Closed'}</div></div>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', fontWeight: 800, fontSize: 16 }}>Recent Orders</div>
        {loading ? (
          <div style={{ padding: 20 }}>{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 44, marginBottom: 10 }} />)}</div>
        ) : orders.length === 0 ? (
          <div className="empty"><div className="emoji">📦</div><h3>No orders yet</h3><p>Orders will appear here when customers place them.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Order #</th><th>Customer</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 700 }}>#{o.orderNumber}</td>
                  <td>{o.customer}</td>
                  <td style={{ fontWeight: 700 }}>₦{(o.subtotal ?? 0).toLocaleString()}</td>
                  <td><span className={`badge ${STATUS_BADGE[o.status] ?? 'badge-neutral'}`}>{o.status}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(o.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
