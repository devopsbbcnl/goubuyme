'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

type PayoutStatus = 'PENDING' | 'PAID';
type PayoutType = 'Vendor' | 'Rider';

interface Payout {
  id: string; name: string; type: PayoutType;
  amountDue: number; lastPaidAt: string | null; status: PayoutStatus;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function PayoutsPage() {
  const { theme: T } = useTheme();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | PayoutStatus | PayoutType>('ALL');

  useEffect(() => {
    api.get<{ data: Payout[] }>('/admin/payouts')
      .then(res => setPayouts(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pay = async (id: string) => {
    await api.patch(`/admin/payouts/${id}/pay`, {});
    setPayouts(ps => ps.map(p => p.id === id ? { ...p, status: 'PAID' } : p));
  };

  const filtered = payouts.filter(p => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING' || filter === 'PAID') return p.status === filter;
    return p.type === filter;
  });

  const pendingPayouts = payouts.filter(p => p.status === 'PENDING');
  const paidPayouts = payouts.filter(p => p.status === 'PAID');
  const pendingTotal = pendingPayouts.reduce((s, p) => s + p.amountDue, 0);
  const paidTotal = paidPayouts.reduce((s, p) => s + p.amountDue, 0);
  const pendingVendors = pendingPayouts.filter(p => p.type === 'Vendor').length;
  const pendingRiders = pendingPayouts.filter(p => p.type === 'Rider').length;

  const tabs: Array<{ label: string; value: 'ALL' | PayoutStatus | PayoutType }> = [
    { label: 'All', value: 'ALL' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Paid', value: 'PAID' },
    { label: 'Vendors', value: 'Vendor' },
    { label: 'Riders', value: 'Rider' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Payouts & Commissions</div>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>Manage vendor and rider payouts</div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Pending Payouts', value: `₦${pendingTotal.toLocaleString()}`, sub: `${pendingPayouts.length} recipients`, color: T.warning },
          { label: 'Paid This Month', value: `₦${paidTotal.toLocaleString()}`, sub: `${paidPayouts.length} completed`, color: T.success },
          { label: 'Pending Vendors', value: String(pendingVendors), sub: 'awaiting settlement', color: T.primary },
          { label: 'Pending Riders', value: String(pendingRiders), sub: 'awaiting settlement', color: T.info },
        ].map(card => (
          <div key={card.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {tabs.map(t => (
          <button key={t.value} onClick={() => setFilter(t.value)} style={{
            padding: '7px 14px', borderRadius: 4,
            border: filter === t.value ? `1px solid ${T.primary}` : 'none',
            background: filter === t.value ? T.primaryTint : T.surface2,
            color: filter === t.value ? T.primary : T.textSec,
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              {['Recipient', 'Type', 'Amount Due', 'Last Paid', 'Status', 'Action'].map(h => (
                <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>No payouts found.</td>
              </tr>
            ) : filtered.map(p => (
              <tr key={p.id} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{p.id}</div>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 9px',
                    color: p.type === 'Vendor' ? T.info : T.primary,
                    background: p.type === 'Vendor' ? T.infoBg : T.primaryTint,
                  }}>{p.type}</span>
                </td>
                <td style={{ padding: '13px 16px', fontSize: 14, fontWeight: 800, color: T.text }}>₦{p.amountDue.toLocaleString()}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{fmtDate(p.lastPaidAt)}</td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 9px',
                    color: p.status === 'PAID' ? T.success : T.warning,
                    background: p.status === 'PAID' ? T.successBg : T.warningBg,
                  }}>{p.status === 'PAID' ? 'Paid' : 'Pending'}</span>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  {p.status === 'PENDING' ? (
                    <button onClick={() => pay(p.id)} style={{
                      padding: '6px 14px', borderRadius: 4, border: 'none',
                      background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700,
                      fontFamily: 'inherit', cursor: 'pointer',
                    }}>Pay Now</button>
                  ) : (
                    <span style={{ fontSize: 12, color: T.textMuted }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
