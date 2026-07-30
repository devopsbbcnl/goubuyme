'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';

type Role = 'VENDOR' | 'RIDER' | 'CUSTOMER';

interface Stage {
  key: string;
  label: string;
  count: number;
  dropOffFromPrev: number;
  pctOfTop: number;
  medianHoursFromSignup?: number | null;
}

interface FunnelResponse {
  data: { role: Role; windowDays: number | null; stages: Stage[]; generatedAt: string };
}

interface EventFunnelResponse {
  data: { role: Role; windowDays: number | null; cohortSize: number; stages: Stage[]; generatedAt: string };
}

type FunnelMode = 'snapshot' | 'tracked';

const fmtDuration = (h: number | null | undefined): string => {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `~${Math.round(h * 60)}m`;
  if (h < 48) return `~${Math.round(h * 10) / 10}h`;
  return `~${Math.round(h / 24 * 10) / 10}d`;
};

interface StuckUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  stuckStage: string;
  registeredAt: string;
  hoursSinceSignup: number;
}

interface StuckResponse {
  data: StuckUser[];
  pagination: { total: number };
}

// Stuck stages per role: key + human label + why they're worth reaching out to.
const STUCK_STAGES: Record<Role, { key: string; label: string; reason: string }[]> = {
  VENDOR: [
    { key: 'unverified', label: 'Never verified email', reason: 'Signed up but never confirmed their email.' },
    { key: 'no_profile', label: 'No store profile', reason: 'Verified but never set up logo/cover.' },
    { key: 'no_docs', label: 'No documents', reason: 'Profile set up but never submitted KYC documents.' },
    { key: 'pending_approval', label: 'Awaiting approval', reason: 'Documents in — waiting on your review.' },
  ],
  RIDER: [
    { key: 'unverified', label: 'Never verified email', reason: 'Signed up but never confirmed their email.' },
    { key: 'no_docs', label: 'No documents', reason: 'Verified but never submitted KYC documents.' },
    { key: 'pending_approval', label: 'Awaiting approval', reason: 'Documents in — waiting on your review.' },
  ],
  CUSTOMER: [
    { key: 'unverified', label: 'Never verified email', reason: 'Signed up but never confirmed their email.' },
    { key: 'no_order', label: 'Never ordered', reason: 'Verified but never placed a first order.' },
  ],
};

