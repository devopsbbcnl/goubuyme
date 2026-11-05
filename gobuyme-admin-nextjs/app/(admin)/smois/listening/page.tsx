'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Input, Notice, PageHeader, Pager, Pill, PLATFORMS, PlatformTag, Select, Stat, Table, Tabs, Td, TextArea, fmtDateTime, pretty, toLocalInput, useAction, useLoad, useSmois } from '@/components/smois/ui';

const SENT = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNCERTAIN'] as const;
const KINDS = ['BRAND', 'PRODUCT', 'EXECUTIVE', 'INDUSTRY', 'HASHTAG', 'COMPETITOR'];
const TONE: Record<string, 'good' | 'neutral' | 'bad' | 'warn'> = { POSITIVE: 'good', NEUTRAL: 'neutral', NEGATIVE: 'bad', UNCERTAIN: 'warn' };
interface Overview {
  sentiment: Record<string, number>; byKeyword: { keyword: string; count: number }[]; byPlatform: { platform: string; count: number }[];
  series: { date: string; positive: number; neutral: number; negative: number; uncertain: number }[];
  alerts: { negativeLast24h: number; negativeUnhandled: number; spike: boolean; spikeThreshold: number; avgDailyNegative: number }; note: string; sentimentNote: string;
}
interface Mention { id: string; sentimentSource?: string; text: string; sentiment: string; platform: string | null; authorName: string | null; url: string | null; reach: number | null; occurredAt: string; handled: boolean; note: string | null; loggedByName: string | null; handledByName: string | null; keyword: { term: string; kind: string } | null }
interface Keyword { id: string; term: string; kind: string; isActive: boolean; _count: { mentions: number } }

export default function ListeningPage() {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const [tab, setTab] = useState<'overview' | 'mentions' | 'keywords'>('overview');
  const [logging, setLogging] = useState(false);
  const ov = useLoad(() => api.get<{ data: Overview }>('/admin/smois/listening/overview?period=month').then((r) => r.data), []);
  const o = ov.data;
  const max = Math.max(1, ...(o?.series.map((s) => s.positive + s.neutral + s.negative + s.uncertain) ?? [1]));
  return (
    <div>
      <PageHeader title="Social listening" sub="Public conversation about the company, found and logged by the team. Sentiment is the label the person chose. Treat it as a signal, not a verdict." actions={me?.can.handleInbox ? <Btn kind="primary" onClick={() => setLogging(true)}>+ Log a mention</Btn> : undefined} />
      <Notice kind="info">{o?.note ?? 'Mentions are found and logged by staff. This is not a complete feed of public conversation.'}</Notice>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'overview', label: 'Overview' }, { id: 'mentions', label: 'Mentions' }, { id: 'keywords', label: 'Keywords' }]} />

      {tab === 'overview' && o && (
        <>
          {o.alerts.spike && <Notice kind="error">Reputation alert: {o.alerts.negativeLast24h} negative mentions in the last 24 hours (the bar is {o.alerts.spikeThreshold}; usual is about {o.alerts.avgDailyNegative} a day).</Notice>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
            {SENT.map((s) => <Stat key={s} label={pretty(s)} value={o.sentiment[s] ?? 0} sub="this month" />)}
            <Stat label="Negative, not handled" value={o.alerts.negativeUnhandled} />
          </div>
          <Card title="Last 14 days" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
              {o.series.map((d) => {
                const total = d.positive + d.neutral + d.negative + d.uncertain;
                return (
                  <div key={d.date} title={`${d.date}: ${d.positive} positive, ${d.neutral} neutral, ${d.negative} negative, ${d.uncertain} uncertain`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ height: `${(d.negative / max) * 100}%`, background: T.error }} /><div style={{ height: `${(d.uncertain / max) * 100}%`, background: T.warning }} /><div style={{ height: `${(d.neutral / max) * 100}%`, background: T.textMuted }} /><div style={{ height: `${(d.positive / max) * 100}%`, background: T.success }} />
                    {total === 0 && <div style={{ height: 2, background: T.border }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: T.textSec, marginTop: 6 }}>Red negative · amber uncertain · grey neutral · green positive. {o.sentimentNote}</div>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <Card title="By keyword">{o.byKeyword.length === 0 ? <Empty>No mentions logged.</Empty> : o.byKeyword.map((k) => <div key={k.keyword} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${T.border}`, fontSize: 13 }}><span style={{ color: T.text }}>{k.keyword}</span><b>{k.count}</b></div>)}</Card>
            <Card title="By platform">{o.byPlatform.length === 0 ? <Empty>No mentions logged.</Empty> : o.byPlatform.map((k) => <div key={k.platform} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${T.border}`, fontSize: 13 }}><span style={{ color: T.text }}>{pretty(k.platform)}</span><b>{k.count}</b></div>)}</Card>
          </div>
        </>
      )}
      {tab === 'mentions' && <Mentions canEdit={!!me?.can.handleInbox} onChanged={ov.reload} />}
      {tab === 'keywords' && <Keywords canManage={!!me?.can.manageListening} />}
      {logging && <LogMention onClose={() => setLogging(false)} onSaved={() => { setLogging(false); ov.reload(); setTab('mentions'); }} />}
    </div>
  );
}

