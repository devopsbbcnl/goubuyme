'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Card, CrmRole, CrmTag, LifecycleStage, RoleBadge, SectionLabel, StageBadge, TagChip,
  fmtDate, fmtDateTime, fmtNaira, fmtRelative,
} from '@/components/crm/shared';
import {
  CATEGORY_LABEL, PriorityBadge, TicketCategory, TicketPriority, TicketStatus, TicketStatusBadge,
} from '@/components/crm/tickets';
import { LinkedTasks } from '@/components/crm/tasks';

// ─── Types (mirror GET /admin/crm/profiles/:userId) ──────────────────────────

interface OrderRow {
  id: string; orderNumber: string; status: string; paymentStatus: string;
  totalAmount: number; createdAt: string; vendorName: string; customerName: string;
}

interface Note {
  id: string; body: string; pinned: boolean; createdAt: string; updatedAt: string;
  author: { id: string; name: string };
}

interface CreditTx {
  id: string; type: 'CREDIT' | 'DEBIT'; amount: number; balanceAfter: number; reason: string; createdAt: string;
}

interface Profile {
  id: string; name: string; email: string; phone: string | null; role: CrmRole; avatar: string | null;
  isActive: boolean; isEmailVerified: boolean; isPhoneVerified: boolean; mfaEnabled: boolean; createdAt: string;
  referralCode: string; freeDeliveryCredits: number; storeCreditBalance: number;
  referredBy: { id: string; name: string } | null; referralsCount: number; hasPushToken: boolean;
  health: { score: number; stage: LifecycleStage; reasons: string[] };
  tags: CrmTag[]; notes: Note[]; creditTransactions: CreditTx[];
  tickets: ProfileTicket[]; ticketsLast30: number;
  customer?: {
    totalOrders: number; completedOrders: number; cancelledOrders: number;
    lifetimeValue: number; averageOrderValue: number; lastOrderAt: string | null;
    favoriteVendors: Array<{ vendorId: string; name: string; orders: number }>;
    addresses: Array<{ id: string; label: string; address: string; city: string; state: string; isDefault: boolean }>;
    recentOrders: OrderRow[];
  };
  vendor?: {
    id: string; businessName: string; category: string; city: string; state: string;
    approvalStatus: string; commissionTier: 'TIER_1' | 'TIER_2'; verificationBadge: string; isOpen: boolean;
    rating: number; totalRatings: number; isFeatured: boolean;
    document: { status: string } | null; licenses: Array<{ id: string; status: string }>;
    planChanges: Array<{ id: string; fromTier: string; toTier: string; createdAt: string }>;
    grossMerchandiseValue: number; completedOrders: number; ordersLast30: number; ordersPrev30: number;
    cancelledLast30: number; incidentsLast30: number; lastOrderAt: string | null;
    payouts: Record<string, number>; recentOrders: OrderRow[];
  };
  rider?: {
    id: string; vehicleType: string; plateNumber: string | null; isOnline: boolean; isAvailable: boolean;
    approvalStatus: string; rating: number; totalRatings: number; city: string | null;
    document: { status: string } | null;
    totalDeliveries: number; deliveriesLast30: number; lastDeliveryAt: string | null;
    earnings: Record<string, number>; recentDeliveries: OrderRow[];
  };
}

interface ProfileTicket {
  id: string; number: number; subject: string; category: TicketCategory; priority: TicketPriority;
  status: TicketStatus; createdAt: string; lastMessageAt: string; csatScore: number | null;
  order: { orderNumber: string } | null;
}

interface TimelineItem {
  id: string; at: string; kind: 'crm' | 'audit' | 'onboarding' | 'order' | 'credit' | 'chat' | 'ticket';
  title: string; detail?: string; actor?: string | null;
}

type Tab = 'overview' | 'orders' | 'tickets' | 'tasks' | 'notes' | 'timeline';