const WINDOWS: { label: string; days: number | null }[] = [
  { label: 'All time', days: null },
  { label: 'Last 90d', days: 90 },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 7d', days: 7 },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const csvEscape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

export default function AnalyticsPage() {
  const { theme: T } = useTheme();

  const [role, setRole] = useState<Role>('VENDOR');
  const [windowDays, setWindowDays] = useState<number | null>(30);

  const [funnel, setFunnel] = useState<Stage[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelMode, setFunnelMode] = useState<FunnelMode>('snapshot');
  const [cohortSize, setCohortSize] = useState<number | null>(null);

  const [stage, setStage] = useState<string>('unverified');
  const [staleHours, setStaleHours] = useState(24);
  const [users, setUsers] = useState<StuckUser[]>([]);
  const [total, setTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [exporting, setExporting] = useState(false);

  // Reset stage to the first valid one whenever role changes.
  useEffect(() => {
    setStage(STUCK_STAGES[role][0].key);
    setPage(1);
  }, [role]);

  // Funnel fetch — snapshot (derived from current state) or tracked (event stream)
  useEffect(() => {
    setFunnelLoading(true);
    const params = new URLSearchParams({ role });
    if (windowDays) params.set('days', String(windowDays));
    if (funnelMode === 'tracked') {
      api.get<EventFunnelResponse>(`/admin/analytics/event-funnel?${params}`)
        .then(res => { setFunnel(res.data.stages); setCohortSize(res.data.cohortSize); })
        .catch(() => { setFunnel([]); setCohortSize(null); })
        .finally(() => setFunnelLoading(false));
    } else {
      setCohortSize(null);
      api.get<FunnelResponse>(`/admin/analytics/funnel?${params}`)
        .then(res => setFunnel(res.data.stages))
        .catch(() => setFunnel([]))
        .finally(() => setFunnelLoading(false));
    }
  }, [role, windowDays, funnelMode]);

  // Stuck-users fetch
  const buildStuckParams = useCallback(
    (p: number, limit: number) => {
      const params = new URLSearchParams({
        role, stage, staleHours: String(staleHours), page: String(p), limit: String(limit),
      });
      return params;
    },
    [role, stage, staleHours],
  );

  useEffect(() => {
    setUsersLoading(true);
    api.get<StuckResponse>(`/admin/analytics/stuck-users?${buildStuckParams(page, perPage)}`)
      .then(res => { setUsers(res.data); setTotal(res.pagination.total); })
      .catch(() => { setUsers([]); setTotal(0); })
      .finally(() => setUsersLoading(false));
  }, [buildStuckParams, page, perPage]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      // Pull every stuck user for this stage (up to 200/page) so outreach lists are complete.
      const all: StuckUser[] = [];
      let p = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await api.get<StuckResponse>(`/admin/analytics/stuck-users?${buildStuckParams(p, 200)}`);
        all.push(...res.data);
        if (all.length >= res.pagination.total || res.data.length === 0) break;
        p += 1;
      }
      const header = ['Name', 'Email', 'Phone', 'Role', 'Stage', 'Registered', 'Hours since signup'];
      const rows = all.map(u => [
        u.name, u.email, u.phone ?? '', u.role, u.stuckStage, u.registeredAt, String(u.hoursSinceSignup),
      ].map(csvEscape).join(','));
      const csv = [header.map(csvEscape).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stuck-${role.toLowerCase()}-${stage}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // errors surfaced by api wrapper
    } finally {
      setExporting(false);
    }
  };

  const topCount = funnel[0]?.count ?? 0;
  const activeStageMeta = STUCK_STAGES[role].find(s => s.key === stage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Onboarding Analytics</div>
          <div style={{ fontSize: 13, color: T.textSec }}>Signup & onboarding funnel — find who dropped off and reach out.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {WINDOWS.map(w => (
            <button key={w.label} onClick={() => setWindowDays(w.days)} style={{
              padding: '7px 12px', borderRadius: 4,
              border: windowDays === w.days ? `1px solid ${T.primary}` : 'none',
              background: windowDays === w.days ? T.primaryTint : T.surface2,
              color: windowDays === w.days ? T.primary : T.textSec,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>{w.label}</button>
          ))}
        </div>
      </div>

      {/* Role tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['VENDOR', 'RIDER', 'CUSTOMER'] as const).map(r => (
          <button key={r} onClick={() => setRole(r)} style={{
            padding: '8px 18px', borderRadius: 4,
            border: role === r ? `1px solid ${T.primary}` : 'none',
            background: role === r ? T.primaryTint : T.surface2,
            color: role === r ? T.primary : T.textSec,
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}>{r.charAt(0) + r.slice(1).toLowerCase()}s</button>
        ))}
      </div>

      {/* Funnel */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Conversion funnel</span>
            <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 8 }}>
              {funnelMode === 'tracked'
                ? `Tracked events${cohortSize !== null ? ` · ${cohortSize} in cohort` : ''}`
                : 'Snapshot of current state'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, background: T.surface2, borderRadius: 4, padding: 3 }}>
            {(['snapshot', 'tracked'] as const).map(m => (
              <button key={m} onClick={() => setFunnelMode(m)} style={{
                padding: '5px 12px', borderRadius: 3, border: 'none',
                background: funnelMode === m ? T.primary : 'transparent',
                color: funnelMode === m ? '#fff' : T.textSec,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>{m === 'snapshot' ? 'Snapshot' : 'Tracked'}</button>
            ))}
          </div>
        </div>
        {funnelMode === 'tracked' && (
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14, marginTop: -6 }}>
            Median time from signup shown per step. Historical users appear only after the backfill script runs.
          </div>
        )}
        {funnelLoading ? (
          <div style={{ fontSize: 13, color: T.textSec, padding: '16px 0' }}>Loading funnel…</div>
        ) : funnel.length === 0 || topCount === 0 ? (
          <div style={{ fontSize: 13, color: T.textSec, padding: '16px 0' }}>No signups in this window.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {funnel.map((s, i) => (
              <div key={s.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: T.textSec }}>
                    <b style={{ color: T.text, fontSize: 14 }}>{s.count}</b>
                    <span style={{ marginLeft: 8 }}>{s.pctOfTop}%</span>
                    {i > 0 && s.dropOffFromPrev > 0 && (
                      <span style={{ marginLeft: 8, color: T.error, fontWeight: 700 }}>−{s.dropOffFromPrev}</span>
                    )}
                  </span>
                </div>
                <div style={{ height: 22, background: T.surface2, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${topCount > 0 ? (s.count / topCount) * 100 : 0}%`,
                    background: T.primary, borderRadius: 4, transition: 'width 0.3s ease',
                  }} />
                </div>
                {funnelMode === 'tracked' && i > 0 && (
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
                    {fmtDuration(s.medianHoursFromSignup)} from signup (median)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stuck users */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Dropped off — reach out</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 12, color: T.textSec }}>
                Stuck for over&nbsp;
                <select
                  value={staleHours}
                  onChange={e => { setStaleHours(Number(e.target.value)); setPage(1); }}
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 8px', color: T.text, fontSize: 12, fontFamily: 'inherit' }}
                >
                  <option value={0}>any time</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                  <option value={720}>30 days</option>
                </select>
              </label>
              <button
                onClick={exportCsv}
                disabled={exporting || total === 0}
                style={{
                  padding: '7px 14px', borderRadius: 4, border: `1px solid ${T.primary}`,
                  background: T.primaryTint, color: T.primary, fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', cursor: exporting || total === 0 ? 'default' : 'pointer',
                  opacity: exporting || total === 0 ? 0.5 : 1,
                }}
              >{exporting ? 'Exporting…' : '↓ Export CSV'}</button>
            </div>
          </div>
          {/* Stage sub-tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STUCK_STAGES[role].map(s => (
              <button key={s.key} onClick={() => { setStage(s.key); setPage(1); }} style={{
                padding: '6px 12px', borderRadius: 999,
                border: stage === s.key ? `1px solid ${T.primary}` : `1px solid ${T.border}`,
                background: stage === s.key ? T.primaryTint : 'transparent',
                color: stage === s.key ? T.primary : T.textSec,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>{s.label}</button>
            ))}
          </div>
          {activeStageMeta && (
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 10 }}>{activeStageMeta.reason}</div>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              {['Name', 'Email', 'Phone', 'Signed up', 'Waiting'].map(h => (
                <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usersLoading ? (
              <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>Nobody stuck here 🎉</td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.text }}>{u.name}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{u.email}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{u.phone ?? '—'}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{fmtDate(u.registeredAt)}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, fontWeight: 600, color: u.hoursSinceSignup >= 168 ? T.error : T.textSec }}>
                  {u.hoursSinceSignup >= 48 ? `${Math.floor(u.hoursSinceSignup / 24)}d` : `${u.hoursSinceSignup}h`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={(size) => { setPerPage(size); setPage(1); }}
        />
      </div>
    </div>
  );
}
