'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Card, Delta, Empty, Field, Input, LineChart, Notice, PageHeader, PLATFORMS, Pill, PlatformTag, Select, Stat, Table, Tabs, Td,
  fmtDate, num, pretty, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

interface Summary {
  opening: { value: number; date: string; isBaseline: boolean } | null; closing: { value: number; date: string } | null;
  netGrowth: number | null; growthPct: number | null;
  totals: { reach: number | null; impressions: number | null; engagement: number | null; profileVisits: number | null; videoViews: number | null; websiteClicks: number | null };
  engagementRateReach: number | null; engagementRateFollowers: number | null; coverage: number; complete: boolean; daysWithData: number; daysExpected: number; notes: string[];
}
interface Roll { followers: number | null; netGrowth: number | null; growthPct: number | null; reach: number | null; impressions: number | null; engagement: number | null; profileVisits: number | null; videoViews: number | null; websiteClicks: number | null; engagementRateReach: number | null; accounts: number; accountsWithData: number; coverage: number }
interface Post { variantId: string; contentId: string; title: string; account: string; platform: string; category: string | null; format: string; url: string | null; reach: number | null; engagement: number | null; engagementRate: number | null }
interface Overview {
  period: { label: string; from: string; to: string }; previousPeriod: { from: string; to: string }; scope: string;
  totals: { current: Roll; previous: Roll };
  byPlatform: { platform: string; current: Roll; previous: Roll }[];
  accounts: { accountId: string; name: string; platform: string; current: Summary; previous: Summary; delta: { followersPct: number | null; reachPct: number | null; engagementPct: number | null } }[];
  series: { date: string; followers: number | null }[];
  posts: { top: Post[]; bottom: Post[]; measured: number; unmeasured: number; total: number; byCategory: { name: string; posts: number; measured: number; avgEngagementRate: number | null }[]; byFormat: { name: string; posts: number; measured: number; avgEngagementRate: number | null }[] };
  dataIntegrity: { source: string; status: string; metricVersion: string; asOf: string; coverage: number; complete: boolean };
}
interface Reading { id: string; snapshotDate: string; followers: number | null; reach: number | null; impressions: number | null; engagement: number | null; profileVisits: number | null; videoViews: number | null; websiteClicks: number | null; note: string | null; enteredByName: string | null; correctedByName: string | null; correctionReason: string | null; dataStatus: string; account: { name: string; platform: string } }

const PERIODS = [['week', 'This week'], ['lastWeek', 'Last week'], ['month', 'This month'], ['lastMonth', 'Last month'], ['quarter', 'This quarter'], ['lastQuarter', 'Last quarter'], ['year', 'This year'], ['lastYear', 'Last year'], ['custom', 'Custom range']];
const FIELDS: [string, string][] = [['followers', 'Followers (total today)'], ['reach', 'Reach'], ['impressions', 'Impressions'], ['engagement', 'Engagement actions'], ['profileVisits', 'Profile visits'], ['videoViews', 'Video views'], ['websiteClicks', 'Website clicks']];

