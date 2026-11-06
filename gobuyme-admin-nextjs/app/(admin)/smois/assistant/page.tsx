'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Input, LineChart, Notice, PageHeader, Pill, Select, Tabs, TextArea, num, pretty, useAction, useLoad, useSmois } from '@/components/smois/ui';

export interface AiStatus { enabled: boolean; available: boolean; dailyLimit: number; usedToday: number; remainingToday: number; provider: string }

/** One line that explains the state of AI assistance, so nobody wonders why a button does nothing. */
export function AiBanner({ status }: { status: AiStatus | null }) {
  if (!status) return null;
  if (!status.enabled) return <Notice kind="warn">AI assistance is switched off. A super admin can turn it on in Social Settings. Forecasts and suggestions below do not need it.</Notice>;
  if (!status.available) return <Notice kind="warn">AI assistance is on, but no connection to the AI service is configured.</Notice>;
  return <Notice kind="info">AI drafts are suggestions for you to check. They use only your recorded data, and any figure they mention that is not in that data is flagged. You have {status.remainingToday} of {status.dailyLimit} requests left today.</Notice>;
}

const PERIODS = [['week', 'This week'], ['lastWeek', 'Last week'], ['month', 'This month'], ['lastMonth', 'Last month'], ['quarter', 'This quarter'], ['year', 'This year']];
const EXAMPLES = ['How did we perform this month?', 'Which platform grew the most?', 'Which content performed best?', 'Which targets are at risk?', 'How many posts did we publish?'];

interface Answer { answer: string; basis: string[]; notRecorded: string[]; period: { label: string; from: string; to: string }; verification: { checked: number; unverified: string[] }; verificationNote: string | null; model: string }
interface Forecast { account: { name: string; platform: string }; horizonDays: number; history: { date: string; value: number }[]; forecast: { ok: false; reason: string } | { ok: true; targetDate: string; projected: number; low: number; high: number; perDay: number; confidence: string; basis: { readings: number; from: string; to: string; spanDays: number; r2: number }; note: string }; outlooks: { target: string; goal: number; endsOn: string; outlook: string | null; projectedGrowth: number | null; reason: string | null }[] }
interface Timing { scope: string; published: number; result: { ok: false; reason: string } | { ok: true; sample: number; byWeekday: { day: string; posts: number; avgRate: number }[]; byBand: { band: string; posts: number; avgRate: number }[]; best: { day: string | null; band: string | null }; note: string } }
interface Finding { key: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; title: string; evidence: string; suggestion: string; link: string }

export default function AssistantPage() {
  const { me } = useSmois();
  const [tab, setTab] = useState<'ask' | 'forecast' | 'timing' | 'suggestions'>('ask');
  const status = useLoad(() => api.get<{ data: AiStatus }>('/admin/smois/ai/status').then((r) => r.data), []);
  const tabs = [{ id: 'ask' as const, label: 'Ask the data' }, { id: 'forecast' as const, label: 'Follower forecast' }, { id: 'timing' as const, label: 'Best times to post' }, ...(me?.can.reviewReports ? [{ id: 'suggestions' as const, label: 'Workflow suggestions' }] : [])];
  return (
    <div>
      <PageHeader title="Insights and assistant" sub="Ask questions about your recorded data, see trends projected forward, and get suggestions for how the team works. Estimates are labelled as such, and each one says when there is too little data." />
      <Tabs value={tab} onChange={setTab} items={tabs} />
      {tab === 'ask' && <Ask status={status.data} onUsed={status.reload} />}
      {tab === 'forecast' && <ForecastTab />}
      {tab === 'timing' && <TimingTab />}
      {tab === 'suggestions' && <Suggestions />}
    </div>
  );
}

