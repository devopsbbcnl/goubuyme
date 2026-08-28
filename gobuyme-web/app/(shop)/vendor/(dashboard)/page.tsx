'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';

interface Stats { todayOrders: number; todayRevenue: number; pendingOrders: number; isOpen: boolean; }
interface RecentOrder { id: string; orderNumber: string; status: string; subtotal: number; createdAt: string; customer: string; }

const STATUS_BADGE: Record<string, string> = { PENDING: 'badge-warning', CONFIRMED: 'badge-info', PREPARING: 'badge-info', DELIVERED: 'badge-success', CANCELLED: 'badge-error' };

// Completeness inputs — mirrors the checks in the vendor login flow + complete-profile page.
interface VendorProfileCheck {
  description?: string | null;
  address?: string | null;
  city?: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
}
interface VendorDoc {
  number?: string | null;
  imageUrl?: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectedItem?: string | null;
}

const REJECTED_ITEM_LABELS: Record<string, string> = {
  ID_FRONT: 'ID document (front)',
  ID_BACK: 'ID document (back)',
  SELFIE: 'selfie photo',
  BVN: 'BVN',
};

/** Details a vendor must supply before the store can be reviewed. */
function missingVendorFields(v: VendorProfileCheck | null, doc: VendorDoc | null): string[] {
  const missing: string[] = [];
  if (!v?.description?.trim()) missing.push('store description');
  if (!v?.address?.trim() || !v?.city?.trim()) missing.push('store address');
  if (!v?.openingTime?.trim() || !v?.closingTime?.trim()) missing.push('opening hours');
  if (!doc || !doc.number || !doc.imageUrl) missing.push('identity document');
  return missing;
}

export default function VendorDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const router = useRouter();
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

  const showApprovalGate = async () => {
    let profile: VendorProfileCheck | null = null;
    let doc: VendorDoc | null = null;
    const [pRes, dRes] = await Promise.allSettled([
      api.get('/vendors/me'),
      api.get('/vendors/me/document'),
    ]);
    if (pRes.status === 'fulfilled') profile = pRes.value.data.data;
    if (dRes.status === 'fulfilled') doc = dRes.value.data.data;

    const missing = missingVendorFields(profile, doc);
    const docRejected = doc?.status === 'REJECTED';

    if (missing.length > 0 || docRejected) {
      let body: string;
      if (docRejected) {
        const item = doc?.rejectedItem ? REJECTED_ITEM_LABELS[doc.rejectedItem] ?? doc.rejectedItem : null;
        body = item
          ? `Your ${item} was rejected. Update your profile to resubmit it for review.`
          : 'Some of your documents were rejected. Update your profile to resubmit them for review.';
      } else {
        body = `Your profile is missing ${missing.join(', ')}. Add ${missing.length > 1 ? 'these' : 'this'} so we can review your store.`;
      }

      const go = await confirmDialog(body, {
        title: 'Complete your profile',
        confirmLabel: 'Complete profile',
        cancelLabel: 'Not now',
        danger: false,
      });
      if (go) router.push('/vendor-complete-profile');
      return;
    }

    toast("Your store details have been submitted and are under review. We'll notify you as soon as your account is approved — no further action is needed for now.", 'info');
  };

  const toggle = async () => {
    if (!stats) return;
    if (!stats.isOpen && user?.approvalStatus !== 'APPROVED') {
      showApprovalGate();
      return;
    }
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
        <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 82 }} />)}</div>
      ) : (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Today's Orders</div><div className="kpi-val">{stats?.todayOrders ?? 0}</div></div>
          <div className="kpi-card"><div className="kpi-label">Today's Revenue</div><div className="kpi-val">₦{(stats?.todayRevenue ?? 0).toLocaleString()}</div></div>
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
