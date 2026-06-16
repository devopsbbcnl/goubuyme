'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/services/api';

interface Stats { totalDeliveries: number; todayEarnings: number; weekEarnings: number; isOnline: boolean; }
interface Delivery { id: string; orderNumber: string; deliveryFee: number; createdAt: string; vendor: { businessName: string }; }

export default function RiderDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/riders/me/stats').catch(() => ({ data: { data: null } })),
      api.get('/riders/me/earnings?period=recent').catch(() => ({ data: { data: [] } })),
    ]).then(([sRes, eRes]) => {
      setStats(sRes.data.data);
      const raw = eRes.data.data;
      const list = Array.isArray(raw?.deliveries) ? raw.deliveries : Array.isArray(raw) ? raw : [];
      setDeliveries(list);
    }).finally(() => setLoading(false));
  }, []);

  const toggle = async () => {
    if (!stats) return;
    setToggling(true);
    try {
      await api.patch('/riders/me/status', { isOnline: !stats.isOnline });
      setStats(s => s ? { ...s, isOnline: !s.isOnline } : s);
    } catch {} finally { setToggling(false); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="t-page">Dashboard</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Your delivery overview</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{stats?.isOnline ? '🟢 Online' : '🔴 Offline'}</span>
          <label className="switch">
            <input type="checkbox" checked={stats?.isOnline ?? false} onChange={toggle} disabled={toggling} />
            <span className="track" />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="kpi-grid">{[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 100 }} />)}</div>
      ) : (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Total Deliveries</div><div className="kpi-val">{stats?.totalDeliveries ?? 0}</div></div>
          <div className="kpi-card"><div className="kpi-label">Today's Earnings</div><div className="kpi-val" style={{ color: 'var(--rider)' }}>₦{(stats?.todayEarnings ?? 0).toLocaleString()}</div></div>
          <div className="kpi-card"><div className="kpi-label">This Week</div><div className="kpi-val">₦{(stats?.weekEarnings ?? 0).toLocaleString()}</div></div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <Link href="/rider/jobs" className="btn btn-primary" style={{ flex: 1, height: 52 }}>🏍️ Browse Jobs</Link>
        <Link href="/rider/active" className="btn btn-ghost" style={{ flex: 1, height: 52 }}>📍 Active Delivery</Link>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', fontWeight: 800, fontSize: 16 }}>Recent Deliveries</div>
        {loading ? (
          <div style={{ padding: 20 }}>{[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 44, marginBottom: 10 }} />)}</div>
        ) : deliveries.length === 0 ? (
          <div className="empty"><div className="emoji">🏍️</div><h3>No deliveries yet</h3><p>Accept a job to start earning.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Order</th><th>Vendor</th><th>Earned</th><th>Date</th></tr></thead>
            <tbody>
              {deliveries.slice(0, 8).map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 700 }}>#{d.orderNumber}</td>
                  <td>{d.vendor.businessName}</td>
                  <td style={{ fontWeight: 700, color: 'var(--rider)' }}>+₦{d.deliveryFee.toLocaleString()}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(d.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