export default function AnalyticsPage() {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const [tab, setTab] = useState<'overview' | 'readings' | 'definitions'>('overview');
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [platform, setPlatform] = useState(''); const [accountId, setAccountId] = useState('');
  const [recording, setRecording] = useState(false);

  const accounts = useLoad(() => api.get<{ data: { id: string; name: string; platform: string }[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const qs = new URLSearchParams({ period, ...(period === 'custom' && from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}), ...(period === 'custom' && to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}), ...(platform ? { platform } : {}), ...(accountId ? { accountId } : {}) });
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Overview }>(`/admin/smois/analytics/overview?${qs}`).then((r) => r.data), [qs.toString()]);

  const cur = data?.totals.current; const prev = data?.totals.previous;
  const pc = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || b === null || b === undefined || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 10000) / 100);

  return (
    <div>
      <PageHeader
        title="Analytics and growth"
        sub="Audience and engagement history, compared with the previous period. Until a platform is connected, every figure is a reading someone entered, and missing days are shown as missing."
        actions={me?.can.recordMetrics ? <Btn kind="primary" onClick={() => setRecording(true)}>+ Record a reading</Btn> : undefined}
      />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'overview', label: 'Growth' }, { id: 'readings', label: 'Recorded readings' }, { id: 'definitions', label: 'Metric definitions' }]} />

      {tab === 'overview' && (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <Field label="Period"><Select value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              {period === 'custom' && <><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
              <Field label="Platform"><Select value={platform} onChange={(e) => { setPlatform(e.target.value); setAccountId(''); }}><option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></Field>
              <Field label="Account"><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">All accounts</option>{accounts.data?.filter((a) => !platform || a.platform === platform).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            </div>
          </Card>
          {error && <Notice kind="error">{error}</Notice>}
          {loading && !data && <Empty>Loading…</Empty>}
          {data && cur && prev && (
            <>
              <Notice kind={data.dataIntegrity.complete ? 'info' : 'warn'}>
                {data.dataIntegrity.status} Showing {data.period.from} to {data.period.to} against {data.previousPeriod.from} to {data.previousPeriod.to}. {cur.accountsWithData} of {cur.accounts} accounts have readings; {Math.round(cur.coverage * 100)}% of expected days recorded{data.dataIntegrity.complete ? '' : ', so totals are partial'}. Scope: {data.scope}.
              </Notice>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
                <Stat label="Followers" value={num(cur.followers)} delta={pc(cur.followers, prev.followers)} />
                <Stat label="Net growth" value={num(cur.netGrowth)} sub={cur.growthPct !== null ? `${cur.growthPct}%` : undefined} delta={pc(cur.netGrowth, prev.netGrowth)} />
                <Stat label="Reach" value={num(cur.reach)} delta={pc(cur.reach, prev.reach)} />
                <Stat label="Impressions" value={num(cur.impressions)} delta={pc(cur.impressions, prev.impressions)} />
                <Stat label="Engagement" value={num(cur.engagement)} delta={pc(cur.engagement, prev.engagement)} />
                <Stat label="Engagement rate (reach)" value={num(cur.engagementRateReach, '%')} delta={pc(cur.engagementRateReach, prev.engagementRateReach)} />
                <Stat label="Video views" value={num(cur.videoViews)} delta={pc(cur.videoViews, prev.videoViews)} />
                <Stat label="Website clicks" value={num(cur.websiteClicks)} delta={pc(cur.websiteClicks, prev.websiteClicks)} />
              </div>

              <Card title="Followers over time" style={{ marginBottom: 16 }}><LineChart points={data.series.map((s) => ({ label: s.date, value: s.followers }))} /></Card>

              {data.byPlatform.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '0 0 8px' }}>Platform comparison</div>
                  <Table head={['Platform', 'Followers', 'Net growth', 'Growth %', 'Reach', 'Engagement', 'Eng. rate']}>
                    {data.byPlatform.map((p) => (
                      <tr key={p.platform}>
                        <Td><PlatformTag platform={p.platform} /></Td><Td>{num(p.current.followers)} <Delta pct={pc(p.current.followers, p.previous.followers)} /></Td>
                        <Td>{num(p.current.netGrowth)}</Td><Td>{num(p.current.growthPct, '%')}</Td><Td>{num(p.current.reach)} <Delta pct={pc(p.current.reach, p.previous.reach)} /></Td>
                        <Td>{num(p.current.engagement)}</Td><Td>{num(p.current.engagementRateReach, '%')}</Td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}

              <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '0 0 8px' }}>Accounts</div>
              {data.accounts.length === 0 ? <Empty>No accounts to show.</Empty> : (
                <Table head={['Account', 'Opening', 'Closing', 'Net growth', 'Reach', 'Impressions', 'Engagement', 'Data']}>
                  {data.accounts.map((a) => (
                    <tr key={a.accountId}>
                      <Td><PlatformTag platform={a.platform} name={a.name} /></Td>
                      <Td>{a.current.opening ? <>{num(a.current.opening.value)}{a.current.opening.isBaseline && <div style={{ fontSize: 10, color: T.textMuted }}>baseline {a.current.opening.date}</div>}</> : <span style={{ color: T.textMuted }}>Not recorded</span>}</Td>
                      <Td>{num(a.current.closing?.value)} <Delta pct={a.delta.followersPct} /></Td>
                      <Td>{num(a.current.netGrowth)}{a.current.growthPct !== null && <div style={{ fontSize: 11, color: T.textSec }}>{a.current.growthPct}%</div>}</Td>
                      <Td>{num(a.current.totals.reach)} <Delta pct={a.delta.reachPct} /></Td>
                      <Td>{num(a.current.totals.impressions)}</Td>
                      <Td>{num(a.current.totals.engagement)} <Delta pct={a.delta.engagementPct} /></Td>
                      <Td title={a.current.notes.join(' ')}><Pill tone={a.current.complete ? 'good' : a.current.daysWithData ? 'warn' : 'neutral'}>{a.current.daysWithData}/{a.current.daysExpected} days</Pill></Td>
                    </tr>
                  ))}
                </Table>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, margin: '18px 0' }}>
                <PostList title="Best-performing posts" posts={data.posts.top} empty="No published posts have readings in this period yet." />
                <PostList title="Lowest-performing posts" posts={data.posts.bottom} empty="Shown once more than five posts have readings." />
              </div>
              <div style={{ fontSize: 12, color: T.textSec, marginBottom: 12 }}>{data.posts.measured} of {data.posts.total} published posts have a recorded reading{data.posts.unmeasured > 0 ? `; ${data.posts.unmeasured} have none and are left out of the rankings` : ''}. Record post results from the post&apos;s Results tab in Content.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                <GroupTable title="By content category" rows={data.posts.byCategory} />
                <GroupTable title="By content format" rows={data.posts.byFormat} />
              </div>
            </>
          )}
        </>
      )}

      {tab === 'readings' && <Readings canCorrect={!!me?.can.correctMetrics} accounts={accounts.data ?? []} onChanged={reload} />}
      {tab === 'definitions' && <Definitions />}
      {recording && <RecordReading accounts={accounts.data ?? []} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); reload(); }} />}
    </div>
  );
}

