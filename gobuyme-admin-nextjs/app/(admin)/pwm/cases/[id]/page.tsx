'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, PersonSelect, Pill, Select, TextArea, fmtDate, fmtDateTime, label, uploadDocument, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface D {
  id: string; reference: string; type: string; category: string; severity: string; stage: string; summary: string; outcome: string | null; outcomeNote: string | null; responseDue: string | null; hearingAt: string | null; appealDue: string | null;
  warningExpiresAt: string | null; warningSpent: boolean; breakGlass: boolean; myRole: string | null; employee: { id: string; name: string; employeeNo: string; jobTitle: string; department: { name: string } | null };
  handlers: { id: string; userId: string; name: string; role: string; recusedAt: string | null }[]; events: { id: string; kind: string; text: string; fileUrl: string | null; byName: string | null; createdAt: string }[];
}
const OUTCOMES: Record<string, string[]> = { DISCIPLINARY: ['NO_ACTION', 'VERBAL_WARNING', 'WRITTEN_WARNING', 'FINAL_WARNING', 'SUSPENSION', 'TERMINATION'], GRIEVANCE: ['UPHELD', 'PARTLY_UPHELD', 'NOT_UPHELD', 'NO_ACTION'] };

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const { theme: T } = useTheme();
  const { me } = usePwm();
  const { data: c, loading, error, reload } = useLoad(() => api.get<{ data: D }>(`/admin/pwm/cases/${id}`).then((r) => r.data), [id]);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState({ text: '', days: '3' });
  const [h, setH] = useState({ when: '', minutes: '' });
  const [o, setO] = useState({ outcome: '', note: '' });
  const [hand, setHand] = useState({ userId: '', role: 'HANDLER' });
  const [bg, setBg] = useState('');
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  if (loading && !c) return <Empty>Loading…</Empty>;
  if (error || !c) return <Notice kind="error">{error ? 'This case does not exist or you are not named on it.' : 'Not found.'}</Notice>;
  const post = (path: string, body: Record<string, unknown>) => run(async () => { const r = await api.post<{ message: string }>(`/admin/pwm/cases/${c.id}/${path}`, body); setMsg(r.message); reload(); });
  const closed = c.stage === 'CLOSED';
  return (
    <div>
      <PageHeader title={`${c.reference}: ${c.employee.name}`} sub={`${label(c.type)} · ${c.category} · ${c.employee.employeeNo}, ${c.employee.jobTitle}`} actions={<><Pill tone={closed ? 'neutral' : 'info'}>{label(c.stage)}</Pill><Pill tone={c.severity === 'HIGH' ? 'bad' : c.severity === 'MEDIUM' ? 'warn' : 'neutral'}>{label(c.severity)}</Pill></>} />
      <Notice kind="info">Confidential. Every time you open this case it is logged.{c.breakGlass && ' You are here through emergency access, which expires in 24 hours.'}</Notice>
      {(actionError) && <Notice kind="error">{actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <Card title="The matter"><div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap' }}>{c.summary}</div>
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 10, lineHeight: 1.8 }}>{c.responseDue && <div>Employee response due {fmtDate(c.responseDue)}</div>}{c.hearingAt && <div>Hearing {fmtDateTime(c.hearingAt)}</div>}{c.appealDue && <div>Appeal until {fmtDate(c.appealDue)}</div>}</div>
          {c.outcome && <div style={{ marginTop: 10 }}><Pill tone="brand">{label(c.outcome)}</Pill> {c.warningExpiresAt && <Pill tone={c.warningSpent ? 'neutral' : 'warn'}>{c.warningSpent ? 'Warning spent' : `Warning valid until ${fmtDate(c.warningExpiresAt)}`}</Pill>}<div style={{ fontSize: 13, marginTop: 6, color: T.text }}>{c.outcomeNote}</div></div>}</Card>
        <Card title="People on this case">
          {c.handlers.map((x) => <div key={x.id} style={{ padding: '4px 0', fontSize: 13, color: T.text, opacity: x.recusedAt ? 0.5 : 1 }}>{x.name} <span style={{ color: T.textSec }}>{label(x.role)}</span>{x.recusedAt && <Pill>Recused</Pill>}</div>)}
          {!closed && c.myRole && <div style={{ marginTop: 8 }}><Grid cols={3}><Field label="Add"><PersonSelect value={hand.userId} onChange={(v) => setHand({ ...hand, userId: v })} /></Field><Field label="As"><Select value={hand.role} onChange={(e) => setHand({ ...hand, role: e.target.value })}><option value="HANDLER">Handler</option><option value="INVESTIGATOR">Investigator</option><option value="PANEL">Panel</option></Select></Field></Grid><div style={{ display: 'flex', gap: 6 }}><Btn small disabled={busy || !hand.userId} onClick={() => post('handlers', hand)}>Add</Btn><Btn small kind="danger" disabled={busy} onClick={() => { const r = window.prompt('Why must you step away from this case? (conflict of interest)'); if (r) post('recuse', { reason: r }); }}>I need to recuse myself</Btn></div></div>}
        </Card>
      </div>

      {!closed && c.myRole && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 12 }}>
          {c.type === 'DISCIPLINARY' && ['INTAKE', 'INVESTIGATION'].includes(c.stage) && <Card title="Issue a query"><Field label="What the employee must answer"><TextArea rows={3} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} /></Field><Field label="Days to respond"><Input type="number" value={q.days} onChange={(e) => setQ({ ...q, days: e.target.value })} /></Field><Btn disabled={busy || !q.text.trim()} onClick={() => post('query', { text: q.text, responseDays: Number(q.days) })}>Send query</Btn></Card>}
          <Card title="Move the case on"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>{c.stage === 'INTAKE' && <Btn disabled={busy} onClick={() => post('stage', { stage: 'INVESTIGATION' })}>Start investigation</Btn>}</div>
            {['INTAKE', 'INVESTIGATION', 'HEARING'].includes(c.stage) && <><Grid><Field label="Hearing date and time"><Input type="datetime-local" value={h.when} onChange={(e) => setH({ ...h, when: e.target.value })} /></Field></Grid><Field label="Minutes (optional)"><TextArea rows={2} value={h.minutes} onChange={(e) => setH({ ...h, minutes: e.target.value })} /></Field><Btn disabled={busy || !h.when} onClick={() => post('stage', { stage: 'HEARING', hearingAt: new Date(h.when).toISOString(), minutes: h.minutes })}>Set the hearing</Btn></>}
          </Card>
          {['INTAKE', 'INVESTIGATION', 'HEARING'].includes(c.stage) && <Card title="Record the outcome"><Field label="Outcome"><Select value={o.outcome} onChange={(e) => setO({ ...o, outcome: e.target.value })}><option value="">Choose…</option>{OUTCOMES[c.type].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>{(o.outcome === 'SUSPENSION' || o.outcome === 'TERMINATION') && <Notice kind="warn">This sends a request to management. The employee&apos;s status does not change until it is approved.</Notice>}<Field label="Reasoning"><TextArea rows={3} value={o.note} onChange={(e) => setO({ ...o, note: e.target.value })} /></Field><Btn kind="primary" disabled={busy || !o.outcome || !o.note.trim()} onClick={() => post('outcome', o)}>Record outcome</Btn></Card>}
          {['OUTCOME', 'APPEAL'].includes(c.stage) && <Card title="Close the case"><div style={{ fontSize: 13, marginBottom: 8 }}>{c.stage === 'APPEAL' ? 'An appeal is in. Review it, add your decision as a note, then close.' : 'Close once the appeal period has passed.'}</div><Btn kind="primary" disabled={busy} onClick={() => post('close', {})}>Close case</Btn></Card>}
        </div>
      )}

      <div style={{ marginTop: 12 }}><Card title="Case file">
        {c.events.map((e) => <div key={e.id} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text }}><Pill tone={e.kind === 'OUTCOME' ? 'brand' : e.kind === 'BREAK_GLASS' ? 'bad' : 'neutral'}>{label(e.kind)}</Pill> <span style={{ whiteSpace: 'pre-wrap' }}>{e.text}</span>{e.fileUrl && <> <a href={e.fileUrl} target="_blank" rel="noreferrer" style={{ color: T.primary }}>File</a></>}<div style={{ fontSize: 11, color: T.textMuted }}>{fmtDateTime(e.createdAt)} · {e.byName ?? 'System'}</div></div>)}
        {!closed && c.myRole && <div style={{ marginTop: 10 }}><Field label="Add to the file"><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><Btn disabled={busy || !note.trim()} onClick={() => run(async () => { const up = file ? await uploadDocument(file) : null; await api.post(`/admin/pwm/cases/${c.id}/events`, { kind: file ? 'EVIDENCE' : 'NOTE', text: note, fileUrl: up?.url }); setNote(''); setFile(null); reload(); })}>Add</Btn></div></div>}
      </Card></div>
      {me?.level === 'SUPER' && !c.myRole && !c.breakGlass && <div style={{ marginTop: 12 }}><Card title="Emergency access"><Input value={bg} onChange={(e) => setBg(e.target.value)} placeholder="Why do you need this case? HR and management are told." /><div style={{ marginTop: 8 }}><Btn kind="danger" disabled={busy || bg.length < 15} onClick={() => post('break-glass', { reason: bg })}>Open for 24 hours</Btn></div></Card></div>}
      <div style={{ marginTop: 12, fontSize: 12 }}><Link href="/pwm/cases">← All my cases</Link></div>
    </div>
  );
}
