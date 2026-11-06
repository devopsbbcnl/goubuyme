'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Card, Empty, Field, Input, Notice, PageHeader, Pill, Select, Table, Tabs, Td, TextArea,
  fmtDate, fmtDateTime, num, pretty, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

const TYPES: [string, string][] = [['WEEKLY_MANAGER', 'Weekly manager report'], ['MONTHLY_DEPARTMENT', 'Monthly department report'], ['QUARTERLY_DEPARTMENT', 'Quarterly department report'], ['ANNUAL_DEPARTMENT', 'Annual department report']];
const COMMENTARY: [string, string][] = [['summary', 'Summary'], ['achievements', 'Achievements'], ['observations', 'Account growth observations'], ['engagement', 'Engagement activities and customer enquiries'], ['campaigns', 'Campaign contributions'], ['challenges', 'Challenges'], ['delayed', 'Delayed activities'], ['plans', 'Plans for next period'], ['recommendations', 'Recommendations']];
const TONE: Record<string, 'neutral' | 'warn' | 'good' | 'bad'> = { DRAFT: 'neutral', SUBMITTED: 'warn', CLARIFICATION_REQUESTED: 'bad', APPROVED: 'good' };

interface Row { id: string; type: string; label: string; periodStart: string; periodEnd: string; status: string; authorName: string | null; reviewedByName: string | null; submittedAt: string | null; reviewNote: string | null }
interface Report extends Row { commentary: Record<string, string>; data: Record<string, any>; authorId: string; reviewedAt: string | null }

export default function ReportsPage() {
  return <Suspense fallback={<Empty>Loading…</Empty>}><Inner /></Suspense>;
}

