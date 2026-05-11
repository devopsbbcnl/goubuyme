'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { StatCard } from '@/components/ui/StatCard';
import { BarChart } from '@/components/ui/BarChart';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

interface PendingVendor {
  id: string; businessName: string; category: string; city: string; createdAt: string;
}

interface RecentOrder {
  id: string; orderNumber: string; status: string; totalAmount: number;
  createdAt: string; customerName: string; vendorName: string; riderName: string | null;
}

interface CategoryBreakdown {
  label: string; pct: number;
}

interface DashboardData {
  totalRevenue: number;
  totalOrders: number;
  activeVendors: number;
  onlineRiders: number;
  pendingVendors: PendingVendor[];
  recentOrders: RecentOrder[];
  monthlyRevenue?: number[];
  categoryBreakdown?: CategoryBreakdown[];
}

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return `₦${n.toLocaleString()}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  const h = Math.floor(diffMs / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h} hr ago`;
  if (m >= 1) return `${m} min ago`;
  return 'Just now';
};

export default function DashboardPage() {
  const { theme: T } = useTheme();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: DashboardData }>('/admin/dashboard');
      setData(res.data);
    } catch {
      // keep null on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  const approveVendor = async (id: string) => {
    await api.patch(`/admin/vendors/${id}/status`, { status: 'APPROVED' });
    setData(d => d ? { ...d, pendingVendors: d.pendingVendors.filter(v => v.id !== id) } : d);
  };

  const rejectVendor = async (id: string) => {
    await api.patch(`/admin/vendors/${id}/status`, { status: 'REJECTED' });
    setData(d => d ? { ...d, pendingVendors: d.pendingVendors.filter(v => v.id !== id) } : d);
  };

  const CATEGORY_COLORS = [T.primary, '#1A6EFF', '#1A9E5F', '#F5A623'];

  const stats = [
    {
      label: 'Total Revenue', value: loading ? '—' : fmtCurrency(data?.totalRevenue ?? 0),
      delta: '', deltaUp: true, sparkData: [],
      color: T.primary, icon: '💰',
    },
    {
      label: 'Total Orders', value: loading ? '—' : (data?.totalOrders ?? 0).toLocaleString(),
      delta: '', deltaUp: true, sparkData: [],
      color: '#1A6EFF', icon: '📦',
    },
    {
      label: 'Active Vendors', value: loading ? '—' : String(data?.activeVendors ?? 0),
      delta: '', deltaUp: true, sparkData: [],
      color: '#1A9E5F', icon: '🏪',
    },
    {
      label: 'Online Riders', value: loading ? '—' : String(data?.onlineRiders ?? 0),
      delta: '', deltaUp: true, sparkData: [],
      color: '#F5A623', icon: '🏍️',
    },
  ];

  const monthlyRevenue = data?.monthlyRevenue ?? [];
  const categoryBreakdown = data?.categoryBreakdown ?? [];
  const pendingCount = data?.pendingVendors?.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Pending alert */}
      {pendingCount > 0 && (
        <div style={{
          background: `${T.warning}10`, border: `1px solid ${T.warning}40`,
          borderRadius: 4, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span style={{ fontSize: 13, color: T.warning, fontWeight: 600 }}>
            {pendingCount} vendor application{pendingCount !== 1 ? 's' : ''} awaiting approval.
          </span>
          <a href="/vendors" style={{ marginLeft: 'auto', fontSize: 12, color: T.warning, fontWeight: 700 }}>Review →</a>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16 }}>
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16 }}>Monthly Revenue</div>
          {loading ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: T.textSec }}>Loading…</div>
          ) : monthlyRevenue.length > 0 ? (
            <BarChart data={monthlyRevenue} labels={MONTHS.slice(0, monthlyRevenue.length)} color={T.primary} h={120} />
          ) : (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: T.textSec }}>No data yet.</div>
          )}
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>Orders by Category</div>
          {loading ? (
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 16 }}>Loading…</div>
          ) : categoryBreakdown.length > 0 ? categoryBreakdown.map((c, i) => (
            <div key={c.label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: T.textSec }}>{c.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{c.pct}%</span>
              </div>
              <div style={{ height: 5, background: T.surface3, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${c.pct}%`, height: '100%', background: CATEGORY_COLORS[i % CATEGORY_COLORS.length], borderRadius: 3 }} />
              </div>
            </div>
          )) : (
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 16 }}>No data yet.</div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        {/* Recent orders */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Recent Orders</div>
            <a href="/orders" style={{ fontSize: 12, color: T.primary, fontWeight: 600 }}>View All</a>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Order ID', 'Customer', 'Vendor', 'Amount', 'Status', 'Time'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                    Loading…
                  </td>
                </tr>
              ) : (data?.recentOrders ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                    No orders yet.
                  </td>
                </tr>
              ) : (data?.recentOrders ?? []).map(o => (
                <tr key={o.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: T.primary }}>{o.orderNumber}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: T.text }}>{o.customerName}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: T.textSec }}>{o.vendorName}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: T.text }}>₦{o.totalAmount.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}><Badge status={o.status as 'IN_TRANSIT' | 'PREPARING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' | 'PENDING' | 'READY' | 'PICKED_UP'} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: T.textMuted }}>{timeAgo(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pending vendors */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Pending Approvals</div>
            {pendingCount > 0 && (
              <span style={{ background: `${T.warning}20`, color: T.warning, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                {pendingCount} new
              </span>
            )}
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? (
              <div style={{ fontSize: 13, color: T.textSec, textAlign: 'center', padding: 16 }}>Loading…</div>
            ) : (data?.pendingVendors ?? []).length === 0 ? (
              <div style={{ fontSize: 13, color: T.textSec, textAlign: 'center', padding: 16 }}>No pending approvals.</div>
            ) : (data?.pendingVendors ?? []).map(v => (
              <div key={v.id} style={{ background: T.surface2, borderRadius: 4, padding: 12, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{v.businessName}</div>
                <div style={{ fontSize: 11, color: T.textSec, marginTop: 2 }}>
                  {v.category.charAt(0) + v.category.slice(1).toLowerCase()} · {v.city} · {fmtDate(v.createdAt)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => approveVendor(v.id)}
                    style={{ flex: 1, padding: '7px', borderRadius: 4, border: 'none', background: T.success, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => rejectVendor(v.id)}
                    style={{ flex: 1, padding: '7px', borderRadius: 4, background: 'none', border: `1px solid ${T.error}`, color: T.error, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