function Mentions({ canEdit, onChanged }: { canEdit: boolean; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const [sentiment, setSentiment] = useState(''); const [handled, setHandled] = useState(''); const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(sentiment ? { sentiment } : {}), ...(handled ? { handled } : {}) });
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { items: Mention[]; pagination: { pages: number } } }>(`/admin/smois/mentions?${qs}`).then((r) => r.data), [qs.toString()]);
  const { run } = useAction();
  const suggest = (m: Mention) => run(async () => {
    const r = await api.post<{ data: { sentiment: string; confidence: string; reason: string } }>('/admin/smois/ai/sentiment', { mentionId: m.id });
    if (window.confirm('AI suggests: ' + pretty(r.data.sentiment) + ' (' + r.data.confidence.toLowerCase() + ' confidence)\n' + r.data.reason + '\n\nApply this label? It will be recorded as AI-assisted and reviewed by you.')) { await api.patch('/admin/smois/mentions/' + m.id, { sentiment: r.data.sentiment, aiAssisted: true }); reload(); onChanged(); }
  });
  const patch = (id: string, body: object) => run(async () => { await api.patch(`/admin/smois/mentions/${id}`, body); reload(); onChanged(); });
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 170 }}><Select value={sentiment} onChange={(e) => { setSentiment(e.target.value); setPage(1); }}><option value="">Any sentiment</option>{SENT.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</Select></div>
        <div style={{ width: 170 }}><Select value={handled} onChange={(e) => { setHandled(e.target.value); setPage(1); }}><option value="">Handled or not</option><option value="0">Not handled</option><option value="1">Handled</option></Select></div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.items.length === 0 ? <Empty>No mentions logged.</Empty> : data && (
        <>
          <Table head={['When', 'What was said', 'Where', 'Sentiment (label)', 'Handled', '']}>
            {data.items.map((m) => (
              <tr key={m.id}>
                <Td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateTime(m.occurredAt)}</Td>
                <Td style={{ maxWidth: 360 }}>{m.text}<div style={{ fontSize: 11, color: T.textMuted }}>{m.authorName ?? 'Unknown'}{m.keyword ? ` · ${m.keyword.term}` : ''}{m.reach !== null ? ` · reach ${m.reach.toLocaleString()}` : ''} · logged by {m.loggedByName}{m.url && <> · <a href={m.url} target="_blank" rel="noreferrer" style={{ color: T.primary }}>link ↗</a></>}</div></Td>
                <Td>{m.platform ? <PlatformTag platform={m.platform} /> : '—'}</Td>
                <Td>{canEdit ? <Select value={m.sentiment} onChange={(e) => patch(m.id, { sentiment: e.target.value })}>{SENT.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</Select> : <Pill tone={TONE[m.sentiment]}>{pretty(m.sentiment)}</Pill>}{m.sentimentSource === 'AI_ASSISTED' && <div style={{ fontSize: 10, color: T.textMuted }}>AI-assisted, reviewed</div>}{canEdit && <div style={{ marginTop: 4 }}><Btn small kind="ghost" onClick={() => suggest(m)}>✨ Suggest</Btn></div>}</Td>
                <Td>{m.handled ? <Pill tone="good">Handled</Pill> : <Pill>Open</Pill>}{m.note && <div style={{ fontSize: 11, color: T.textMuted }}>{m.note}</div>}</Td>
                <Td>{canEdit && <Btn small onClick={() => { const note = m.handled ? m.note : window.prompt('What was done? (optional)') ?? ''; patch(m.id, { handled: !m.handled, note }); }}>{m.handled ? 'Reopen' : 'Mark handled'}</Btn>}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pages={data.pagination.pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function Keywords({ canManage }: { canManage: boolean }) {
  const { data, reload, error } = useLoad(() => api.get<{ data: Keyword[] }>('/admin/smois/keywords').then((r) => r.data), []);
  const [term, setTerm] = useState(''); const [kind, setKind] = useState('BRAND');
  const { busy, error: err, run } = useAction();
  return (
    <div>
      {(error || err) && <Notice kind="error">{error || err}</Notice>}
      {canManage && <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 260 }}><Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Company, product, hashtag, executive…" /></div>
        <div style={{ width: 160 }}><Select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}</Select></div>
        <Btn kind="primary" disabled={busy || !term.trim()} onClick={() => run(async () => { await api.post('/admin/smois/keywords', { term, kind }); setTerm(''); reload(); })}>Add keyword</Btn>
      </div>}
      {data && data.length === 0 ? <Empty>No keywords yet. These are the terms the team checks for on the platforms.</Empty> : data && (
        <Table head={['Keyword', 'Type', 'Mentions logged', 'Status', '']}>
          {data.map((k) => <tr key={k.id}><Td><b>{k.term}</b></Td><Td><Pill>{pretty(k.kind)}</Pill></Td><Td>{k._count.mentions}</Td><Td><Pill tone={k.isActive ? 'good' : 'neutral'}>{k.isActive ? 'Monitored' : 'Paused'}</Pill></Td><Td>{canManage && <Btn small onClick={() => run(async () => { await api.patch(`/admin/smois/keywords/${k.id}`, { isActive: !k.isActive }); reload(); })}>{k.isActive ? 'Pause' : 'Resume'}</Btn>}</Td></tr>)}
        </Table>
      )}
    </div>
  );
}

function LogMention({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const kws = useLoad(() => api.get<{ data: Keyword[] }>('/admin/smois/keywords').then((r) => r.data), []);
  const [f, setF] = useState({ text: '', sentiment: 'UNCERTAIN', platform: '', keywordId: '', authorName: '', url: '', reach: '', occurredAt: toLocalInput() });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Log a mention" width={560}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="What was said"><TextArea rows={3} value={f.text} onChange={set('text')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Your read of the sentiment" hint="A label, not a verdict"><Select value={f.sentiment} onChange={set('sentiment')}>{SENT.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</Select></Field>
          <Field label="Platform"><Select value={f.platform} onChange={set('platform')}><option value="">—</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></Field>
          <Field label="Keyword"><Select value={f.keywordId} onChange={set('keywordId')}><option value="">—</option>{kws.data?.filter((k) => k.isActive).map((k) => <option key={k.id} value={k.id}>{k.term}</option>)}</Select></Field>
          <Field label="Who said it"><Input value={f.authorName} onChange={set('authorName')} /></Field>
          <Field label="When"><Input type="datetime-local" value={f.occurredAt} onChange={set('occurredAt')} /></Field>
          <Field label="Reach (if known)"><Input type="number" min={0} value={f.reach} onChange={set('reach')} /></Field>
        </div>
        <Field label="Link"><Input value={f.url} onChange={set('url')} placeholder="https://" /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.text.trim()} onClick={() => run(async () => { await api.post('/admin/smois/mentions', { ...f, platform: f.platform || null, keywordId: f.keywordId || null, reach: f.reach === '' ? null : f.reach, occurredAt: new Date(f.occurredAt).toISOString() }); onSaved(); })}>{busy ? 'Saving…' : 'Log it'}</Btn></div>
      </div>
    </Modal>
  );
}
