'use client';
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Overview {
  totals: { events: number; people: number; users: number; devices: number; sessions: number };
  daily: { day: string; active: number; events: number }[];
  topEvents: { name: string; count: number; actors: number }[];
  topScreens: { screen: string; views: number }[];
  platforms: { platform: string; events: number; actors: number }[];
}

interface FunnelStage {
  key: string;
  count: number;
  pctOfTop: number;
  pctOfPrev: number;
  dropOffFromPrev: number;
  medianMinutesFromPrev: number | null;
}

interface RetentionCohort { cohort: string; size: number; weeks: number[] }

interface AppEventRow {
  id: string;
  name: string;
  userId: string | null;
  anonymousId: string | null;
  role: string | null;
  platform: string;
  screen: string | null;
  properties: Record<string, unknown> | null;
  occurredAt: string;
}

// ── Static config ──────────────────────────────────────────────────────────────

const WINDOWS = [7, 30, 90] as const;

const EVENT_LABELS: Record<string, string> = {
  app_opened: 'Opened app',
  screen_viewed: 'Viewed a screen',
  vendor_viewed: 'Viewed a vendor',
  search_performed: 'Searched',
  item_added_to_cart: 'Added to cart',
  checkout_started: 'Started checkout',
  order_placed: 'Placed order',
  payment_succeeded: 'Payment succeeded',
  payment_failed: 'Payment failed / abandoned',
  order_cancelled: 'Customer cancelled',
  order_accepted: 'Vendor accepted',
  order_rejected: 'Vendor rejected',
  order_ready: 'Vendor marked ready',
  job_accepted: 'Rider accepted job',
  delivery_completed: 'Delivered',
};
const label = (name: string) => EVENT_LABELS[name] ?? name;

const FUNNELS: { key: string; label: string; steps: string[] }[] = [
  { key: 'purchase', label: 'Browse → paid order', steps: ['vendor_viewed', 'item_added_to_cart', 'checkout_started', 'order_placed', 'payment_succeeded'] },
  { key: 'search', label: 'Search → order', steps: ['search_performed', 'vendor_viewed', 'item_added_to_cart', 'order_placed'] },
  { key: 'activation', label: 'Open app → first order', steps: ['app_opened', 'vendor_viewed', 'order_placed'] },
];

const RETENTION_MODES: { key: string; label: string; query: string }[] = [
  { key: 'orders', label: 'Customers ordering again', query: 'event=order_placed&role=CUSTOMER' },
  { key: 'active', label: 'Any signed-in activity', query: '' },
];

