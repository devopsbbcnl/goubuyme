'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';

// Flat shape returned by GET /riders/me/stats (see rider.controller.ts getRiderDashboardStats)
interface Stats { todayDeliveries: number; todayEarnings: number; weeklyEarnings: number[]; rating: number; isOnline: boolean; nearbyJobs: number; }
// Flat shape returned by GET /riders/me/deliveries (see rider.controller.ts getRecentDeliveries)
interface Delivery { id: string; vendor: string; amount: number; time: string; rating: number; }

// Subset of GET /riders/me/document used to decide what the rider still owes us.
interface RiderDoc {
  ninNumber?: string;
  ninImageUrl?: string;
  selfieUrl?: string;
  vehicleImageUrl?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorAddress?: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectedItem?: string | null;
}

const REJECTED_ITEM_LABELS: Record<string, string> = {
  NIN: 'NIN photo',
  SELFIE: 'selfie photo',
  VEHICLE: 'vehicle photo',
  GUARANTOR: 'guarantor information',
};

/** Fields a rider must supply before the account can be reviewed. */
function missingDocFields(doc: RiderDoc): string[] {
  const missing: string[] = [];
  if (!doc.ninNumber) missing.push('NIN');
  if (!doc.ninImageUrl) missing.push('NIN slip photo');
  if (!doc.selfieUrl) missing.push('selfie photo');
  if (!doc.vehicleImageUrl) missing.push('vehicle photo');
  if (!doc.guarantorName || !doc.guarantorPhone || !doc.guarantorAddress) missing.push('guarantor details');
  return missing;
}

export default function RiderDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const router = useRouter();
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

  const showApprovalGate = async () => {
    let doc: RiderDoc | null = null;
    try {
      const res = await api.get('/riders/me/document');
      doc = res.data.data;
    } catch {
      doc = null;
    }

    const missing = doc ? missingDocFields(doc) : [];
    const profileIncomplete = !doc || doc.status === 'REJECTED' || missing.length > 0;

    if (profileIncomplete) {
      let body: string;
      if (!doc) {
        body = "You haven't submitted your identity documents yet. Complete your profile so we can review your account.";
      } else if (doc.status === 'REJECTED') {
        const item = doc.rejectedItem ? REJECTED_ITEM_LABELS[doc.rejectedItem] ?? doc.rejectedItem : null;
        body = item
          ? `Your ${item} was rejected. Update your profile to resubmit it for review.`
          : 'Some of your documents were rejected. Update your profile to resubmit them for review.';
      } else {
        body = `Your profile is missing ${missing.join(', ')}. Add ${missing.length > 1 ? 'these' : 'this'} so we can review your account.`;
      }

      const go = await confirmDialog(body, {
        title: 'Complete your profile',
        confirmLabel: 'Complete profile',
        cancelLabel: 'Not now',
        danger: false,
      });
      if (go) router.push('/rider/documents');
      return;
    }

    toast("Your documents have been submitted and are under review. We'll notify you as soon as your account is approved — no further action is needed for now.", 'info');
  };

  const toggle = async () => {
    if (!stats) return;
    if (!stats.isOnline && user?.approvalStatus !== 'APPROVED') {
      showApprovalGate();
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
