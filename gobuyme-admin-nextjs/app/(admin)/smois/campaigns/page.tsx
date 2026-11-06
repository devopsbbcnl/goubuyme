'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Card, Empty, Field, Input, Notice, PageHeader, Pill, PlatformTag, Select, StatusPill, Table, Tabs, Td, TextArea,
  fmtDate, num, pretty, toLocalInput, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

const TYPES = ['BRAND_AWARENESS', 'PRODUCT_LAUNCH', 'LEAD_GENERATION', 'ENGAGEMENT', 'RECRUITMENT', 'EVENT_PROMOTION', 'PARTNERSHIP_ANNOUNCEMENT', 'SALES_PROMOTION', 'PUBLIC_RELATIONS', 'CUSTOMER_EDUCATION'];
const FLOW = ['PLANNING', 'BRIEFING', 'PREPARATION', 'APPROVAL', 'ACTIVE', 'COMPLETED'];
const NEXT: Record<string, string[]> = { PLANNING: ['BRIEFING'], BRIEFING: ['PREPARATION'], PREPARATION: ['APPROVAL'], APPROVAL: ['ACTIVE'], ACTIVE: ['PAUSED', 'COMPLETED'], PAUSED: ['ACTIVE', 'COMPLETED'] };
const STEP_LABEL: Record<string, string> = { BRIEFING: 'Move to briefing', PREPARATION: 'Move to preparation', APPROVAL: 'Send for approval', ACTIVE: 'Approve and go live', PAUSED: 'Pause', COMPLETED: 'Complete…' };

interface Row { id: string; number: number; name: string; type: string; status: string; startsAt: string; endsAt: string; budget: number | null; ownerName: string | null; _count: { contents: number; accounts: number; members: number } }
interface Chan { entries: number; reach: number | null; impressions: number | null; engagement: number | null; clicks: number | null; leads: number | null; conversions: number | null; spend: number | null; revenue: number | null; costPerClick: number | null; costPerLead: number | null; costPerResult: number | null; costPerResultBasis: string | null; returnOnAdSpend: number | null }
interface Detail {
  id: string; number: number; name: string; description: string | null; objective: string | null; type: string; status: string; startsAt: string; endsAt: string; targetAudience: string | null; budget: number | null; expectedResults: string | null;
  trackingLinks: { label: string; url: string }[]; lessonsLearned: string | null; recommendations: string | null; ownerName: string | null;
  accounts: { id: string; name: string; platform: string }[]; members: { id: string; name: string }[];
  results: { id: string; channel: string; recordedFor: string; reach: number | null; impressions: number | null; engagement: number | null; clicks: number | null; leads: number | null; conversions: number | null; spend: number | null; revenue: number | null; note: string | null; enteredByName: string | null }[];
  totals: { paid: Chan; organic: Chan; budget: { planned: number | null; spent: number | null; remaining: number | null; usedPct: number | null; overBudget: boolean } };
  content: { briefs: number; versions: number; published: number }; contents: { id: string; number: number; title: string }[];
}
const naira = (v: number | null) => (v === null ? 'Not recorded' : `₦${v.toLocaleString('en-NG')}`);

export default function CampaignsPage() {
  return <Suspense fallback={<Empty>Loading…</Empty>}><Inner /></Suspense>;
}