const fmtMinutes = (m: number | null) => {
  if (m === null) return '—';
  if (m < 1) return '<1m';
  if (m < 120) return `~${Math.round(m)}m`;
  if (m < 48 * 60) return `~${Math.round(m / 6) / 10}h`;
  return `~${Math.round(m / 144) / 10}d`;
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Fill gaps so quiet days show as zero-height bars instead of disappearing.
const fillDays = (daily: Overview['daily'], days: number) => {
  const byDay = new Map(daily.map(d => [d.day, d]));
  const out: { day: string; active: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    out.push({ day: d, active: byDay.get(d)?.active ?? 0 });
  }
  return out;
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AppUsagePage() {
  const { theme: T } = useTheme();
  const [days, setDays] = useState<number>(30);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [funnelKey, setFunnelKey] = useState(FUNNELS[0].key);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(true);

  const [retentionKey, setRetentionKey] = useState(RETENTION_MODES[0].key);
  const [cohorts, setCohorts] = useState<RetentionCohort[]>([]);
  const [retentionLoading, setRetentionLoading] = useState(true);

  const [eventFilter, setEventFilter] = useState('');
  const [events, setEvents] = useState<AppEventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPerPage, setEventsPerPage] = useState(20);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    setOverviewLoading(true);
    api.get<{ data: Overview }>(`/admin/analytics/usage/overview?days=${days}`)
      .then(res => setOverview(res.data))
      .catch(() => setOverview(null))
      .finally(() => setOverviewLoading(false));
  }, [days]);

  useEffect(() => {
    const steps = FUNNELS.find(f => f.key === funnelKey)!.steps;
    setFunnelLoading(true);
    api.get<{ data: { stages: FunnelStage[] } }>(`/admin/analytics/usage/funnel?days=${days}&steps=${steps.join(',')}`)
      .then(res => setFunnel(res.data.stages))
      .catch(() => setFunnel([]))
      .finally(() => setFunnelLoading(false));
  }, [days, funnelKey]);

  useEffect(() => {
    const q = RETENTION_MODES.find(r => r.key === retentionKey)!.query;
    setRetentionLoading(true);
    api.get<{ data: { cohorts: RetentionCohort[] } }>(`/admin/analytics/usage/retention?weeks=8${q ? `&${q}` : ''}`)
      .then(res => setCohorts(res.data.cohorts))
      .catch(() => setCohorts([]))
      .finally(() => setRetentionLoading(false));
  }, [retentionKey]);

  useEffect(() => {
    setEventsLoading(true);
    const params = new URLSearchParams({ page: String(eventsPage), limit: String(eventsPerPage) });
    if (eventFilter) params.set('name', eventFilter);
    api.get<{ data: AppEventRow[]; pagination: { total: number } }>(`/admin/analytics/usage/events?${params}`)
      .then(res => { setEvents(res.data); setEventsTotal(res.pagination.total); })
      .catch(() => { setEvents([]); setEventsTotal(0); })
      .finally(() => setEventsLoading(false));
  }, [eventFilter, eventsPage, eventsPerPage]);

  const dailyBars = useMemo(() => fillDays(overview?.daily ?? [], days), [overview, days]);
  const maxActive = Math.max(1, ...dailyBars.map(d => d.active));
  const funnelTop = funnel[0]?.count ?? 0;
  const maxRetentionWeeks = Math.max(0, ...cohorts.map(c => c.weeks.length));

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 20 } as const;
  const cardTitle = { fontSize: 13, fontWeight: 700, color: T.text } as const;
  const muted = { fontSize: 12, color: T.textMuted } as const;
  const pill = (active: boolean) => ({
    padding: '7px 12px', borderRadius: 4,
    border: active ? `1px solid ${T.primary}` : 'none',
    background: active ? T.primaryTint : T.surface2,
    color: active ? T.primary : T.textSec,
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  });
  const th = { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left' as const, textTransform: 'uppercase' as const, letterSpacing: '0.4px', whiteSpace: 'nowrap' as const };
  const td = { padding: '11px 16px', fontSize: 12, color: T.textSec };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>App Usage</div>
          <div style={{ fontSize: 13, color: T.textSec }}>How people move through the mobile and web apps — from browsing to delivered order.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {WINDOWS.map(w => (
            <button key={w} onClick={() => setDays(w)} style={pill(days === w)}>Last {w}d</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {[
          { label: 'People', value: overview?.totals.people, hint: 'Signed-in users + anonymous devices, de-duplicated' },
          { label: 'Signed-in users', value: overview?.totals.users, hint: 'Distinct accounts' },
          { label: 'Sessions', value: overview?.totals.sessions, hint: 'A new session after 30 idle minutes' },
          { label: 'Events', value: overview?.totals.events, hint: 'All tracked actions' },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: 16 }} title={k.hint}>
            <div style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.text, marginTop: 4 }}>
              {overviewLoading ? '…' : (k.value ?? 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Daily active */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <span style={cardTitle}>Daily active people</span>
          <span style={muted}>
            {(overview?.platforms ?? []).filter(p => p.platform !== 'SERVER').map(p => `${p.platform.toLowerCase()}: ${p.actors}`).join(' · ') || 'No client activity yet'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: days > 30 ? 1 : 3, height: 130 }}>
          {dailyBars.map(d => (
            <div
              key={d.day}
              title={`${d.day}: ${d.active} active`}
              style={{
                flex: 1, minWidth: 2,
                height: `${Math.max(2, (d.active / maxActive) * 120)}px`,
                background: d.active ? T.primary : T.surface3,
                borderRadius: '3px 3px 0 0',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...muted, marginTop: 6 }}>
          <span>{dailyBars[0]?.day}</span>
          <span>{dailyBars[dailyBars.length - 1]?.day}</span>
        </div>
      </div>

      {/* Funnel */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <span style={cardTitle}>Conversion funnel</span>
          <div style={{ display: 'flex', gap: 4, background: T.surface2, borderRadius: 4, padding: 3, flexWrap: 'wrap' }}>
            {FUNNELS.map(f => (
              <button key={f.key} onClick={() => setFunnelKey(f.key)} style={{
                padding: '5px 12px', borderRadius: 3, border: 'none',
                background: funnelKey === f.key ? T.primary : 'transparent',
                color: funnelKey === f.key ? '#fff' : T.textSec,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>{f.label}</button>
            ))}
          </div>
        </div>
        <div style={{ ...muted, marginBottom: 16 }}>
          People who did each step in order (first time in the window). Browsing before login is linked to the account it later signed in as.
        </div>
        {funnelLoading ? (
          <div style={{ fontSize: 13, color: T.textSec }}>Loading funnel…</div>
        ) : funnelTop === 0 ? (
          <div style={{ fontSize: 13, color: T.textSec }}>No one has reached the first step in this window yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {funnel.map((s, i) => (
              <div key={s.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{label(s.key)}</span>
                  <span style={{ fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>
                    <b style={{ color: T.text, fontSize: 14 }}>{s.count}</b>
                    <span style={{ marginLeft: 8 }}>{s.pctOfTop}%</span>
                    {i > 0 && s.dropOffFromPrev > 0 && (
                      <span style={{ marginLeft: 8, color: T.error, fontWeight: 700 }}>−{s.dropOffFromPrev}</span>
                    )}
                  </span>
                </div>
                <div style={{ height: 22, background: T.surface2, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(s.count / funnelTop) * 100}%`, background: T.primary, borderRadius: 4, transition: 'width 0.3s ease' }} />
                </div>
                {i > 0 && (
                  <div style={{ ...muted, fontSize: 11, marginTop: 3 }}>
                    {s.pctOfPrev}% of previous step · {fmtMinutes(s.medianMinutesFromPrev)} after it (median)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Retention */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={cardTitle}>Weekly retention</div>
            <div style={{ ...muted, marginTop: 2 }}>Cohort = week of first occurrence (last 8 weeks). Cells = how many came back that week.</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {RETENTION_MODES.map(r => (
              <button key={r.key} onClick={() => setRetentionKey(r.key)} style={pill(retentionKey === r.key)}>{r.label}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {retentionLoading ? (
            <div style={{ padding: 20, fontSize: 13, color: T.textSec }}>Loading…</div>
          ) : cohorts.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: T.textSec }}>No cohorts yet — retention fills in as weeks of data accumulate.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: T.surface2 }}>
                  <th style={th}>Week of</th>
                  <th style={th}>Users</th>
                  {Array.from({ length: maxRetentionWeeks }, (_, i) => (
                    <th key={i} style={{ ...th, textAlign: 'center' }}>{i === 0 ? 'Wk 0' : `+${i}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map(c => (
                  <tr key={c.cohort} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ ...td, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{c.cohort}</td>
                    <td style={td}>{c.size}</td>
                    {Array.from({ length: maxRetentionWeeks }, (_, i) => {
                      if (i >= c.weeks.length) return <td key={i} style={td} />;
                      const pct = c.size > 0 ? Math.round((c.weeks[i] / c.size) * 100) : 0;
                      return (
                        <td key={i} title={`${c.weeks[i]} of ${c.size}`} style={{
                          ...td, textAlign: 'center', fontWeight: 700,
                          color: pct >= 50 ? '#fff' : T.text,
                          background: `rgba(255,82,27,${0.08 + (pct / 100) * 0.82})`,
                        }}>{pct}%</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top screens + events */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, ...cardTitle }}>Top screens</div>
          {(overview?.topScreens ?? []).length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: T.textSec }}>No screen views yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {overview!.topScreens.map(s => (
                  <tr key={s.screen} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', color: T.text, wordBreak: 'break-all' }}>{s.screen}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{s.views.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, ...cardTitle }}>Events</div>
          {(overview?.topEvents ?? []).length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: T.textSec }}>No events yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface2 }}>
                  <th style={th}>Event</th>
                  <th style={{ ...th, textAlign: 'right' }}>Count</th>
                  <th style={{ ...th, textAlign: 'right' }}>People</th>
                </tr>
              </thead>
              <tbody>
                {overview!.topEvents.map(e => (
                  <tr key={e.name} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ ...td, color: T.text, fontWeight: 600 }}>{label(e.name)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{e.count.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{e.actors.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Raw stream */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={cardTitle}>Live event stream</div>
            <div style={{ ...muted, marginTop: 2 }}>Newest first — useful for checking a new event is firing.</div>
          </div>
          <select
            value={eventFilter}
            onChange={e => { setEventFilter(e.target.value); setEventsPage(1); }}
            style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 8px', color: T.text, fontSize: 12, fontFamily: 'inherit' }}
          >
            <option value="">All events</option>
            {Object.keys(EVENT_LABELS).map(n => <option key={n} value={n}>{label(n)}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Time', 'Event', 'Who', 'Platform', 'Screen', 'Details'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {eventsLoading ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', padding: 28 }}>Loading…</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', padding: 28 }}>No events yet.</td></tr>
              ) : events.map(e => (
                <tr key={e.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtTime(e.occurredAt)}</td>
                  <td style={{ ...td, color: T.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{label(e.name)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {e.userId
                      ? <a href={`/crm/profiles/${e.userId}`} style={{ color: T.primary, textDecoration: 'none' }}>{e.role?.toLowerCase() ?? 'user'}</a>
                      : <span title={e.anonymousId ?? ''}>anonymous</span>}
                  </td>
                  <td style={td}>{e.platform.toLowerCase()}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{e.screen ?? '—'}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 11, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={e.properties ? JSON.stringify(e.properties) : ''}>
                    {e.properties ? Object.entries(e.properties).map(([k, v]) => `${k}=${v}`).join(' ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          total={eventsTotal}
          page={eventsPage}
          perPage={eventsPerPage}
          onPageChange={setEventsPage}
          onPerPageChange={(size) => { setEventsPerPage(size); setEventsPage(1); }}
        />
      </div>
    </div>
  );
}
