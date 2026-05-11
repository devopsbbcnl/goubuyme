'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';

type OrderStatus = 'IN_TRANSIT' | 'PREPARING' | 'DELIVERED' | 'CANCELLED' | 'CONFIRMED' | 'PENDING' | 'READY' | 'PICKED_UP';

interface Order {
  id: string; orderNumber: string; customerName: string; vendorName: string;
  riderName: string | null; totalAmount: number; status: OrderStatus; createdAt: string;
}

const fmtCurrency = (n: number) => `₦${n.toLocaleString()}`;

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  const h = Math.floor(diffMs / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h} hr ago`;
  if (m >= 1) return `${m} min ago`;
  return 'Just now';
};

const STATUS_TABS: Array<'ALL' | OrderStatus> = ['ALL', 'IN_TRANSIT', 'PREPARING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

export default function OrdersPage() {
  const { theme: T } = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Order[] }>('/admin/orders?limit=100');
      setOrders(res.data);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = orders.filter(o =>
    (filter === 'ALL' || o.status === filter) &&
    (!search || o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase()))
  );

  const inTransitCount = orders.filter(o => o.status === 'IN_TRANSIT').length;
  const preparingCount = orders.filter(o => o.status === 'PREPARING').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Orders</div>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {loading ? 'Loading…' : `${orders.length} total · ${inTransitCount} in transit · ${preparingCount} preparing`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_TABS.map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '7px 14px', borderRadius: 4,
              border: filter === s ? `1px solid ${T.primary}` : 'none',
              background: filter === s ? T.primaryTint : T.surface2,
              color: filter === s ? T.primary : T.textSec,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              {s === 'IN_TRANSIT' ? 'In Transit' : s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              {s !== 'ALL' && (
                <span style={{ opacity: 0.6, marginLeft: 4 }}>
                  {orders.filter(o => o.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by ID or customer…"
          style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 14px', color: T.text, fontSize: 13, outline: 'none', width: 240 }}
        />
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              {['Order ID', 'Customer', 'Vendor', 'Rider', 'Amount', 'Status', 'Time'].map(h => (
                <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                  Loading orders…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                  No orders match the current filter.
                </td>
              </tr>
            ) : filtered.map(o => (
              <tr key={o.id} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.primary }}>{o.orderNumber}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: T.text }}>{o.customerName}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{o.vendorName}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{o.riderName ?? '—'}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.text }}>{fmtCurrency(o.totalAmount)}</td>
                <td style={{ padding: '13px 16px' }}><Badge status={o.status} /></td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textMuted }}>{timeAgo(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