const KIND_ICON: Record<TimelineItem['kind'], string> = {
  crm: '🗂️', audit: '🛡️', onboarding: '🚀', order: '📦', credit: '💳', chat: '💬', ticket: '🎧',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CrmProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const canAct = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [actionError, setActionError] = useState('');

  const [modal, setModal] = useState<null | 'credit' | 'message' | 'status'>(null);

  const load = useCallback(() => {
    return api.get<{ data: Profile }>(`/admin/crm/profiles/${userId}`)
      .then(res => { setProfile(res.data); setLoadError(''); })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<{ data: CrmTag[] }>('/admin/crm/tags').then(res => setAllTags(res.data)).catch(() => {});
  }, []);
  useEffect(() => {
    if (tab !== 'timeline') return;
    setTimeline(null);
    api.get<{ data: TimelineItem[] }>(`/admin/crm/profiles/${userId}/timeline?limit=100`)
      .then(res => setTimeline(res.data))
      .catch(() => setTimeline([]));
  }, [tab, userId, profile]);

  if (loading) return <div style={{ color: T.textSec, fontSize: 13 }}>Loading profile…</div>;
  if (loadError || !profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/crm/profiles" style={{ color: T.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← All profiles</Link>
        <div style={{ color: T.error, fontSize: 14 }}>{loadError || 'Profile not found.'}</div>
      </div>
    );
  }

  const displayName = profile.vendor?.businessName ?? profile.name;

  const addTag = async (tagId: string) => {
    if (!tagId) return;
    setActionError('');
    try {
      await api.post(`/admin/crm/profiles/${profile.id}/tags`, { tagId });
      await load();
    } catch (err) { setActionError((err as Error).message); }
  };

  const removeTag = async (tagId: string) => {
    setActionError('');
    try {
      await api.del(`/admin/crm/profiles/${profile.id}/tags/${tagId}`);
      await load();
    } catch (err) { setActionError((err as Error).message); }
  };

  const unusedTags = allTags.filter(t => !profile.tags.some(pt => pt.id === t.id));

  const btn = (variant: 'primary' | 'outline' | 'danger'): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    ...(variant === 'primary' ? { background: T.primary, color: '#fff', border: 'none' }
      : variant === 'danger' ? { background: 'none', color: T.error, border: `1px solid ${T.error}` }
      : { background: T.surface2, color: T.text, border: `1px solid ${T.border}` }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/crm/profiles" style={{ color: T.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← All profiles</Link>

      {/* Header */}
      <Card>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 9999, flexShrink: 0, background: T.primaryTint,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: T.primary,
            overflow: 'hidden',
          }}>
            {profile.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : displayName.charAt(0).toUpperCase()}
          </div>

          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{displayName}</span>
              <RoleBadge role={profile.role} />
              <StageBadge stage={profile.health.stage} />
              {!profile.isActive && (
                <span style={{ fontSize: 11, fontWeight: 700, color: T.error, background: T.errorBg, borderRadius: 4, padding: '3px 9px' }}>Suspended</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 4, wordBreak: 'break-word' }}>
              {profile.vendor ? `${profile.name} · ` : ''}{profile.email}{profile.phone ? ` · ${profile.phone}` : ''}
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
              Joined {fmtDate(profile.createdAt)}
              {profile.isEmailVerified ? ' · Email verified' : ' · Email unverified'}
              {profile.mfaEnabled ? ' · 2FA on' : ''}
              {profile.hasPushToken ? ' · Push enabled' : ''}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
              {profile.tags.map(t => <TagChip key={t.id} tag={t} onRemove={() => removeTag(t.id)} />)}
              {unusedTags.length > 0 && (
                <select
                  aria-label="Add tag"
                  value=""
                  onChange={e => addTag(e.target.value)}
                  style={{ background: T.surface2, border: `1px dashed ${T.border}`, borderRadius: 999, padding: '3px 8px', color: T.textSec, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <option value="">+ Add tag</option>
                  {unusedTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              {allTags.length === 0 && (
                <span style={{ fontSize: 11, color: T.textMuted }}>No tags defined yet</span>
              )}
            </div>
          </div>

          <HealthMeter score={profile.health.score} reasons={profile.health.reasons} />
        </div>

        {canAct && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <button onClick={() => setModal('message')} style={btn('primary')}>Send message</button>
            <button onClick={() => setModal('credit')} style={btn('outline')}>Issue store credit</button>
            <button onClick={() => setModal('status')} style={btn(profile.isActive ? 'danger' : 'outline')}>
              {profile.isActive ? 'Suspend account' : 'Reactivate account'}
            </button>
          </div>
        )}
        {actionError && <div style={{ fontSize: 12, color: T.error, marginTop: 10 }}>{actionError}</div>}
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
        {([
          ['overview', 'Overview'],
          ['orders', profile.role === 'RIDER' ? 'Deliveries' : 'Orders'],
          ['tickets', `Tickets (${profile.tickets.length})`],
          ['tasks', 'Tasks'],
          ['notes', `Notes (${profile.notes.length})`],
          ['timeline', 'Timeline'],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 14px', background: 'none', border: 'none', fontFamily: 'inherit', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            color: tab === key ? T.primary : T.textSec,
            borderBottom: tab === key ? `2px solid ${T.primary}` : '2px solid transparent',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview profile={profile} isMobile={isMobile} />}
      {tab === 'orders' && (
        <OrdersTable orders={profile.customer?.recentOrders ?? profile.vendor?.recentOrders ?? profile.rider?.recentDeliveries ?? []} role={profile.role} />
      )}
      {tab === 'tickets' && <TicketsPanel tickets={profile.tickets} />}
      {tab === 'tasks' && <Card><LinkedTasks links={{ relatedUserId: profile.id }} defaultTitle={`Follow up with ${displayName}`} /></Card>}
      {tab === 'notes' && <NotesPanel profile={profile} onChange={load} />}
      {tab === 'timeline' && <TimelinePanel items={timeline} />}

      <CreditModal open={modal === 'credit'} onClose={() => setModal(null)} profile={profile} onDone={load} />
      <MessageModal open={modal === 'message'} onClose={() => setModal(null)} profile={profile} onDone={load} />
      <StatusModal open={modal === 'status'} onClose={() => setModal(null)} profile={profile} onDone={load} />
    </div>
  );
}

// ─── Header pieces ───────────────────────────────────────────────────────────

function HealthMeter({ score, reasons }: { score: number; reasons: string[] }) {
  const { theme: T } = useTheme();
  const color = score >= 70 ? T.success : score >= 40 ? T.warning : T.error;
  return (
    <div style={{ flex: '0 1 240px', minWidth: 200 }}>
      <SectionLabel>Health score</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color }}>{score}</span>
        <span style={{ fontSize: 12, color: T.textSec }}>/ 100</span>
      </div>
      <div style={{ height: 6, background: T.surface3, borderRadius: 999, overflow: 'hidden', margin: '6px 0 8px' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color }} />
      </div>
      {reasons.length === 0
        ? <div style={{ fontSize: 12, color: T.textSec }}>No risk signals.</div>
        : reasons.map(r => <div key={r} style={{ fontSize: 12, color: T.textSec, lineHeight: 1.6 }}>• {r}</div>)}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { theme: T } = useTheme();
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function InfoRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  const { theme: T } = useTheme();
  return (
    <div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600, textAlign: 'right' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview({ profile, isMobile }: { profile: Profile; isMobile: boolean }) {
  const { theme: T } = useTheme();
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 };
  const columns: React.CSSProperties = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 };

  const accountRows: Array<[string, React.ReactNode]> = [
    ['Store credit', fmtNaira(profile.storeCreditBalance)],
    ['Free delivery credits', String(profile.freeDeliveryCredits)],
    ['Referral code', <code key="code">{profile.referralCode}</code>],
    ['Referred by', profile.referredBy
      ? <Link key="ref" href={`/crm/profiles/${profile.referredBy.id}`} style={{ color: T.primary, textDecoration: 'none' }}>{profile.referredBy.name}</Link>
      : '—'],
    ['Successful referrals', String(profile.referralsCount)],
  ];

  const credits = (
    <Card>
      <SectionLabel>Store credit history</SectionLabel>
      {profile.creditTransactions.length === 0
        ? <div style={{ fontSize: 12, color: T.textSec }}>No credit activity.</div>
        : profile.creditTransactions.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{c.reason}</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>{fmtDateTime(c.createdAt)}</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.type === 'CREDIT' ? T.success : T.textSec, whiteSpace: 'nowrap' }}>
              {c.type === 'CREDIT' ? '+' : '−'}{fmtNaira(c.amount)}
            </span>
          </div>
        ))}
    </Card>
  );

  if (profile.customer) {
    const c = profile.customer;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={grid}>
          <Kpi label="Lifetime value" value={fmtNaira(c.lifetimeValue)} sub={`${c.completedOrders} delivered orders`} />
          <Kpi label="Avg order value" value={fmtNaira(c.averageOrderValue)} />
          <Kpi label="Total orders" value={String(c.totalOrders)} sub={`${c.cancelledOrders} cancelled`} />
          <Kpi label="Last order" value={fmtRelative(c.lastOrderAt)} sub={fmtDate(c.lastOrderAt)} />
        </div>
        <div style={columns}>
          <Card>
            <SectionLabel>Favorite vendors</SectionLabel>
            {c.favoriteVendors.length === 0
              ? <div style={{ fontSize: 12, color: T.textSec }}>No delivered orders yet.</div>
              : <InfoRows rows={c.favoriteVendors.map(v => [v.name, `${v.orders} orders`])} />}
            <div style={{ marginTop: 18 }}><SectionLabel>Addresses</SectionLabel></div>
            {c.addresses.length === 0
              ? <div style={{ fontSize: 12, color: T.textSec }}>No saved addresses.</div>
              : c.addresses.map(a => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.label}{a.isDefault ? ' · Default' : ''}</div>
                  <div style={{ fontSize: 12, color: T.textSec }}>{a.address}, {a.city}, {a.state}</div>
                </div>
              ))}
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card><SectionLabel>Account</SectionLabel><InfoRows rows={accountRows} /></Card>
            {credits}
          </div>
        </div>
      </div>
    );
  }

  if (profile.vendor) {
    const v = profile.vendor;
    const trend = v.ordersPrev30 > 0 ? Math.round(((v.ordersLast30 - v.ordersPrev30) / v.ordersPrev30) * 100) : null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={grid}>
          <Kpi label="GMV (delivered)" value={fmtNaira(v.grossMerchandiseValue)} sub={`${v.completedOrders} delivered orders`} />
          <Kpi label="Orders · 30 days" value={String(v.ordersLast30)} sub={trend === null ? 'No prior period' : `${trend >= 0 ? '+' : ''}${trend}% vs previous 30d`} />
          <Kpi label="Cancelled · 30 days" value={String(v.cancelledLast30)} sub={`${v.incidentsLast30} incidents`} />
          <Kpi label="Rating" value={v.totalRatings ? v.rating.toFixed(1) : '—'} sub={`${v.totalRatings} ratings`} />
        </div>
        <div style={columns}>
          <Card>
            <SectionLabel>Business</SectionLabel>
            <InfoRows rows={[
              ['Approval', <Badge key="a" status={v.approvalStatus as 'APPROVED'} />],
              ['Category', v.category],
              ['Location', `${v.city}, ${v.state}`],
              ['Commission plan', v.commissionTier === 'TIER_1' ? 'Tier 1 · 3%' : 'Tier 2 · 7.5%'],
              ['Verification', v.verificationBadge.replace(/_/g, ' ')],
              ['Documents', v.document?.status ?? 'Not submitted'],
              ['Licenses', v.licenses.length ? v.licenses.map(l => l.status).join(', ') : 'None'],
              ['Store', v.isOpen ? 'Open now' : 'Closed'],
              ['Last order', fmtRelative(v.lastOrderAt)],
            ]} />
            <div style={{ marginTop: 14 }}>
              <Link href="/vendors" style={{ color: T.primary, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Manage in Vendors →</Link>
            </div>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <SectionLabel>Payouts</SectionLabel>
              <InfoRows rows={[
                ['Pending', fmtNaira(v.payouts.PENDING ?? 0)],
                ['Processing', fmtNaira(v.payouts.PROCESSING ?? 0)],
                ['Completed', fmtNaira(v.payouts.COMPLETED ?? 0)],
              ]} />
              {v.planChanges.length > 0 && (
                <>
                  <div style={{ marginTop: 18 }}><SectionLabel>Plan changes</SectionLabel></div>
                  <InfoRows rows={v.planChanges.map(p => [fmtDate(p.createdAt), `${p.fromTier.replace('_', ' ')} → ${p.toTier.replace('_', ' ')}`])} />
                </>
              )}
            </Card>
            <Card><SectionLabel>Account</SectionLabel><InfoRows rows={accountRows} /></Card>
          </div>
        </div>
      </div>
    );
  }

  if (profile.rider) {
    const r = profile.rider;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={grid}>
          <Kpi label="Deliveries" value={String(r.totalDeliveries)} sub={`${r.deliveriesLast30} in last 30 days`} />
          <Kpi label="Earnings paid" value={fmtNaira(r.earnings.COMPLETED ?? 0)} sub={`${fmtNaira(r.earnings.PENDING ?? 0)} pending`} />
          <Kpi label="Rating" value={r.totalRatings ? r.rating.toFixed(1) : '—'} sub={`${r.totalRatings} ratings`} />
          <Kpi label="Last delivery" value={fmtRelative(r.lastDeliveryAt)} sub={fmtDate(r.lastDeliveryAt)} />
        </div>
        <div style={columns}>
          <Card>
            <SectionLabel>Rider</SectionLabel>
            <InfoRows rows={[
              ['Approval', <Badge key="a" status={r.approvalStatus as 'APPROVED'} />],
              ['Status', <Badge key="s" status={r.isOnline ? 'ONLINE' : 'OFFLINE'} />],
              ['Vehicle', `${r.vehicleType}${r.plateNumber ? ` · ${r.plateNumber}` : ''}`],
              ['City', r.city ?? '—'],
              ['Documents', r.document?.status ?? 'Not submitted'],
            ]} />
            <div style={{ marginTop: 14 }}>
              <Link href="/riders" style={{ color: T.primary, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Manage in Riders →</Link>
            </div>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card><SectionLabel>Account</SectionLabel><InfoRows rows={accountRows} /></Card>
            {credits}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={columns}>
      <Card>
        <SectionLabel>Setup incomplete</SectionLabel>
        <div style={{ fontSize: 13, color: T.textSec }}>This account signed up but hasn&apos;t finished creating its {profile.role.toLowerCase()} profile.</div>
      </Card>
      <Card><SectionLabel>Account</SectionLabel><InfoRows rows={accountRows} /></Card>
    </div>
  );
}

// ─── Orders ──────────────────────────────────────────────────────────────────

function OrdersTable({ orders, role }: { orders: OrderRow[]; role: CrmRole }) {
  const { theme: T } = useTheme();
  const counterparty = role === 'CUSTOMER' ? 'Vendor' : 'Customer';
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontSize: 12, color: T.textSec, borderBottom: `1px solid ${T.border}` }}>
        Showing the 10 most recent. Full history is in <Link href="/orders" style={{ color: T.primary, textDecoration: 'none', fontWeight: 700 }}>Orders</Link>.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              {['Order', counterparty, 'Amount', 'Status', 'Payment', 'Date'].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>No orders yet.</td></tr>
            ) : orders.map(o => (
              <tr key={o.id} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: T.text }}>#{o.orderNumber}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: T.textSec }}>{role === 'CUSTOMER' ? o.vendorName : o.customerName}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: T.text }}>{fmtNaira(o.totalAmount)}</td>
                <td style={{ padding: '12px 16px' }}><Badge status={o.status as 'DELIVERED'} /></td>
                <td style={{ padding: '12px 16px' }}><Badge status={o.paymentStatus as 'PAID'} /></td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>{fmtDateTime(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

function TicketsPanel({ tickets }: { tickets: ProfileTicket[] }) {
  const { theme: T } = useTheme();
  if (tickets.length === 0) return <div style={{ fontSize: 13, color: T.textSec }}>No support tickets.</div>;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {tickets.map(t => (
        <Link key={t.id} href={`/crm/inbox?ticket=${t.id}`} style={{ display: 'block', textDecoration: 'none', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>#{t.number} · {t.subject}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <PriorityBadge priority={t.priority} />
              <TicketStatusBadge status={t.status} />
            </span>
          </div>
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 3 }}>
            {CATEGORY_LABEL[t.category]}{t.order ? ` · Order #${t.order.orderNumber}` : ''} · opened {fmtDateTime(t.createdAt)}
            {t.csatScore ? ` · rated ${t.csatScore}/5` : ''}
          </div>
        </Link>
      ))}
    </Card>
  );
}

// ─── Notes ───────────────────────────────────────────────────────────────────

function NotesPanel({ profile, onChange }: { profile: Profile; onChange: () => Promise<void> }) {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const canModerate = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); await onChange(); } catch (err) { setError((err as Error).message); }
  };

  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    await run(async () => {
      await api.post(`/admin/crm/profiles/${profile.id}/notes`, { body, pinned });
      setBody('');
      setPinned(false);
    });
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add an internal note. Only admins can see it."
          rows={3}
          maxLength={5000}
          style={{ width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: 12, color: T.text, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textSec, cursor: 'pointer' }}>
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin to top
          </label>
          <button onClick={submit} disabled={saving || !body.trim()} style={{
            padding: '8px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving || !body.trim() ? 0.6 : 1,
          }}>{saving ? 'Saving…' : 'Add note'}</button>
        </div>
        {error && <div style={{ fontSize: 12, color: T.error, marginTop: 8 }}>{error}</div>}
      </Card>

      {profile.notes.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textSec, padding: '8px 2px' }}>No notes yet.</div>
      ) : profile.notes.map(n => {
        const mine = n.author.id === user?.id;
        return (
          <Card key={n.id} style={n.pinned ? { borderColor: T.primary } : undefined}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 12, color: T.textSec }}>
                {n.pinned && <span style={{ color: T.primary, fontWeight: 700 }}>📌 Pinned · </span>}
                <strong style={{ color: T.text }}>{n.author.name}</strong> · {fmtDateTime(n.createdAt)}
              </div>
              {(mine || canModerate) && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => run(() => api.patch(`/admin/crm/notes/${n.id}`, { pinned: !n.pinned }))}
                    style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >{n.pinned ? 'Unpin' : 'Pin'}</button>
                  <button
                    onClick={() => run(() => api.del(`/admin/crm/notes/${n.id}`))}
                    style={{ background: 'none', border: 'none', color: T.error, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >Delete</button>
                </div>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.text, marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{n.body}</div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

function TimelinePanel({ items }: { items: TimelineItem[] | null }) {
  const { theme: T } = useTheme();
  if (items === null) return <div style={{ fontSize: 13, color: T.textSec }}>Loading timeline…</div>;
  if (items.length === 0) return <div style={{ fontSize: 13, color: T.textSec }}>No activity recorded.</div>;
  return (
    <Card style={{ padding: '6px 18px' }}>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: `1px solid ${T.border}` }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9999, background: T.surface2, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>{KIND_ICON[item.kind]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{item.title}</div>
            {item.detail && <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>{item.detail}</div>}
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {fmtDateTime(item.at)}{item.actor ? ` · by ${item.actor}` : ''}
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ─── Action modals ───────────────────────────────────────────────────────────

const useModalForm = () => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (fn: () => Promise<unknown>, done: () => void) => {
    setSaving(true);
    setError('');
    try { await fn(); done(); } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  };
  return { saving, error, setError, submit };
};

function ModalBody({ children, error, saving, label, onSubmit, danger }: {
  children: React.ReactNode; error: string; saving: boolean; label: string; onSubmit: () => void; danger?: boolean;
}) {
  const { theme: T } = useTheme();
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {children}
      {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
      <button onClick={onSubmit} disabled={saving} style={{
        padding: '10px 16px', borderRadius: 4, border: 'none', background: danger ? T.error : T.primary, color: '#fff',
        fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving ? 0.6 : 1,
      }}>{saving ? 'Working…' : label}</button>
    </div>
  );
}

function useFieldStyle(): React.CSSProperties {
  const { theme: T } = useTheme();
  return {
    width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '10px 12px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  const { theme: T } = useTheme();
  return <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec, marginBottom: -6 }}>{children}</div>;
}

function CreditModal({ open, onClose, profile, onDone }: { open: boolean; onClose: () => void; profile: Profile; onDone: () => Promise<void> }) {
  const field = useFieldStyle();
  const { saving, error, submit } = useModalForm();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Issue store credit" width={440}>
      <ModalBody error={error} saving={saving} label="Issue credit" onSubmit={() => submit(
        () => api.post(`/admin/crm/profiles/${profile.id}/credit`, { amount: Number(amount), reason }),
        () => { setAmount(''); setReason(''); onClose(); onDone(); },
      )}>
        <FieldLabel>Amount (₦, max 100,000)</FieldLabel>
        <input type="number" min={1} max={100000} value={amount} onChange={e => setAmount(e.target.value)} style={field} />
        <FieldLabel>Reason (shown in the credit ledger)</FieldLabel>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Compensation for late delivery" style={field} />
      </ModalBody>
    </Modal>
  );
}

function MessageModal({ open, onClose, profile, onDone }: { open: boolean; onClose: () => void; profile: Profile; onDone: () => Promise<void> }) {
  const { theme: T } = useTheme();
  const field = useFieldStyle();
  const { saving, error, submit } = useModalForm();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const channels = [...(push ? ['push'] : []), ...(email ? ['email'] : [])];
  return (
    <Modal open={open} onClose={onClose} title={`Message ${profile.vendor?.businessName ?? profile.name}`} width={480}>
      <ModalBody error={error} saving={saving} label="Send" onSubmit={() => submit(
        () => api.post(`/admin/crm/profiles/${profile.id}/message`, { title, body, channels }),
        () => { setTitle(''); setBody(''); onClose(); onDone(); },
      )}>
        <FieldLabel>Title</FieldLabel>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} style={field} />
        <FieldLabel>Message</FieldLabel>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={2000} style={{ ...field, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: T.text }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={push} onChange={e => setPush(e.target.checked)} /> In-app + push
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> Email
          </label>
        </div>
        {push && !profile.hasPushToken && (
          <div style={{ fontSize: 12, color: T.textSec }}>This user has no registered device, so they will only see it in the app.</div>
        )}
      </ModalBody>
    </Modal>
  );
}

function StatusModal({ open, onClose, profile, onDone }: { open: boolean; onClose: () => void; profile: Profile; onDone: () => Promise<void> }) {
  const { theme: T } = useTheme();
  const field = useFieldStyle();
  const { saving, error, submit } = useModalForm();
  const [reason, setReason] = useState('');
  const suspending = profile.isActive;
  return (
    <Modal open={open} onClose={onClose} title={suspending ? 'Suspend account' : 'Reactivate account'} width={440}>
      <ModalBody error={error} saving={saving} danger={suspending} label={suspending ? 'Suspend' : 'Reactivate'} onSubmit={() => submit(
        () => api.patch(`/admin/crm/profiles/${profile.id}/status`, { isActive: !suspending, reason }),
        () => { setReason(''); onClose(); onDone(); },
      )}>
        <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5 }}>
          {suspending
            ? 'They will be signed out within 15 minutes and blocked from logging in. Orders and history are kept.'
            : 'They will be able to log in again straight away.'}
        </div>
        <FieldLabel>Reason{suspending ? '' : ' (optional)'}</FieldLabel>
        <input value={reason} onChange={e => setReason(e.target.value)} style={field} />
      </ModalBody>
    </Modal>
  );
}
