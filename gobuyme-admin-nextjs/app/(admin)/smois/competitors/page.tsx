'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Input, Notice, PageHeader, Pill, PLATFORMS, PlatformTag, Select, Table, Td, TextArea, fmtDate, num, pretty, useAction, useLoad, useSmois } from '@/components/smois/ui';

interface Competitor {
  id: string; name: string; website: string | null; platform: string; handle: string | null; url: string | null; industry: string | null; notes: string | null; monitoringStatus: string;
  summary: { observations: number; followers: number | null; growth: number | null; growthPct: number | null; postsPerWeek: number | null; avgEngagement: number | null; note: string | null };
  latest: { observedOn: string; followers: number | null; popularContent: string | null; campaignNote: string | null; dataKind: string } | null;
}
interface Data { period: { label: string; from: string; to: string }; competitors: Competitor[]; own: { platform: string; followers: number | null; growth: number | null; growthPct: number | null }[]; note: string }
const KIND: Record<string, string> = { PUBLIC_OBSERVATION: 'Public observation', ESTIMATE: 'Estimate', THIRD_PARTY: 'Third-party data' };

export default function CompetitorsPage() {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const [period, setPeriod] = useState('quarter');
  const [adding, setAdding] = useState(false); const [observing, setObserving] = useState<Competitor | null>(null); const [viewing, setViewing] = useState<Competitor | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>(`/admin/smois/competitors?period=${period}`).then((r) => r.data), [period]);
  return (
    <div>
      <PageHeader title="Competitor monitoring" sub="What the team has observed on competitors' public profiles, next to our own growth on the same platform. Observations are labelled by where they came from." actions={<><div style={{ width: 160 }}><Select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option><option value="lastQuarter">Last quarter</option></Select></div>{me?.can.manageListening && <Btn kind="primary" onClick={() => setAdding(true)}>+ Add competitor</Btn>}</>} />
      <Notice kind="warn">{data?.note ?? 'Competitor figures are public observations or estimates, not verified data.'}</Notice>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && (
        <>
          {data.own.length > 0 && (
            <Card title={`Us, ${data.period.label.toLowerCase()}`} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>{data.own.map((o) => <div key={o.platform}><PlatformTag platform={o.platform} /> <b style={{ color: T.text }}>{num(o.followers)}</b> followers · growth {o.growth === null ? 'not recorded' : `${o.growth >= 0 ? '+' : ''}${o.growth} (${o.growthPct ?? '—'}%)`}</div>)}</div>
            </Card>
          )}
          {data.competitors.length === 0 ? <Empty>No competitors tracked yet.</Empty> : (
            <Table head={['Competitor', 'Followers', `Growth (${data.period.label.toLowerCase()})`, 'Posts / week', 'Avg engagement', 'Latest observation', '']}>
              {data.competitors.map((c) => {
                const own = data.own.find((o) => o.platform === c.platform);
                return (
                  <tr key={c.id} style={{ opacity: c.monitoringStatus === 'ACTIVE' ? 1 : 0.55 }}>
                    <Td onClick={() => setViewing(c)} style={{ cursor: 'pointer' }}><b>{c.name}</b><div style={{ fontSize: 11, opacity: 0.7 }}><PlatformTag platform={c.platform} />{c.handle ? ` @${c.handle}` : ''}</div></Td>
                    <Td>{num(c.summary.followers)}</Td>
                    <Td title={c.summary.note ?? ''}>{c.summary.growth === null ? <span style={{ color: T.textMuted }}>Needs 2 observations</span> : <>{c.summary.growth >= 0 ? '+' : ''}{c.summary.growth} ({c.summary.growthPct ?? '—'}%){own?.growthPct != null && c.summary.growthPct !== null && <div style={{ fontSize: 11, color: T.textSec }}>us {own.growthPct}%</div>}</>}</Td>
                    <Td>{num(c.summary.postsPerWeek)}</Td><Td>{num(c.summary.avgEngagement)}</Td>
                    <Td style={{ fontSize: 12 }}>{c.latest ? <>{fmtDate(c.latest.observedOn)} <Pill>{KIND[c.latest.dataKind] ?? c.latest.dataKind}</Pill>{c.latest.campaignNote && <div style={{ color: T.textSec }}>{c.latest.campaignNote}</div>}</> : 'None yet'}</Td>
                    <Td>{me?.can.recordMetrics && <Btn small onClick={() => setObserving(c)}>Record</Btn>}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </>
      )}
      {adding && <AddCompetitor onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {observing && <Observe c={observing} onClose={() => setObserving(null)} onSaved={() => { setObserving(null); reload(); }} />}
      {viewing && <History c={viewing} canManage={!!me?.can.manageListening} onClose={() => setViewing(null)} onChanged={reload} />}
    </div>
  );
}

function AddCompetitor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', platform: 'INSTAGRAM', handle: '', url: '', website: '', industry: '', notes: '' });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Add competitor" width={520}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Platform"><Select value={f.platform} onChange={set('platform')}>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></Field>
          <Field label="Handle"><Input value={f.handle} onChange={set('handle')} placeholder="@handle" /></Field>
          <Field label="Profile link"><Input value={f.url} onChange={set('url')} placeholder="https://" /></Field>
          <Field label="Website"><Input value={f.website} onChange={set('website')} placeholder="https://" /></Field>
        </div>
        <Field label="Industry"><Input value={f.industry} onChange={set('industry')} /></Field>
        <Field label="Notes"><TextArea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name.trim()} onClick={() => run(async () => { await api.post('/admin/smois/competitors', f); onSaved(); })}>Add</Btn></div>
      </div>
    </Modal>
  );
}

function Observe({ c, onClose, onSaved }: { c: Competitor; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ observedOn: new Date().toLocaleDateString('en-CA'), followers: '', postsLast7Days: '', avgEngagement: '', popularContent: '', campaignNote: '', dataKind: 'PUBLIC_OBSERVATION' });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={`Record an observation: ${c.name}`} width={540}>
      <div style={{ padding: 20 }}>
        <Notice kind="info">Only what you can see on their public profile. Say where the figures came from, and leave out anything you don&apos;t know.</Notice>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Date observed"><Input type="date" value={f.observedOn} max={new Date().toLocaleDateString('en-CA')} onChange={set('observedOn')} /></Field>
          <Field label="Source"><Select value={f.dataKind} onChange={set('dataKind')}><option value="PUBLIC_OBSERVATION">Public observation</option><option value="ESTIMATE">Estimate</option><option value="THIRD_PARTY">Third-party data</option></Select></Field>
          <Field label="Followers"><Input type="number" min={0} value={f.followers} onChange={set('followers')} /></Field>
          <Field label="Posts in the last 7 days"><Input type="number" min={0} value={f.postsLast7Days} onChange={set('postsLast7Days')} /></Field>
          <Field label="Average engagement"><Input type="number" min={0} step="0.1" value={f.avgEngagement} onChange={set('avgEngagement')} /></Field>
        </div>
        <Field label="Popular content"><Input value={f.popularContent} onChange={set('popularContent')} /></Field>
        <Field label="Campaign activity"><Input value={f.campaignNote} onChange={set('campaignNote')} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/smois/competitors/${c.id}/snapshots`, f); onSaved(); })}>{busy ? 'Saving…' : 'Record'}</Btn></div>
      </div>
    </Modal>
  );
}

function History({ c, canManage, onClose, onChanged }: { c: Competitor; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const { data } = useLoad(() => api.get<{ data: { id: string; observedOn: string; followers: number | null; postsLast7Days: number | null; avgEngagement: number | null; popularContent: string | null; campaignNote: string | null; dataKind: string; enteredByName: string | null }[] }>(`/admin/smois/competitors/${c.id}/snapshots`).then((r) => r.data), [c.id]);
  const { run } = useAction();
  return (
    <Modal open onClose={onClose} title={c.name} width={720}>
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 13, color: T.textSec, marginBottom: 10 }}>{c.industry}{c.url && <> · <a href={c.url} target="_blank" rel="noreferrer" style={{ color: T.primary }}>profile ↗</a></>}{c.website && <> · <a href={c.website} target="_blank" rel="noreferrer" style={{ color: T.primary }}>website ↗</a></>}</div>
        {c.notes && <div style={{ fontSize: 13, color: T.textSec, marginBottom: 10 }}>{c.notes}</div>}
        {canManage && <div style={{ marginBottom: 12 }}><Btn small onClick={() => run(async () => { await api.patch(`/admin/smois/competitors/${c.id}`, { monitoringStatus: c.monitoringStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }); onChanged(); onClose(); })}>{c.monitoringStatus === 'ACTIVE' ? 'Pause monitoring' : 'Resume monitoring'}</Btn></div>}
        {!data ? <Empty>Loading…</Empty> : data.length === 0 ? <Empty>No observations yet.</Empty> : (
          <Table head={['Date', 'Followers', 'Posts/wk', 'Engagement', 'Source', 'Notes', 'By']}>
            {data.map((s) => <tr key={s.id}><Td>{fmtDate(s.observedOn)}</Td><Td>{num(s.followers)}</Td><Td>{num(s.postsLast7Days)}</Td><Td>{num(s.avgEngagement)}</Td><Td><Pill>{KIND[s.dataKind] ?? s.dataKind}</Pill></Td><Td style={{ fontSize: 12 }}>{[s.popularContent, s.campaignNote].filter(Boolean).join(' · ')}</Td><Td>{s.enteredByName}</Td></tr>)}
          </Table>
        )}
      </div>
    </Modal>
  );
}