function Ask({ status, onUsed }: { status: AiStatus | null; onUsed: () => void }) {
  const { theme: T } = useTheme();
  const [q, setQ] = useState(''); const [period, setPeriod] = useState('month');
  const [a, setA] = useState<Answer | null>(null);
  const { busy, error, setError, run } = useAction();
  const ask = (question = q) => run(async () => { setError(''); const r = await api.post<{ data: Answer }>('/admin/smois/ai/ask', { question, period }); setA(r.data); onUsed(); });
  return (
    <div>
      <AiBanner status={status} />
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12 }}>
          <Field label="Your question"><TextArea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="How did we perform this month?" /></Field>
          <Field label="Period"><Select value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{EXAMPLES.map((e) => <Btn key={e} small onClick={() => { setQ(e); ask(e); }}>{e}</Btn>)}</div>
        <Btn kind="primary" disabled={busy || !q.trim() || !status?.enabled} onClick={() => ask()}>{busy ? 'Thinking…' : 'Ask'}</Btn>
      </Card>
      {error && <Notice kind="error">{error}</Notice>}
      {a && (
        <Card title={`Answer · ${a.period.label} (${a.period.from} to ${a.period.to})`}>
          <div style={{ fontSize: 14, color: T.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{a.answer}</div>
          {a.verificationNote && <div style={{ marginTop: 10 }}><Notice kind="warn">{a.verificationNote}</Notice></div>}
          {a.notRecorded.length > 0 && <div style={{ fontSize: 12, color: T.textSec, marginTop: 8 }}>Not recorded: {a.notRecorded.join('; ')}</div>}
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>AI-generated draft. Based on: {a.basis.length ? a.basis.join(', ') : 'no section'}. {a.verification.checked} figure(s) checked against the data. Check it before you share it.</div>
        </Card>
      )}
    </div>
  );
}

