'use client';

import { useState, useEffect } from 'react';
import api from '@/services/api';

interface Earnings { totalEarnings: number; pendingPayouts: number; paidPayouts: number; recentPayouts: { id: string; amount: number; status: string; createdAt: string }[]; }

export default function VendorEarningsPage() {
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/vendors/me/earnings').then(r => setData(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 28 }}>Earnings</h1>
      {loading ? (
        <div className="kpi-grid">{[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 100 }} />)}</div>
      ) : (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Total Earnings</div><div className="kpi-val">₦{(data?.totalEarnings ?? 0).toLocaleString()}</div></div>
          <div className="kpi-card"><div className="kpi-label">Pending Payouts</div><div className="kpi-val" style={{ color: 'var(--warning)' }}>₦{(data?.pendingPayouts ?? 0).toLocaleString()}</div></div>
          <div className="kpi-card"><div className="kpi-label">Paid Out</div><div className="kpi-val" style={{ color: 'var(--success)' }}>₦{(data?.paidPayouts ?? 0).toLocaleString()}</div></div>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden', marginTop: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', fontWeight: 800, fontSize: 16 }}>Payout History</div>
        {loading ? (
          <div style={{ padding: 20 }}>{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 44, marginBottom: 10 }} />)}</div>
        ) : !data?.recentPayouts?.length ? (
          <div className="empty"><div className="emoji">💰</div><h3>No payouts yet</h3><p>Payouts are processed daily at 11:30 AM.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {data.recentPayouts.map(p => (
                <tr key={p.id}>
                  <td className="muted" style={{ fontSize: 13 }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 700 }}>₦{p.amount.toLocaleString()}</td>
                  <td><span className={`badge ${p.status === 'PAID' ? 'badge-success' : 'badge-warning'}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