function PostList({ title, posts, empty }: { title: string; posts: Post[]; empty: string }) {
  const { theme: T } = useTheme();
  return (
    <Card title={title}>
      {posts.length === 0 ? <Empty>{empty}</Empty> : posts.map((p) => (
        <Link key={p.variantId} href={`/smois/content?open=${p.contentId}`} style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: `1px solid ${T.border}` }}>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div><div style={{ fontSize: 11, color: T.textSec }}><PlatformTag platform={p.platform} name={p.account} /></div></div>
            <div style={{ textAlign: 'right', fontSize: 12, color: T.text, fontWeight: 700 }}>{num(p.engagementRate, '%')}<div style={{ fontSize: 11, fontWeight: 500, color: T.textSec }}>{num(p.engagement)} actions · reach {num(p.reach)}</div></div>
          </div>
        </Link>
      ))}
    </Card>
  );
}

function GroupTable({ title, rows }: { title: string; rows: { name: string; posts: number; measured: number; avgEngagementRate: number | null }[] }) {
  const { theme: T } = useTheme();
  return (
    <Card title={title}>
      {rows.length === 0 ? <Empty>No published posts in this period.</Empty> : rows.map((g) => (
        <div key={g.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: `1px solid ${T.border}`, fontSize: 13 }}>
          <span style={{ color: T.text }}>{pretty(g.name)} <span style={{ color: T.textMuted, fontSize: 11 }}>{g.posts} posts, {g.measured} measured</span></span>
          <b style={{ color: T.text }}>{num(g.avgEngagementRate, '%')}</b>
        </div>
      ))}
    </Card>
  );
}