function ForecastTab() {
  const { theme: T } = useTheme();
  const accounts = useLoad(() => api.get<{ data: { id: string; name: string; platform: string }[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const [accountId, setAccountId] = useState(''); const [days, setDays] = useState('30');
  const { data, loading, error } = useLoad(() => (accountId ? api.get<{ data: Forecast }>(`/admin/smois/insights/forecast?accountId=${accountId}&days=${days}`).then((r) => r.data) : Promise.resolve(null)), [accountId, days]);
  const f = data?.forecast;
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 240 }}><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Choose an account…</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name} ({pretty(a.platform)})</option>)}</Select></div>
        <div style={{ width: 160 }}><Select value={days} onChange={(e) => setDays(e.target.value)}><option value="14">14 days ahead</option><option value="30">30 days ahead</option><option value="60">60 days ahead</option><option value="90">90 days ahead</option></Select></div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!accountId ? <Empty>Pick an account to see where its follower count is heading.</Empty> : loading && !data ? <Empty>Loading…</Empty> : data && f && (
        f.ok === false ? <Notice kind="info">{f.reason}</Notice> : (
          <>
            <Notice kind="warn">Estimate, not a promise. {f.note}</Notice>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
              <Card><div style={{ fontSize: 11, color: T.textSec, fontWeight: 700, textTransform: 'uppercase' }}>Projected on {f.targetDate}</div><div style={{ fontSize: 26, fontWeight: 800, color: T.text }}>{num(f.projected)}</div><div style={{ fontSize: 12, color: T.textSec }}>likely range {num(f.low)} to {num(f.high)}</div></Card>
              <Card><div style={{ fontSize: 11, color: T.textSec, fontWeight: 700, textTransform: 'uppercase' }}>Current pace</div><div style={{ fontSize: 26, fontWeight: 800, color: T.text }}>{f.perDay >= 0 ? '+' : ''}{f.perDay}/day</div><div style={{ fontSize: 12, color: T.textSec }}>from {f.basis.readings} readings over {f.basis.spanDays} days</div></Card>
              <Card><div style={{ fontSize: 11, color: T.textSec, fontWeight: 700, textTransform: 'uppercase' }}>Confidence</div><div style={{ marginTop: 8 }}><Pill tone={f.confidence === 'HIGH' ? 'good' : f.confidence === 'MEDIUM' ? 'warn' : 'bad'}>{pretty(f.confidence)}</Pill></div><div style={{ fontSize: 12, color: T.textSec, marginTop: 6 }}>fit {f.basis.r2}</div></Card>
            </div>
            <Card title="Readings and projection" style={{ marginBottom: 14 }}>
              <LineChart projectedFrom={data.history.length} points={[...data.history.map((h) => ({ label: h.date, value: h.value, t: Date.parse(h.date) })), { label: f.targetDate, value: f.projected, t: Date.parse(f.targetDate) }]} />
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Solid line: recorded readings. Dashed: the projection.</div>
            </Card>
          </>
        )
      )}
      {data && data.outlooks.length > 0 && (
        <Card title="Goals on this account">
          {data.outlooks.map((o) => (
            <div key={o.target} style={{ padding: '8px 0', borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.text }}>
              <b>{o.target}</b> · goal +{o.goal} by {o.endsOn} · {o.outlook ? <Pill tone={o.outlook === 'LIKELY' ? 'good' : o.outlook === 'POSSIBLE' ? 'warn' : 'bad'}>{pretty(o.outlook)}</Pill> : <span style={{ color: T.textMuted }}>{o.reason ?? 'No outlook'}</span>}{o.projectedGrowth !== null && <span style={{ color: T.textSec }}> · projected growth {o.projectedGrowth}</span>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function TimingTab() {
  const { theme: T } = useTheme();
  const accounts = useLoad(() => api.get<{ data: { id: string; name: string }[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const [accountId, setAccountId] = useState('');
  const { data, loading, error } = useLoad(() => api.get<{ data: Timing }>(`/admin/smois/insights/posting-times${accountId ? `?accountId=${accountId}` : ''}`).then((r) => r.data), [accountId]);
  const r = data?.result;
  return (
    <div>
      <div style={{ width: 260, marginBottom: 14 }}><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">All my accounts</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && r && (r.ok === false ? <Notice kind="info">{r.reason}</Notice> : (
        <>
          <Notice kind="warn">{r.note}</Notice>
          <Card title={`${data.scope}: strongest time is ${r.best.day ?? '—'}, ${r.best.band ?? '—'}`} style={{ marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              <div>{r.byWeekday.map((d) => <div key={d.day} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${T.border}`, fontSize: 13 }}><span style={{ color: T.text }}>{d.day} <span style={{ color: T.textMuted, fontSize: 11 }}>{d.posts} posts</span></span><b>{d.avgRate}%</b></div>)}</div>
              <div>{r.byBand.map((d) => <div key={d.band} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${T.border}`, fontSize: 13 }}><span style={{ color: T.text }}>{d.band} <span style={{ color: T.textMuted, fontSize: 11 }}>{d.posts} posts</span></span><b>{d.avgRate}%</b></div>)}</div>
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>Average engagement rate (by reach), from {r.sample} published posts with recorded results.</div>
          </Card>
        </>
      ))}
    </div>
  );
}

function Suggestions() {
  const { theme: T } = useTheme();
  const { data, loading, error } = useLoad(() => api.get<{ data: { findings: Finding[]; note: string } }>('/admin/smois/insights/workflow').then((r) => r.data), []);
  const tone = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'neutral' } as const;
  return (
    <div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && (data.findings.length === 0 ? <Empty>Nothing stands out. The numbers for the last 30 days look healthy.</Empty> : data.findings.map((f) => (
        <Card key={f.key} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}><Pill tone={tone[f.severity]}>{pretty(f.severity)}</Pill><b style={{ color: T.text, fontSize: 14 }}>{f.title}</b></div>
          <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6 }}>{f.evidence}</div>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, marginTop: 4 }}><b>Suggestion:</b> {f.suggestion}</div>
          <Link href={f.link} style={{ fontSize: 12, color: T.primary, fontWeight: 700, textDecoration: 'none' }}>Open →</Link>
        </Card>
      )))}
      {data && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>{data.note}</div>}
    </div>
  );
}
