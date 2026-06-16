'use client';

import { useState, useEffect } from 'react';
import api from '@/services/api';

interface EarningData {
  today: number; week: number; month: number; allTime: number;
  pendingPayout: number;
  history: { id: string; amount: number; deliveryFee: number; orderNumber: string; createdAt: string; vendor: { businessName: string } }[];
}

const PERIODS = ['today', 'week', 'month', 'all'] as const;

export default function RiderEarningsPage() {
  const [data, setData] = useState<EarningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<typeof PERIODS[number]>('week');

  useEffect(() => {
    api.get('/riders/me/earnings').then(r => setData(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 28 }}>Earnings</h1>

      {data?.pendingPayout && data.pendingPayout > 0 ? (
        <div style={{ background: 'var(--brand-tint)', border: '1.5px solid var(--brand)', borderRadius: 'var(--r)', padding: 16, marginBottom: 24 }}>
          <div style={{ fontWeight: 800, color: 'var(--brand)' }}>💸 Payout Pending</div>
          <div className="muted" style={{ fontSize: 13 }}>₦{data.pendingPayout.toLocaleString()} will be paid out today at 11:30 AM</div>
        </div>
      ) : null}

      {loading ? (
        <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 100 }} />)}</div>
      ) : (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Today</div><div className="kpi-val" style={{ color: 'var(--rider)' }}>₦{(data?.today ?? 0).toLocaleString()}</div></div>
          <div className="kpi-card"><div className="kpi-label">This Week</div><div className="kpi-val">₦{(data?.week ?? 0).toLocaleString()}</div></div>
          <div className="kpi-card"><div className="kpi-label">This Month</div><div className="kpi-val">₦{(data?.month ?? 0).toLocaleString()}</div></div>

          <div className="kpi-card"><div className="kpi-label">All Time</div><div className="kpi-val">₦{(data?.allTime ?? 0).toLocaleString()}</div></div>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden', marginTop: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', fontWeight: 800, fontSize: 16 }}>Delivery History</div>
        {loading ? (
          <div style={{ padding: 20 }}>{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 44, marginBottom: 10 }} />)}</div>
        ) : !data?.history?.length ? (
          <div className="empty"><div className="emoji">💰</div><h3>No earnings yet</h3><p>Accept jobs to start earning.</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Vendor</th><th>Earned</th><th>Date</th></tr></thead>
            <tbody>
              {data.history.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.vendor.businessName}</td>
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
