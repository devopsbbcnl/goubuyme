'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/Badge';
import { AddRiderModal } from '@/components/rider/AddRiderModal';
import { api } from '@/lib/api';

type RiderStatus = 'APPROVED' | 'PENDING' | 'SUSPENDED';

interface Rider {
  id: string; name: string; phone: string | null; vehicleType: string;
  plateNumber: string | null; totalDeliveries: number; totalEarnings: number;
  rating: number; approvalStatus: RiderStatus; isOnline: boolean; createdAt: string;
}

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return n === 0 ? '₦0' : `₦${n.toLocaleString()}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function RidersPage() {
  const { theme: T } = useTheme();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [addRiderOpen, setAddRiderOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | RiderStatus>('ALL');
  const [search, setSearch] = useState('');

  const fetchRiders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Rider[] }>('/admin/riders?limit=100');
      setRiders(res.data);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRiders(); }, [fetchRiders]);

  const setStatus = async (id: string, status: RiderStatus) => {
    setRiders(rs => rs.map(r => r.id === id ? { ...r, approvalStatus: status } : r));
    try {
      await api.patch(`/admin/riders/${id}/status`, { status });
    } catch {
      fetchRiders();
    }
  };

  const filtered = riders.filter(r =>
    (filter === 'ALL' || r.approvalStatus === filter) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  const tabs: Array<'ALL' | RiderStatus> = ['ALL', 'PENDING', 'APPROVED', 'SUSPENDED'];
  const onlineCount = riders.filter(r => r.isOnline).length;

  return (
    <>
    <AddRiderModal
      open={addRiderOpen}
      onClose={() => setAddRiderOpen(false)}
      onCreated={() => { setAddRiderOpen(false); fetchRiders(); }}
    />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Riders</div>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {loading ? 'Loading…' : `${riders.length} total · ${riders.filter(r => r.approvalStatus === 'PENDING').length} pending · ${onlineCount} online`}
          </div>
        </div>
        <button onClick={() => setAddRiderOpen(true)} style={{ padding: '10px 20px', borderRadius: 4, background: T.primary, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          + Add Rider
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding: '7px 14px', borderRadius: 4,
              border: filter === t ? `1px solid ${T.primary}` : 'none',
              background: filter === t ? T.primaryTint : T.surface2,
              color: filter === t ? T.primary : T.textSec,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              {t}
              {t !== 'ALL' && (
                <span style={{ opacity: 0.6, marginLeft: 4 }}>
                  {riders.filter(r => r.approvalStatus === t).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search riders…"
          style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 14px', color: T.text, fontSize: 13, outline: 'none', width: 220 }}
        />
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              {['Rider', 'Phone', 'Vehicle', 'Plate', 'Deliveries', 'Earned', 'Rating', 'Status', 'Online', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                  Loading riders…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                  No riders match the current filter.
                </td>
              </tr>
            ) : filtered.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{fmtDate(r.createdAt)}</div>
                </td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{r.phone ?? '—'}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{r.vehicleType}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{r.plateNumber ?? 'N/A'}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: T.text }}>{r.totalDeliveries}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.success }}>{fmtCurrency(r.totalEarnings)}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: T.text }}>
                  {r.rating > 0 ? `⭐ ${r.rating.toFixed(1)}` : '—'}
                </td>
                <td style={{ padding: '13px 16px' }}><Badge status={r.approvalStatus} /></td>
                <td style={{ padding: '13px 16px' }}>
                  <Badge status={r.isOnline ? 'ONLINE' : 'OFFLINE'} />
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {r.approvalStatus === 'PENDING' && (
                      <button onClick={() => setStatus(r.id, 'APPROVED')} style={{ padding: '5px 10px', borderRadius: 4, border: 'none', background: T.success, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Approve</button>
                    )}
                    {r.approvalStatus === 'APPROVED' && (
                      <button onClick={() => setStatus(r.id, 'SUSPENDED')} style={{ padding: '5px 10px', borderRadius: 4, border: `1px solid ${T.warning}`, background: 'none', color: T.warning, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Suspend</button>
                    )}
                    {r.approvalStatus === 'SUSPENDED' && (
                      <button onClick={() => setStatus(r.id, 'APPROVED')} style={{ padding: '5px 10px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Reinstate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
