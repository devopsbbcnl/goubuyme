'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';

// Flat shape returned by GET /riders/me/stats (see rider.controller.ts getRiderDashboardStats)
interface Stats { todayDeliveries: number; todayEarnings: number; weeklyEarnings: number[]; rating: number; isOnline: boolean; nearbyJobs: number; }
// Flat shape returned by GET /riders/me/deliveries (see rider.controller.ts getRecentDeliveries)
interface Delivery { id: string; vendor: string; amount: number; time: string; rating: number; }

export default function RiderDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/riders/me/stats').catch(() => ({ data: { data: null } })),
      api.get('/riders/me/deliveries?limit=8').catch(() => ({ data: { data: [] } })),
    ]).then(([sRes, dRes]) => {
      setStats(sRes.data.data);
      setDeliveries(Array.isArray(dRes.data.data) ? dRes.data.data : []);
    }).finally(() => setLoading(false));
  }, []);

  const toggle = async () => {
    if (!stats) return;
    if (!stats.isOnline && user?.approvalStatus !== 'APPROVED') {
      toast("You can't go online until your account has been approved.", 'error');
      return;
    }
    setToggling(true);
    try {
      // Backend self-toggles isOnline/isAvailable server-side — no body needed.
      await api.patch('/riders/me/online');
      setStats(s => s ? { ...s, isOnline: !s.isOnline } : s);
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Could not update status.', 'error');
    } finally { setToggling(false); }
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
        <div className="kpi-grid">{[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 82 }} />)}</div>
      ) : (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Today's Deliveries</div><div className="kpi-val">{stats?.todayDeliveries ?? 0}</div></div>
          <div className="kpi-card"><div className="kpi-label">Today's Earnings</div><div className="kpi-val" style={{ color: 'var(--rider)' }}>₦{(stats?.todayEarnings ?? 0).toLocaleString()}</div></div>
          <div className="kpi-card"><div className="kpi-label">This Week</div><div className="kpi-val">₦{(stats?.weeklyEarnings ?? []).reduce((s, v) => s + v, 0).toLocaleString()}</div></div>
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
            <thead><tr><th>Order</th><th>Vendor</th><th>Earned</th><th>When</th></tr></thead>
            <tbody>
              {deliveries.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 700 }}>#{d.id}</td>
                  <td>{d.vendor}</td>
                  <td style={{ fontWeight: 700, color: 'var(--rider)' }}>+₦{d.amount.toLocaleString()}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{d.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
