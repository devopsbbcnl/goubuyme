'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Input, Notice, PageHeader, Pill, Table, Td, fmtDate, label, uploadDocument, useAction, useLoad } from '@/components/pwm/ui';

interface Data {
  catalogue: { id: string; title: string; provider: string | null; mode: string; cost: number; durationHours: number; mandatory: boolean }[];
  enrolments: { id: string; course: string; mandatory: boolean; status: string; assigned: boolean; completedAt: string | null; certificateUrl: string | null }[];
  mandatory: { courseId: string; course: string; upToDate: boolean; recurrenceMonths: number | null }[];
  plans: { id: string; goal: string; status: string; actions: { title: string; dueDate: string }[] | null }[];
  skills: { skill: string; level: number; at: string }[];
}
interface Rec { id: string; kind: string; title: string; citation: string | null; date: string }

export default function MyLearning() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>('/my-hr/learning').then((r) => r.data), []);
  const rec = useLoad(() => api.get<{ data: Rec[] }>('/my-hr/recognition').then((r) => r.data), []);
  const [goal, setGoal] = useState('');
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  if (loading && !data) return <Empty>Loading…</Empty>;
  const attach = (id: string, f: File) => run(async () => { const up = await uploadDocument(f); await api.post(`/my-hr/learning/${id}/certificate`, { url: up.url }); setMsg('Certificate attached. HR will confirm completion.'); reload(); });
  const tone = (s: string) => (s === 'COMPLETED' ? 'good' : s === 'APPROVED' ? 'info' : s === 'REQUESTED' ? 'warn' : 'neutral') as 'good' | 'info' | 'warn' | 'neutral';
  return (
    <div>
      <PageHeader title="Learning" sub="Mandatory training, courses you can ask for, your development plan and your skills." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      {data?.mandatory.some((m) => !m.upToDate) && <Notice kind="warn">Mandatory training due: {data.mandatory.filter((m) => !m.upToDate).map((m) => m.course).join(', ')}.</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <Card title="My courses">
          {!data?.enrolments.length ? <Empty>Nothing yet.</Empty> : data.enrolments.map((e) => (
            <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(128,128,128,.2)', fontSize: 13 }}><b>{e.course}</b> <Pill tone={tone(e.status)}>{label(e.status)}</Pill>{e.mandatory && <Pill tone="warn">Mandatory</Pill>}{e.completedAt && <span style={{ fontSize: 11 }}> {fmtDate(e.completedAt)}</span>}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>{e.status === 'APPROVED' && !e.certificateUrl && <label style={{ fontSize: 12, cursor: 'pointer', color: '#FF521B' }}>Attach certificate<input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) attach(e.id, f); }} /></label>}{e.certificateUrl && <a href={e.certificateUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Certificate</a>}{e.status === 'REQUESTED' && <Btn small onClick={() => run(async () => { await api.post(`/my-hr/learning/${e.id}/cancel`, {}); reload(); })}>Withdraw</Btn>}</div></div>
          ))}
        </Card>
        <Card title="Ask for a course">
          {!data?.catalogue.length ? <Empty>No courses in the catalogue yet.</Empty> : data.catalogue.map((c) => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', fontSize: 13, alignItems: 'center' }}><span><b>{c.title}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{c.provider ?? label(c.mode)}{c.cost ? ` · ₦${c.cost.toLocaleString('en-NG')}` : ' · free'}{c.durationHours ? ` · ${c.durationHours} h` : ''}</div></span><Btn small disabled={busy} onClick={() => run(async () => { await api.post('/my-hr/learning/request', { courseId: c.id }); setMsg('Request sent to your supervisor.'); reload(); })}>Request</Btn></div>)}
        </Card>
        <Card title="My development plan">
          {data?.plans.map((p) => <div key={p.id} style={{ padding: '6px 0', fontSize: 13 }}><b>{p.goal}</b> <Pill>{label(p.status)}</Pill>{p.actions?.map((a, i) => <div key={i} style={{ fontSize: 12, opacity: 0.8 }}>• {a.title}{a.dueDate ? ` (${fmtDate(a.dueDate)})` : ''}</div>)}</div>)}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><Input placeholder="A goal you want to work towards" value={goal} onChange={(e) => setGoal(e.target.value)} /><Btn disabled={busy || !goal.trim()} onClick={() => run(async () => { await api.post('/my-hr/development', { goal }); setGoal(''); reload(); })}>Add</Btn></div>
        </Card>
        <Card title="My skills">{!data?.skills.length ? <Empty>No skills assessed yet.</Empty> : <Table head={['Skill', 'Level']}>{data.skills.map((s, i) => <tr key={i}><Td>{s.skill}</Td><Td>{'★'.repeat(s.level)}{'☆'.repeat(5 - s.level)}</Td></tr>)}</Table>}</Card>
        {rec.data && rec.data.length > 0 && <Card title="Recognition">{rec.data.map((r) => <div key={r.id} style={{ padding: '6px 0', fontSize: 13 }}>🏅 <b>{r.title}</b> <span style={{ opacity: 0.7 }}>{fmtDate(r.date)}</span>{r.citation && <div style={{ fontSize: 12, opacity: 0.8 }}>{r.citation}</div>}</div>)}</Card>}
      </div>
      <span style={{ display: 'none' }}><Field label=""><span /></Field></span>
    </div>
  );
}
