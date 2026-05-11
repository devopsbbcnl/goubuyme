'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

interface Customer {
  id: string; name: string; email: string; phone: string | null;
  isActive: boolean; totalOrders: number; totalSpent: number; createdAt: string;
}

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${n.toLocaleString()}`;
  return `₦${n}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function CustomersPage() {
  const { theme: T } = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Customer[] }>('/admin/customers?limit=100');
      setCustomers(res.data);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const filtered = customers.filter(c =>
    (filter === 'ALL' || (filter === 'ACTIVE' ? c.isActive : !c.isActive)) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').includes(search))
  );

  const activeCount = customers.filter(c => c.isActive).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Customers</div>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {loading ? 'Loading…' : `${customers.length} total · ${activeCount} active`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: 4,
              border: filter === f ? `1px solid ${T.primary}` : 'none',
              background: filter === f ? T.primaryTint : T.surface2,
              color: filter === f ? T.primary : T.textSec,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              {f.charAt(0) + f.slice(1).toLowerCase()}
              {f !== 'ALL' && (
                <span style={{ opacity: 0.6, marginLeft: 4 }}>
                  {f === 'ACTIVE' ? activeCount : customers.length - activeCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 14px', color: T.text, fontSize: 13, outline: 'none', width: 240 }}
        />
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              {['Customer', 'Phone', 'Email', 'Orders', 'Total Spent', 'Joined', 'Status'].map(h => (
                <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                  Loading customers…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                  No customers found.
                </td>
              </tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{c.id.slice(0, 8)}</div>
                </td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{c.phone ?? '—'}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{c.email}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: T.text }}>{c.totalOrders}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.success }}>{fmtCurrency(c.totalSpent)}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{fmtDate(c.createdAt)}</td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 9px',
                    color: c.isActive ? T.success : T.textSec,
                    background: c.isActive ? T.successBg : T.surface3,
                  }}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