function RecordReading({ accounts, onClose, onSaved }: { accounts: { id: string; name: string; platform: string }[]; onClose: () => void; onSaved: () => void }) {
  const { me } = useSmois();
  const [f, setF] = useState<Record<string, string>>({ accountId: '', date: new Date().toLocaleDateString('en-CA'), note: '' });
  const { busy, error, run } = useAction();
  const mine = useLoad(() => api.get<{ data: { accounts: { accountId: string }[] } }>('/admin/smois/analytics/overview?period=month').then((r) => r.data.accounts), []);
  const allowed = me?.level === 'MANAGER' ? accounts.filter((a) => mine.data?.some((x) => x.accountId === a.id)) : accounts;
  const save = () => run(async () => { await api.post('/admin/smois/metrics/snapshots', f); onSaved(); });
  return (
    <Modal open onClose={onClose} title="Record a reading" width={560}>
      <div style={{ padding: 20 }}>
        <Notice kind="info">Enter figures exactly as the platform shows them for that day. Leave a box empty if you don&apos;t have it: empty means &quot;not recorded&quot;, not zero. A recorded day can&apos;t be overwritten; management can correct it with a reason.</Notice>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Account"><Select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}><option value="">Choose…</option>{allowed.map((a) => <option key={a.id} value={a.id}>{a.name} ({pretty(a.platform)})</option>)}</Select></Field>
          <Field label="Date of the reading"><Input type="date" max={new Date().toLocaleDateString('en-CA')} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          {FIELDS.map(([k, label]) => <Field key={k} label={label}><Input type="number" min={0} step={1} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        </div>
        <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Where you read it, anything unusual" /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.accountId} onClick={save}>{busy ? 'Saving…' : 'Record'}</Btn></div>
      </div>
    </Modal>
  );
}

function Readings({ canCorrect, accounts, onChanged }: { canCorrect: boolean; accounts: { id: string; name: string }[]; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const [accountId, setAccountId] = useState('');
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Reading[] }>(`/admin/smois/metrics/snapshots${accountId ? `?accountId=${accountId}` : ''}`).then((r) => r.data), [accountId]);
  const [fix, setFix] = useState<Reading | null>(null);
  return (
    <div>
      <div style={{ width: 240, marginBottom: 12 }}><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">All my accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.length === 0 ? <Empty>No readings recorded yet.</Empty> : data && (
        <Table head={['Date', 'Account', 'Followers', 'Reach', 'Impressions', 'Engagement', 'Visits', 'Video views', 'Clicks', 'Entered by', '']}>
          {data.map((r) => (
            <tr key={r.id}>
              <Td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.snapshotDate)}</Td><Td>{r.account.name}</Td>
              <Td>{num(r.followers)}</Td><Td>{num(r.reach)}</Td><Td>{num(r.impressions)}</Td><Td>{num(r.engagement)}</Td><Td>{num(r.profileVisits)}</Td><Td>{num(r.videoViews)}</Td><Td>{num(r.websiteClicks)}</Td>
              <Td style={{ fontSize: 12 }}>{r.enteredByName}<div style={{ color: T.textMuted }}>{r.dataStatus.toLowerCase()}</div>{r.correctedByName && <div style={{ color: T.warning }} title={r.correctionReason ?? ''}>corrected by {r.correctedByName}</div>}</Td>
              <Td>{canCorrect && <Btn small onClick={() => setFix(r)}>Correct</Btn>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {fix && <Correct r={fix} onClose={() => setFix(null)} onSaved={() => { setFix(null); reload(); onChanged(); }} />}
    </div>
  );
}

function Correct({ r, onClose, onSaved }: { r: Reading; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(([k]) => [k, (r as unknown as Record<string, number | null>)[k] === null ? '' : String((r as unknown as Record<string, number | null>)[k])])));
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Correct ${r.account.name}, ${fmtDate(r.snapshotDate)}`} width={520}>
      <div style={{ padding: 20 }}>
        <Notice kind="warn">The original values stay in the activity log. A reason is required.</Notice>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{FIELDS.map(([k, label]) => <Field key={k} label={label}><Input type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}</div>
        <Field label="Reason for the correction"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !reason.trim()} onClick={() => run(async () => { await api.put(`/admin/smois/metrics/snapshots/${r.id}`, { ...f, reason }); onSaved(); })}>{busy ? 'Saving…' : 'Save correction'}</Btn></div>
      </div>
    </Modal>
  );
}

function Definitions() {
  const { theme: T } = useTheme();
  const { data } = useLoad(() => api.get<{ data: { version: string; metrics: { key: string; label: string; kind: string; definition: string }[] } }>('/admin/smois/metrics/dictionary').then((r) => r.data), []);
  if (!data) return <Empty>Loading…</Empty>;
  return (
    <div>
      <Notice kind="info">Metric definitions, version {data.version}. Similar-sounding metrics are not assumed to mean the same thing across platforms: compare a figure with the same platform&apos;s earlier figures.</Notice>
      {data.metrics.map((m) => (
        <div key={m.key} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
          <b style={{ color: T.text, fontSize: 13 }}>{m.label}</b> <Pill>{m.kind}</Pill>
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 3 }}>{m.definition}</div>
        </div>
      ))}
    </div>
  );
}