function Inner() {
  const { me } = useSmois();
  const params = useSearchParams();
  const router = useRouter();
  const review = !!me?.can.reviewReports;
  const [tab, setTab] = useState<'mine' | 'review' | 'archive'>(review ? 'review' : 'mine');
  const [open, setOpen] = useState<string | null>(params.get('open'));
  const [creating, setCreating] = useState(false);
  useEffect(() => { setOpen(params.get('open')); }, [params]);
  const q = tab === 'mine' ? 'mine=1' : tab === 'review' ? 'status=SUBMITTED' : 'status=APPROVED';
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Row[] }>(`/admin/smois/reports?${q}`).then((r) => r.data), [tab]);
  const canFile = (me?.can.createContent && !!me.memberId) || review;
  const close = () => { setOpen(null); if (params.get('open')) router.replace('/smois/reports'); };

  return (
    <div>
      <PageHeader
        title="Reports"
        sub="Drafts are filled in from SMOIS records. You add the explanation, management reviews, and an approved report is archived unchanged."
        actions={canFile ? <Btn kind="primary" onClick={() => setCreating(true)}>+ New report</Btn> : undefined}
      />
      <Tabs value={tab} onChange={setTab} items={[...(me?.level !== 'VIEWER' ? [{ id: 'mine' as const, label: 'My reports' }] : []), ...(review ? [{ id: 'review' as const, label: 'Awaiting review' }] : []), { id: 'archive', label: 'Approved archive' }]} />
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.length === 0 ? <Empty>No reports here.</Empty> : data && (
        <Table head={['Report', 'Period', 'Author', 'Status', 'Reviewed by']}>
          {data.map((r) => (
            <tr key={r.id} onClick={() => setOpen(r.id)} style={{ cursor: 'pointer' }}>
              <Td><b>{r.label}</b></Td><Td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</Td><Td>{r.authorName}</Td>
              <Td><Pill tone={TONE[r.status]}>{pretty(r.status)}</Pill>{r.reviewNote && r.status === 'CLARIFICATION_REQUESTED' && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{r.reviewNote}</div>}</Td>
              <Td>{r.reviewedByName ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <NewReport onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setTab('mine'); reload(); setOpen(id); }} />}
      {open && <ReportDetail id={open} onClose={close} onChanged={reload} />}
    </div>
  );
}

function NewReport({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { me } = useSmois();
  const [type, setType] = useState(me?.can.reviewReports && !me.memberId ? 'MONTHLY_DEPARTMENT' : 'WEEKLY_MANAGER');
  const [start, setStart] = useState('');
  const { busy, error, run } = useAction();
  const allowed = TYPES.filter(([k]) => (k === 'WEEKLY_MANAGER' ? !!me?.memberId && me.can.createContent : !!me?.can.reviewReports));
  return (
    <Modal open onClose={onClose} title="New report" width={480}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Report"><Select value={type} onChange={(e) => setType(e.target.value)}>{allowed.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Period start (optional)" hint="Leave empty for the most recent finished period. Weeks start on Monday; months, quarters and years on their first day."><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={() => run(async () => { const r = await api.post<{ data: { id: string } }>('/admin/smois/reports/draft', { type, ...(start ? { periodStart: start } : {}) }); onCreated(r.data.id); })}>{busy ? 'Preparing…' : 'Generate draft'}</Btn></div>
      </div>
    </Modal>
  );
}

function ReportDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const { data, reload } = useLoad(() => api.get<{ data: Report }>(`/admin/smois/reports/${id}`).then((r) => r.data), [id]);
  const { busy, error, setError, run } = useAction();
  const [c, setC] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [info, setInfo] = useState('');
  const [aiNote, setAiNote] = useState('');
  const aiStatus = useLoad(() => api.get<{ data: { enabled: boolean; available: boolean } }>('/admin/smois/ai/status').then((r) => r.data), []);
  useEffect(() => { if (data) setC(data.commentary ?? {}); }, [data]);
  if (!data) return <Modal open onClose={onClose} title="Report"><Empty>Loading…</Empty></Modal>;

  const mineReport = data.authorId === me?.user.id;
  const editable = mineReport && (data.status === 'DRAFT' || data.status === 'CLARIFICATION_REQUESTED');
  const canReview = !!me?.can.reviewReports && data.status === 'SUBMITTED' && !mineReport;
  const done = (msg: string) => { setInfo(msg); reload(); onChanged(); };
  const save = () => run(async () => { await api.patch(`/admin/smois/reports/${id}`, { commentary: c }); done('Saved.'); });
  const aiDraft = () => run(async () => {
    setAiNote('');
    const r = await api.post<{ data: Record<string, string> & { verificationNote: string | null } }>('/admin/smois/ai/report-commentary', { reportId: id });
    const next = { ...c };
    for (const [k] of COMMENTARY) if (r.data[k] && !(c[k] ?? '').trim()) next[k] = r.data[k]; // never overwrite what the author already wrote
    setC(next);
    setAiNote('AI draft added to empty fields only. Read it, correct it and add what only you know, then save. ' + (r.data.verificationNote ?? ''));
  });
  const submit = () => run(async () => { await api.patch(`/admin/smois/reports/${id}`, { commentary: c }); await api.post(`/admin/smois/reports/${id}/submit`, {}); done('Submitted for review.'); });
  const decide = (decision: string) => run(async () => { await api.post(`/admin/smois/reports/${id}/review`, { decision, note }); setNote(''); done(decision === 'APPROVED' ? 'Approved and archived.' : 'Returned to the author.'); });

  const exportCsv = () => run(async () => {
    const res = await fetch(`/api/proxy/admin/smois/reports/${id}/export`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = `gobuyme-${data.type.toLowerCase()}-${data.periodStart}.csv`; a.click(); URL.revokeObjectURL(url);
  });

  return (
    <Modal open onClose={onClose} title={`${data.label} · ${fmtDate(data.periodStart)} – ${fmtDate(data.periodEnd)}`} width={900}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {info && <Notice kind="success">{info}</Notice>}
        {aiNote && <Notice kind="warn">{aiNote}</Notice>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <Pill tone={TONE[data.status]}>{pretty(data.status)}</Pill>
          <span style={{ fontSize: 12, color: T.textSec }}>Prepared by <b style={{ color: T.text }}>{data.authorName}</b>{data.submittedAt && ` · submitted ${fmtDateTime(data.submittedAt)}`}{data.reviewedByName && ` · reviewed by ${data.reviewedByName}`}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}><Btn small onClick={exportCsv} disabled={busy}>Export CSV</Btn><Btn small onClick={() => printReport(data)}>Print / PDF</Btn></span>
        </div>
        {data.status === 'CLARIFICATION_REQUESTED' && data.reviewNote && <Notice kind="warn">Management asked: {data.reviewNote}</Notice>}
        <Notice kind="info">{data.data.source} Figures were counted {fmtDateTime(data.data.generatedAt)}{editable ? ' and can be refreshed while this is a draft.' : ' and are now fixed.'}</Notice>

        <ReportBody d={data.data} />

        <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '20px 0 8px' }}>Commentary</div>
        {COMMENTARY.filter(([k]) => editable || c[k]).map(([k, label]) => (
          <Field key={k} label={label}>{editable ? <TextArea rows={3} value={c[k] ?? ''} onChange={(e) => setC({ ...c, [k]: e.target.value })} /> : <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap' }}>{c[k]}</div>}</Field>
        ))}
        {!editable && Object.values(c).every((v) => !v) && <Empty>No commentary was written.</Empty>}

        {editable && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Btn onClick={save} disabled={busy}>Save draft</Btn><Btn onClick={() => run(async () => { await api.post(`/admin/smois/reports/${id}/refresh`, {}); done('Figures refreshed.'); })} disabled={busy}>Refresh figures</Btn>{aiStatus.data?.enabled && aiStatus.data.available && <Btn onClick={aiDraft} disabled={busy}>✨ Draft commentary with AI</Btn>}<Btn kind="primary" onClick={submit} disabled={busy}>Submit for review</Btn></div>}
        {canReview && (
          <Card title="Review" style={{ marginTop: 12 }}>
            <Field label="Note (required when asking for clarification)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8 }}><Btn kind="primary" onClick={() => decide('APPROVED')} disabled={busy}>Approve</Btn><Btn onClick={() => { setError(''); decide('CLARIFICATION_REQUESTED'); }} disabled={busy || !note.trim()}>Ask for clarification</Btn></div>
          </Card>
        )}
      </div>
    </Modal>
  );
}

/** Renders whatever sections the generated data contains. Nothing here computes a figure: it only shows what was counted. */
function ReportBody({ d }: { d: Record<string, any> }) {
  const { theme: T } = useTheme();
  const H = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '16px 0 8px' }}>{children}</div>;
  const KV = ({ o }: { o: Record<string, number> }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>{Object.entries(o).map(([k, v]) => <div key={k} style={{ background: T.surface2, borderRadius: 4, padding: '8px 10px' }}><div style={{ fontSize: 10, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>{k.replace(/([A-Z])/g, ' $1')}</div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{v}</div></div>)}</div>;
  const accounts = (rows: any[]) => (
    <Table head={['Account', 'Opening', 'Closing', 'Net growth', 'Growth %', 'Reach', 'Impressions', 'Engagement', 'Data']}>
      {rows.map((a) => <tr key={a.accountId}><Td>{a.name}<div style={{ fontSize: 11, opacity: 0.6 }}>{pretty(a.platform)}</div></Td><Td>{num(a.opening)}</Td><Td>{num(a.closing)}</Td><Td>{num(a.netGrowth)}</Td><Td>{num(a.growthPct, '%')}</Td><Td>{num(a.reach)}</Td><Td>{num(a.impressions)}</Td><Td>{num(a.engagement)}</Td><Td>{Math.round(a.coverage * 100)}%</Td></tr>)}
    </Table>
  );

  if (d.kind === 'weekly') {
    return (
      <>
        <H>Your accounts this week</H>{d.accounts.length ? accounts(d.accounts) : <Empty>You were not assigned to an account during this week.</Empty>}
        <H>Content</H><KV o={d.content} />
        {d.publishedPosts.length > 0 && <><H>Published</H>{d.publishedPosts.map((p: any, i: number) => <div key={i} style={{ fontSize: 13, color: T.text, padding: '4px 0' }}>{p.title} <span style={{ color: T.textSec }}>· {p.account}</span> {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ color: T.primary }}>view ↗</a>}</div>)}</>}
        <H>Tasks</H><KV o={d.tasks} />
        {d.outstandingTasks.length > 0 && <><H>Outstanding</H>{d.outstandingTasks.map((t: any, i: number) => <div key={i} style={{ fontSize: 13, padding: '3px 0', color: T.text }}>{t.title} {t.overdue && <Pill tone="bad">Overdue</Pill>} <span style={{ color: T.textSec, fontSize: 11 }}>{t.deadline ? fmtDate(t.deadline) : 'no deadline'}</span></div>)}</>}
      </>
    );
  }
  const cur = d.audience.current; const prev = d.audience.previous;
  return (
    <>
      <H>Audience, against the previous period ({d.previousPeriod.from} to {d.previousPeriod.to})</H>
      <Table head={['Measure', 'This period', 'Previous']}>
        {[['Followers', 'followers'], ['Net growth', 'netGrowth'], ['Growth %', 'growthPct'], ['Reach', 'reach'], ['Impressions', 'impressions'], ['Engagement', 'engagement'], ['Website clicks', 'websiteClicks'], ['Engagement rate (reach) %', 'engagementRateReach']].map(([l, k]) => <tr key={k}><Td>{l}</Td><Td>{num(cur[k])}</Td><Td>{num(prev[k])}</Td></tr>)}
      </Table>
      <H>Platforms</H>
      <Table head={['Platform', 'Followers', 'Net growth', 'Growth %', 'Reach', 'Engagement']}>
        {d.platforms.map((p: any) => <tr key={p.platform}><Td>{pretty(p.platform)}</Td><Td>{num(p.current.followers)}</Td><Td>{num(p.current.netGrowth)}</Td><Td>{num(p.current.growthPct, '%')}</Td><Td>{num(p.current.reach)}</Td><Td>{num(p.current.engagement)}</Td></tr>)}
      </Table>
      <H>Accounts</H>{accounts(d.accounts)}
      <H>Content</H><KV o={d.content} />
      <H>Best posts</H>{d.topPosts.length ? d.topPosts.map((p: any, i: number) => <div key={i} style={{ fontSize: 13, padding: '3px 0', color: T.text }}>{p.title} <span style={{ color: T.textSec }}>· {p.account} · {num(p.engagementRate, '%')}</span></div>) : <Empty>No published posts with readings in this period.</Empty>}
      {d.bottomPosts.length > 0 && <><H>Lowest posts</H>{d.bottomPosts.map((p: any, i: number) => <div key={i} style={{ fontSize: 13, padding: '3px 0', color: T.text }}>{p.title} <span style={{ color: T.textSec }}>· {p.account} · {num(p.engagementRate, '%')}</span></div>)}</>}
      <H>Workforce</H>
      <Table head={['Person', 'Tasks assigned', 'Completed', 'Overdue', 'Content created', 'Published', 'Weekly reports']}>
        {d.workforce.map((w: any) => <tr key={w.name}><Td>{w.name}</Td><Td>{w.tasks.assigned}</Td><Td>{w.tasks.completed}</Td><Td>{w.tasks.overdue}</Td><Td>{w.content.created}</Td><Td>{w.content.published}</Td><Td>{w.reports.submitted}/{w.reports.due}</Td></tr>)}
      </Table>
      {d.targets.length > 0 && <><H>Targets</H><Table head={['Target', 'Target', 'Actual', 'Achieved', 'Status']}>{d.targets.map((t: any, i: number) => <tr key={i}><Td>{t.name}</Td><Td>{t.target}</Td><Td>{num(t.actual)}</Td><Td>{num(t.percent, '%')}</Td><Td>{pretty(t.status)}</Td></tr>)}</Table></>}
    </>
  );
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Opens a clean, self-contained page and prints it, so "Save as PDF" gives a tidy document without the admin chrome. */
function printReport(r: Report) {
  const d = r.data;
  const fmt = (v: unknown, suffix = '') => (v === null || v === undefined ? 'not recorded' : `${Number(v).toLocaleString('en-NG')}${suffix}`);
  const table = (head: string[], rows: unknown[][]) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const acct = (rows: any[]) => table(['Account', 'Opening', 'Closing', 'Net growth', 'Growth %', 'Reach', 'Impressions', 'Engagement', 'Data'], rows.map((a) => [`${a.name} (${a.platform})`, fmt(a.opening), fmt(a.closing), fmt(a.netGrowth), fmt(a.growthPct, '%'), fmt(a.reach), fmt(a.impressions), fmt(a.engagement), `${Math.round(a.coverage * 100)}%`]));
  let body = '';
  if (d.kind === 'weekly') {
    body += `<h2>Accounts</h2>${acct(d.accounts)}<h2>Content</h2>${table(Object.keys(d.content), [Object.values(d.content)])}<h2>Tasks</h2>${table(Object.keys(d.tasks), [Object.values(d.tasks)])}`;
    if (d.outstandingTasks.length) body += `<h2>Outstanding tasks</h2>${table(['Task', 'Status', 'Deadline'], d.outstandingTasks.map((t: any) => [t.title, t.status, t.deadline ? new Date(t.deadline).toLocaleDateString('en-NG') : '']))}`;
  } else {
    const c = d.audience.current; const p = d.audience.previous;
    body += `<h2>Audience</h2>${table(['Measure', 'This period', 'Previous period'], ['followers', 'netGrowth', 'growthPct', 'reach', 'impressions', 'engagement', 'websiteClicks', 'engagementRateReach'].map((k) => [k, fmt(c[k]), fmt(p[k])]))}`;
    body += `<h2>Platforms</h2>${table(['Platform', 'Followers', 'Net growth', 'Growth %', 'Reach', 'Engagement'], d.platforms.map((x: any) => [x.platform, fmt(x.current.followers), fmt(x.current.netGrowth), fmt(x.current.growthPct, '%'), fmt(x.current.reach), fmt(x.current.engagement)]))}`;
    body += `<h2>Accounts</h2>${acct(d.accounts)}<h2>Content</h2>${table(Object.keys(d.content), [Object.values(d.content)])}`;
    body += `<h2>Best posts</h2>${table(['Post', 'Account', 'Engagement rate'], d.topPosts.map((x: any) => [x.title, x.account, fmt(x.engagementRate, '%')]))}`;
    body += `<h2>Workforce</h2>${table(['Person', 'Tasks assigned', 'Completed', 'Overdue', 'Content created', 'Published'], d.workforce.map((w: any) => [w.name, w.tasks.assigned, w.tasks.completed, w.tasks.overdue, w.content.created, w.content.published]))}`;
    if (d.targets.length) body += `<h2>Targets</h2>${table(['Target', 'Goal', 'Actual', 'Achieved', 'Status'], d.targets.map((t: any) => [t.name, t.target, fmt(t.actual), fmt(t.percent, '%'), t.status]))}`;
  }
  const comm = Object.entries(r.commentary ?? {}).filter(([, v]) => v).map(([k, v]) => `<h3>${esc(COMMENTARY.find((x) => x[0] === k)?.[1] ?? k)}</h3><p>${esc(v).replace(/\n/g, '<br>')}</p>`).join('');
  const defs = (d.metricDefinitions ?? []).map((m: any) => `<li><b>${esc(m.label)}:</b> ${esc(m.definition)}</li>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GoBuyMe ${esc(r.label)} ${esc(r.periodStart)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px;line-height:1.5} h1{font-size:22px;margin:0} h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px} h3{font-size:13px;margin:12px 0 2px}
    table{border-collapse:collapse;width:100%;margin:6px 0} th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;font-size:12px} th{background:#f5f5f5} .meta{color:#555;font-size:12px;margin:4px 0 14px} .note{background:#fff7ed;border:1px solid #fed7aa;padding:8px 10px;border-radius:4px;font-size:12px} li{margin:2px 0;font-size:11px} @media print{body{margin:14mm}}
  </style></head><body>
    <h1>GoBuyMe: ${esc(r.label)}</h1>
    <div class="meta">Period ${esc(r.periodStart)} to ${esc(r.periodEnd)} · Prepared by ${esc(r.authorName)} · Status ${esc(pretty(r.status))}${r.reviewedByName ? ` · Approved by ${esc(r.reviewedByName)}` : ''} · Generated ${esc(new Date(d.generatedAt).toLocaleString('en-NG'))}</div>
    <div class="note">${esc(d.source)} Figures marked "not recorded" were not entered; they are not zero.</div>
    ${body}<h2>Commentary</h2>${comm || '<p>No commentary.</p>'}
    <h2>Not available in this report</h2><ul>${(d.unavailable ?? []).map((u: string) => `<li>${esc(u)}</li>`).join('')}</ul>
    <h2>Metric definitions (version ${esc(d.metricVersion)})</h2><ul>${defs || '<li>See the Analytics page for definitions.</li>'}</ul>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}