function Inner() {
  const { me } = useSmois();
  const params = useSearchParams(); const router = useRouter();
  const [view, setView] = useState<'active' | 'upcoming' | 'past'>('active');
  const [open, setOpen] = useState<string | null>(params.get('open'));
  const [creating, setCreating] = useState(false);
  useEffect(() => { setOpen(params.get('open')); }, [params]);
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Row[] }>(`/admin/smois/campaigns?view=${view}`).then((r) => r.data), [view]);
  const close = () => { setOpen(null); if (params.get('open')) router.replace('/smois/campaigns'); };
  return (
    <div>
      <PageHeader title="Campaigns" sub="Plan, run and evaluate campaigns. Paid and organic results are kept apart and never blended. Figures are copied in by the team; nothing is pulled from an ads account." actions={me?.can.manageCampaigns ? <Btn kind="primary" onClick={() => setCreating(true)}>+ New campaign</Btn> : undefined} />
      <Tabs value={view} onChange={setView} items={[{ id: 'active', label: 'Running' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Completed and past' }]} />
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.length === 0 ? <Empty>No campaigns here.</Empty> : data && (
        <Table head={['Campaign', 'Type', 'Dates', 'Budget', 'Owner', 'Content', 'Status']}>
          {data.map((c) => (
            <tr key={c.id} onClick={() => setOpen(c.id)} style={{ cursor: 'pointer' }}>
              <Td><b>{c.name}</b><div style={{ fontSize: 11, opacity: 0.6 }}>#{c.number}</div></Td><Td>{pretty(c.type)}</Td>
              <Td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(c.startsAt)} – {fmtDate(c.endsAt)}</Td><Td>{naira(c.budget)}</Td><Td>{c.ownerName}</Td><Td>{c._count.contents} briefs</Td><Td><StatusPill status={c.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <CampaignForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); reload(); setOpen(id); }} />}
      {open && <CampaignView id={open} onClose={close} onChanged={reload} />}
    </div>
  );
}

function CampaignForm({ initial, onClose, onSaved }: { initial?: Detail; onClose: () => void; onSaved: (id: string) => void }) {
  const { people } = useSmois();
  const accounts = useLoad(() => api.get<{ data: { id: string; name: string; platform: string }[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const [f, setF] = useState({ name: initial?.name ?? '', type: initial?.type ?? 'BRAND_AWARENESS', objective: initial?.objective ?? '', description: initial?.description ?? '', targetAudience: initial?.targetAudience ?? '', budget: initial?.budget === null || initial?.budget === undefined ? '' : String(initial.budget), expectedResults: initial?.expectedResults ?? '', startsAt: toLocalInput(initial?.startsAt), endsAt: toLocalInput(initial?.endsAt ?? new Date(Date.now() + 14 * 86400000).toISOString()), links: (initial?.trackingLinks ?? []).map((l) => l.url).join('\n') });
  const [accountIds, setAccountIds] = useState<string[]>(initial?.accounts.map((a) => a.id) ?? []);
  const [memberIds, setMemberIds] = useState<string[]>(initial?.members.map((m) => m.id) ?? []);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const doers = people.filter((p) => p.memberId && (p.role === 'MANAGER' || p.role === 'MANAGEMENT'));
  const toggle = (arr: string[], set_: (v: string[]) => void, id: string, on: boolean) => set_(on ? [...arr, id] : arr.filter((x) => x !== id));
  const save = () => run(async () => {
    const body = { name: f.name, type: f.type, objective: f.objective, description: f.description, targetAudience: f.targetAudience, expectedResults: f.expectedResults, budget: f.budget === '' ? null : Number(f.budget), startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), accountIds, memberIds, trackingLinks: f.links.split('\n').map((s) => s.trim()).filter(Boolean).map((url, i) => ({ label: `Link ${i + 1}`, url })) };
    if (initial) { await api.patch(`/admin/smois/campaigns/${initial.id}`, body); onSaved(initial.id); } else { const r = await api.post<{ data: { id: string } }>('/admin/smois/campaigns', body); onSaved(r.data.id); }
  });
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit campaign' : 'New campaign'} width={680}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Type"><Select value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</Select></Field>
          <Field label="Budget (₦)"><Input type="number" min={0} value={f.budget} onChange={set('budget')} /></Field>
          <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /></Field>
          <Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></Field>
        </div>
        <Field label="Objective"><Input value={f.objective} onChange={set('objective')} /></Field>
        <Field label="Target audience"><Input value={f.targetAudience} onChange={set('targetAudience')} /></Field>
        <Field label="Expected results"><Input value={f.expectedResults} onChange={set('expectedResults')} placeholder="e.g. 50 orders, 5,000 reach" /></Field>
        <Field label="Description"><TextArea rows={2} value={f.description} onChange={set('description')} /></Field>
        <Field label="Accounts"><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{accounts.data?.map((a) => <label key={a.id} style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={accountIds.includes(a.id)} onChange={(e) => toggle(accountIds, setAccountIds, a.id, e.target.checked)} />{a.name}</label>)}</div></Field>
        <Field label="Team"><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{doers.map((p) => <label key={p.memberId!} style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={memberIds.includes(p.memberId!)} onChange={(e) => toggle(memberIds, setMemberIds, p.memberId!, e.target.checked)} />{p.name}</label>)}</div></Field>
        <Field label="Tracking links (one per line)"><TextArea rows={2} value={f.links} onChange={set('links')} placeholder="https://…" /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></div>
      </div>
    </Modal>
  );
}

function CampaignView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const { data, reload } = useLoad(() => api.get<{ data: Detail }>(`/admin/smois/campaigns/${id}`).then((r) => r.data), [id]);
  const { busy, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lessons, setLessons] = useState({ lessonsLearned: '', recommendations: '' });
  const [adding, setAdding] = useState(false);
  const [linkId, setLinkId] = useState('');
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const briefs = useLoad(() => api.get<{ data: { items: { id: string; title: string; number: number }[] } }>('/admin/smois/content?mine=0').then((r) => r.data.items), []);
  useEffect(() => { if (data) setLessons({ lessonsLearned: data.lessonsLearned ?? '', recommendations: data.recommendations ?? '' }); }, [data]);
  if (!data) return <Modal open onClose={onClose} title="Campaign"><Empty>Loading…</Empty></Modal>;
  const done = () => { reload(); onChanged(); };
  const manage = !!me?.can.manageCampaigns;
  const onTeam = manage || data.members.some((m) => m.id === me?.memberId);
  const closed = ['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(data.status);
  const move = (status: string, extra: object = {}) => run(async () => { await api.post(`/admin/smois/campaigns/${id}/status`, { status, ...extra }); setCompleting(false); done(); });
  const t = data.totals;
  const Col = ({ title, c, paid }: { title: string; c: Chan; paid?: boolean }) => (
    <Card title={title} style={{ flex: 1, minWidth: 260 }}>
      <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.9 }}>
        <div>Reach <b style={{ color: T.text }}>{num(c.reach)}</b> · Impressions <b style={{ color: T.text }}>{num(c.impressions)}</b></div>
        <div>Engagement <b style={{ color: T.text }}>{num(c.engagement)}</b> · Clicks <b style={{ color: T.text }}>{num(c.clicks)}</b></div>
        {paid && <><div>Leads <b style={{ color: T.text }}>{num(c.leads)}</b> · Conversions <b style={{ color: T.text }}>{num(c.conversions)}</b></div>
          <div>Spend <b style={{ color: T.text }}>{naira(c.spend)}</b> · Revenue <b style={{ color: T.text }}>{naira(c.revenue)}</b></div>
          <div>Cost per click <b style={{ color: T.text }}>{naira(c.costPerClick)}</b> · per lead <b style={{ color: T.text }}>{naira(c.costPerLead)}</b></div>
          <div>Cost per result <b style={{ color: T.text }}>{naira(c.costPerResult)}</b>{c.costPerResultBasis && ` (per ${c.costPerResultBasis})`} · Return on ad spend <b style={{ color: T.text }}>{c.returnOnAdSpend === null ? 'Not recorded' : `${c.returnOnAdSpend}×`}</b></div></>}
        {c.entries === 0 && <div style={{ color: T.textMuted }}>No {paid ? 'paid' : 'organic'} results recorded yet.</div>}
      </div>
    </Card>
  );

  return (
    <Modal open onClose={onClose} title={`#${data.number} · ${data.name}`} width={900}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {FLOW.map((s) => <Pill key={s} tone={s === data.status ? 'brand' : FLOW.indexOf(s) < FLOW.indexOf(data.status) ? 'good' : 'neutral'}>{pretty(s)}</Pill>)}
          {data.status === 'PAUSED' && <Pill tone="warn">Paused</Pill>}{data.status === 'CANCELLED' && <Pill tone="bad">Cancelled</Pill>}
        </div>
        <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.8, marginBottom: 12 }}>
          <div>{pretty(data.type)} · {fmtDate(data.startsAt)} – {fmtDate(data.endsAt)} · owner <b style={{ color: T.text }}>{data.ownerName}</b></div>
          {data.objective && <div>Objective: <b style={{ color: T.text }}>{data.objective}</b></div>}
          {data.expectedResults && <div>Expected: <b style={{ color: T.text }}>{data.expectedResults}</b></div>}
          <div>{data.accounts.map((a) => <span key={a.id} style={{ marginRight: 10 }}><PlatformTag platform={a.platform} name={a.name} /></span>)} {data.members.length > 0 && <>· Team: {data.members.map((m) => m.name).join(', ')}</>}</div>
          {data.trackingLinks.map((l) => <div key={l.url}><a href={l.url} target="_blank" rel="noreferrer" style={{ color: T.primary }}>{l.url}</a></div>)}
        </div>

        {manage && !closed && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {(NEXT[data.status] ?? []).map((s) => <Btn key={s} kind={s === 'ACTIVE' || s === 'COMPLETED' ? 'primary' : 'secondary'} disabled={busy} onClick={() => (s === 'COMPLETED' ? setCompleting(true) : move(s))}>{STEP_LABEL[s] ?? pretty(s)}</Btn>)}
            <Btn onClick={() => setEditing(true)}>Edit</Btn><Btn kind="danger" onClick={() => { if (window.confirm('Cancel this campaign?')) move('CANCELLED'); }}>Cancel campaign</Btn>
          </div>
        )}
        {manage && ['COMPLETED', 'CANCELLED'].includes(data.status) && <div style={{ marginBottom: 14 }}><Btn small onClick={() => move('ARCHIVED')}>Archive</Btn></div>}
        {completing && (
          <Card title="Complete the campaign" style={{ marginBottom: 14 }}>
            <Field label="Lessons learned (required)"><TextArea rows={3} value={lessons.lessonsLearned} onChange={(e) => setLessons({ ...lessons, lessonsLearned: e.target.value })} /></Field>
            <Field label="Recommendations"><TextArea rows={2} value={lessons.recommendations} onChange={(e) => setLessons({ ...lessons, recommendations: e.target.value })} /></Field>
            <div style={{ display: 'flex', gap: 8 }}><Btn kind="primary" disabled={busy || !lessons.lessonsLearned.trim()} onClick={() => move('COMPLETED', lessons)}>Complete</Btn><Btn onClick={() => setCompleting(false)}>Cancel</Btn></div>
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <div style={{ background: T.surface2, borderRadius: 4, padding: '8px 12px' }}><div style={{ fontSize: 10, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>Budget</div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{naira(t.budget.planned)}</div></div>
          <div style={{ background: T.surface2, borderRadius: 4, padding: '8px 12px' }}><div style={{ fontSize: 10, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>Spent (paid)</div><div style={{ fontSize: 18, fontWeight: 800, color: t.budget.overBudget ? T.error : T.text }}>{naira(t.budget.spent)}</div>{t.budget.usedPct !== null && <div style={{ fontSize: 11, color: T.textSec }}>{t.budget.usedPct}% of budget{t.budget.overBudget ? ' · over budget' : ''}</div>}</div>
          <div style={{ background: T.surface2, borderRadius: 4, padding: '8px 12px' }}><div style={{ fontSize: 10, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>Content</div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{data.content.published}/{data.content.versions}</div><div style={{ fontSize: 11, color: T.textSec }}>versions published</div></div>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}><Col title="Paid" c={t.paid} paid /><Col title="Organic" c={t.organic} /></div>

        <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '4px 0 8px' }}>Linked content</div>
        {data.contents.length === 0 ? <Empty>No content linked yet.</Empty> : data.contents.map((c) => <a key={c.id} href={`/smois/content?open=${c.id}`} style={{ display: 'block', fontSize: 13, color: T.text, padding: '4px 0', textDecoration: 'none' }}>#{c.number} {c.title}</a>)}
        {onTeam && !closed && (
          <div style={{ display: 'flex', gap: 8, margin: '8px 0 14px' }}>
            <div style={{ width: 300 }}><Select value={linkId} onChange={(e) => setLinkId(e.target.value)}><option value="">Link a content brief…</option>{briefs.data?.filter((b) => !data.contents.some((c) => c.id === b.id)).map((b) => <option key={b.id} value={b.id}>#{b.number} {b.title}</option>)}</Select></div>
            <Btn disabled={!linkId || busy} onClick={() => run(async () => { await api.post(`/admin/smois/campaigns/${id}/content`, { contentId: linkId }); setLinkId(''); done(); })}>Link</Btn>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase' }}>Recorded results</div>
          {onTeam && !closed && <Btn small kind="primary" onClick={() => { setError(''); setAdding(true); }}>+ Record results</Btn>}
        </div>
        {data.results.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <Table head={['Date', 'Channel', 'Reach', 'Engagement', 'Clicks', 'Leads', 'Conv.', 'Spend', 'By']}>
            {data.results.map((r) => <tr key={r.id}><Td>{fmtDate(r.recordedFor)}</Td><Td><Pill tone={r.channel === 'PAID' ? 'brand' : 'info'}>{pretty(r.channel)}</Pill></Td><Td>{num(r.reach)}</Td><Td>{num(r.engagement)}</Td><Td>{num(r.clicks)}</Td><Td>{num(r.leads)}</Td><Td>{num(r.conversions)}</Td><Td>{naira(r.spend)}</Td><Td>{r.enteredByName}</Td></tr>)}
          </Table>
        )}

        <div style={{ margin: '16px 0 8px' }}><Btn small onClick={() => run(async () => { const r = await api.get<{ data: Record<string, any> }>(`/admin/smois/campaigns/${id}/summary`); setSummary(r.data); })}>Show evaluation summary</Btn></div>
        {summary && (
          <Card title="Evaluation: planned against actual">
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.8 }}>
              <div>Objective: {summary.objectiveAndExpectation.objective ?? 'not stated'}. Expected: {summary.objectiveAndExpectation.expectedResults ?? 'not stated'}.</div>
              <div>Output: {summary.output.publishedVersions} of {summary.output.plannedVersions} planned versions published{summary.output.publishedPct !== null ? ` (${summary.output.publishedPct}%)` : ''}.</div>
              <div>Organic from linked posts ({summary.organicFromPosts.postsWithReadings} with readings): reach {num(summary.organicFromPosts.reach)}, engagement {num(summary.organicFromPosts.engagement)}, clicks {num(summary.organicFromPosts.clicks)}.</div>
              <div>Budget {naira(summary.budget.planned)}, spent {naira(summary.budget.spent)}{summary.budget.remaining !== null ? `, remaining ${naira(summary.budget.remaining)}` : ''}.</div>
              {summary.lessonsLearned && <div>Lessons: {summary.lessonsLearned}</div>}{summary.recommendations && <div>Recommendations: {summary.recommendations}</div>}
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>{summary.note}</div>
            </div>
          </Card>
        )}
      </div>
      {adding && <ResultForm campaignId={id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); done(); }} />}
      {editing && <CampaignForm initial={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); done(); }} />}
    </Modal>
  );
}

function ResultForm({ campaignId, onClose, onSaved }: { campaignId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ channel: 'PAID', recordedFor: new Date().toLocaleDateString('en-CA'), note: '' });
  const { busy, error, run } = useAction();
  const fields: [string, string][] = [['reach', 'Reach'], ['impressions', 'Impressions'], ['engagement', 'Engagement'], ['clicks', 'Clicks'], ['leads', 'Leads'], ['conversions', 'Conversions'], ['spend', 'Ad spend (₦)'], ['revenue', 'Revenue (₦)']];
  const paid = f.channel === 'PAID';
  return (
    <Modal open onClose={onClose} title="Record campaign results" width={560}>
      <div style={{ padding: 20 }}>
        <Notice kind="info">Copy the figures from the platform or the ads manager. Leave a box empty if you don&apos;t have it. Paid and organic are recorded separately.</Notice>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Channel"><Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="PAID">Paid</option><option value="ORGANIC">Organic</option></Select></Field>
          <Field label="For the date"><Input type="date" value={f.recordedFor} onChange={(e) => setF({ ...f, recordedFor: e.target.value })} /></Field>
          {fields.filter(([k]) => paid || !['spend', 'revenue', 'leads', 'conversions'].includes(k)).map(([k, l]) => <Field key={k} label={l}><Input type="number" min={0} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        </div>
        <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/smois/campaigns/${campaignId}/results`, f); onSaved(); })}>{busy ? 'Saving…' : 'Record'}</Btn></div>
      </div>
    </Modal>
  );
}
