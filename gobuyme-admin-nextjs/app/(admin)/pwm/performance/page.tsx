'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, PersonSelect, Pill, Select, Table, Tabs, Td, TextArea, fmtDate, label, todayYmd, useAction, useLoad, usePwm } from '@/components/pwm/ui';

type Tab = 'cycles' | 'reviews' | 'targets' | 'report';
interface Cycle { id: string; name: string; type: string; periodStart: string; periodEnd: string; dueDate: string; status: string; total: number; completed: number; overdue: number }
interface Rev { id: string; status: string; cycle: string; dueDate: string; overdue: boolean; reviewerName: string | null; managerRating: number | null; employee: { id: string; name: string; department: { name: string } | null } }

export default function PerformancePage() {
  const [tab, setTab] = useState<Tab>('cycles');
  return (
    <div>
      <PageHeader title="Performance" sub="Review cycles, who is overdue, department targets and how ratings are spread. Reviews are completed by employees and their managers in My HR." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'cycles', label: 'Cycles' }, { id: 'reviews', label: 'Reviews' }, { id: 'targets', label: 'Department targets' }, { id: 'report', label: 'Report' }]} />
      {tab === 'cycles' && <Cycles />}{tab === 'reviews' && <Reviews />}{tab === 'targets' && <Targets />}{tab === 'report' && <Report />}
    </div>
  );
}

function Cycles() {
  const { me } = usePwm();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Cycle[] }>('/admin/pwm/performance/cycles').then((r) => r.data), []);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  return (
    <div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      {me?.can.managePerformance && <div style={{ marginBottom: 10 }}><Btn kind="primary" onClick={() => setAdding(true)}>+ Cycle</Btn></div>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No cycles yet.</Empty> : (
        <Table head={['Cycle', 'Period', 'Due', 'Progress', 'State', '']}>
          {data.map((c) => <tr key={c.id}><Td><b>{c.name}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{label(c.type)}</div></Td><Td>{fmtDate(c.periodStart)} to {fmtDate(c.periodEnd)}</Td><Td>{fmtDate(c.dueDate)}</Td><Td>{c.total ? `${c.completed} of ${c.total} done` : 'Not launched'}{c.overdue > 0 && <> <Pill tone="bad">{c.overdue} overdue</Pill></>}</Td><Td><Pill tone={c.status === 'OPEN' ? 'info' : 'neutral'}>{label(c.status)}</Pill></Td>
            <Td>{me?.can.managePerformance && c.status === 'OPEN' && <div style={{ display: 'flex', gap: 6 }}><Btn small kind="primary" disabled={busy} onClick={() => run(async () => { const r = await api.post<{ message: string }>(`/admin/pwm/performance/cycles/${c.id}/launch`, {}); setMsg(r.message); reload(); })}>{c.total ? 'Add new joiners' : 'Launch'}</Btn><Btn small disabled={busy} onClick={() => window.confirm('Close this cycle?') && run(async () => { await api.post(`/admin/pwm/performance/cycles/${c.id}/close`, {}); reload(); })}>Close</Btn></div>}</Td></tr>)}
        </Table>
      )}
      {adding && <CycleForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function CycleForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', type: 'QUARTERLY', periodStart: '', periodEnd: '', dueDate: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="New review cycle" width={520}><div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
      <Grid><Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Q4 2026" /></Field><Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['MONTHLY', 'QUARTERLY', 'ANNUAL', 'PROBATION', 'RENEWAL', 'ADHOC'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Period starts"><Input type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></Field><Field label="Period ends"><Input type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></Field><Field label="Reviews due by"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field></Grid>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name || !f.periodStart || !f.periodEnd || !f.dueDate} onClick={() => run(async () => { await api.post('/admin/pwm/performance/cycles', f); onSaved(); })}>Create</Btn></div>
    </div></Modal>
  );
}

function Reviews() {
  const { me } = usePwm();
  const [filter, setFilter] = useState('overdue');
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Rev[] }>(`/admin/pwm/performance/reviews${filter === 'overdue' ? '?overdue=1' : filter ? `?status=${filter}` : ''}`).then((r) => r.data), [filter]);
  const [reopen, setReopen] = useState<Rev | null>(null);
  const [assign, setAssign] = useState<{ r: Rev; uid: string } | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error: actionError, run } = useAction();
  return (
    <div>
      <div style={{ maxWidth: 240, marginBottom: 12 }}><Select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="overdue">Overdue reviews</option><option value="">All</option><option value="SELF">Waiting for self-assessment</option><option value="MANAGER">Waiting for manager</option><option value="DISCUSSION">In discussion</option><option value="ACKNOWLEDGED">Completed</option></Select></div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>Nothing here.</Empty> : (
        <Table head={['Employee', 'Cycle', 'Reviewer', 'Stage', 'Rating', '']}>
          {data.map((r) => <tr key={r.id}><Td><Link href={`/pwm/employees/${r.employee.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{r.employee.name}</Link><div style={{ fontSize: 11, opacity: 0.7 }}>{r.employee.department?.name ?? ''}</div></Td><Td>{r.cycle}<div style={{ fontSize: 11 }}>due {fmtDate(r.dueDate)}</div></Td><Td>{r.reviewerName ?? <Pill tone="warn">No reviewer</Pill>}</Td><Td><Pill tone={r.status === 'ACKNOWLEDGED' ? 'good' : r.overdue ? 'bad' : 'info'}>{label(r.status)}</Pill>{r.overdue && r.status !== 'ACKNOWLEDGED' && <Pill tone="bad">Overdue</Pill>}</Td><Td>{r.managerRating ?? '—'}</Td>
            <Td>{me?.can.managePerformance && <div style={{ display: 'flex', gap: 6 }}>{r.status === 'ACKNOWLEDGED' && <Btn small onClick={() => setReopen(r)}>Reopen</Btn>}{r.status !== 'ACKNOWLEDGED' && <Btn small onClick={() => setAssign({ r, uid: '' })}>Set reviewer</Btn>}</div>}</Td></tr>)}
        </Table>
      )}
      <Modal open={!!reopen} onClose={() => setReopen(null)} title="Reopen this review" width={440}><div style={{ padding: 20 }}><Notice kind="info">The manager can amend it and the employee acknowledges again. The reason is recorded.</Notice><Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setReopen(null)}>Cancel</Btn><Btn kind="primary" disabled={busy || !reason.trim()} onClick={() => run(async () => { if (!reopen) return; await api.post(`/admin/pwm/performance/reviews/${reopen.id}/reopen`, { reason }); setReopen(null); setReason(''); reload(); })}>Reopen</Btn></div></div></Modal>
      <Modal open={!!assign} onClose={() => setAssign(null)} title="Set the reviewer" width={440}><div style={{ padding: 20 }}><Field label="Manager who assesses (needs a My HR login)"><PersonSelect value={assign?.uid ?? ''} onChange={(v) => assign && setAssign({ ...assign, uid: v })} /></Field><div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Only people with a PWM role are listed here. To assign a line manager, set them as the employee&apos;s reporting manager instead and relaunch.</div><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setAssign(null)}>Cancel</Btn><Btn kind="primary" disabled={busy || !assign?.uid} onClick={() => run(async () => { if (!assign) return; await api.post(`/admin/pwm/performance/reviews/${assign.r.id}/reviewer`, { reviewerUserId: assign.uid }); setAssign(null); reload(); })}>Assign</Btn></div></div></Modal>
    </div>
  );
}

function Targets() {
  const { theme: T } = useTheme();
  const { me } = usePwm();
  const { data, reload, error } = useLoad(() => api.get<{ data: { id: string; title: string; target: string | null; measure: string | null; department: string | null; progress: number; status: string }[] }>('/admin/pwm/objectives/departments').then((r) => r.data), []);
  const depts = useLoad(() => api.get<{ data: { id: string; name: string }[] }>('/admin/pwm/departments').then((r) => r.data), []);
  const [f, setF] = useState({ departmentId: '', title: '', measure: '', target: '', dueDate: '' });
  const { busy, error: actionError, run } = useAction();
  return (
    <div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {(me?.can.managePerformance || me?.level === 'DEPARTMENT_HEAD') && (
        <Card title="Set a department target">
          <Grid><Field label="Department"><Select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">Choose…</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field><Field label="Target"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Measured by"><Input value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })} /></Field><Field label="Goal"><Input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field><Field label="Due"><Input type="date" min={todayYmd()} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field></Grid>
          <Btn kind="primary" disabled={busy || !f.departmentId || !f.title} onClick={() => run(async () => { await api.post('/admin/pwm/objectives', { ...f, dueDate: f.dueDate || null }); setF({ departmentId: '', title: '', measure: '', target: '', dueDate: '' }); reload(); })}>Add</Btn>
        </Card>
      )}
      <div style={{ marginTop: 12 }}>{!data?.length ? <Empty>No department targets yet. Managers then set individual objectives that serve them.</Empty> : <Table head={['Department', 'Target', 'Goal', 'Status']}>{data.map((o) => <tr key={o.id}><Td>{o.department}</Td><Td><b>{o.title}</b>{o.measure && <div style={{ fontSize: 11, color: T.textSec }}>{o.measure}</div>}</Td><Td>{o.target ?? '—'}</Td><Td><Pill tone={o.status === 'ACTIVE' ? 'info' : 'neutral'}>{label(o.status)}</Pill></Td></tr>)}</Table>}</div>
    </div>
  );
}

function Report() {
  const { theme: T } = useTheme();
  const { data } = useLoad(() => api.get<{ data: { total: number; completed: number; distribution: { rating: number; count: number }[]; departments: { name: string; total: number; completed: number; completionPct: number; averageRating: number | null }[] } }>('/admin/pwm/performance/report').then((r) => r.data), []);
  if (!data) return <Empty>Loading…</Empty>;
  const max = Math.max(1, ...data.distribution.map((d) => d.count));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
      <Card title={`Ratings: ${data.completed} of ${data.total} reviews completed`}>
        {data.distribution.map((d) => <div key={d.rating} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 30px', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 12 }}><span style={{ color: T.textSec }}>{d.rating} ★</span><div style={{ background: T.surface2, borderRadius: 4, height: 10 }}><div style={{ width: `${(d.count / max) * 100}%`, background: T.primary, height: 10, borderRadius: 4 }} /></div><b style={{ color: T.text }}>{d.count}</b></div>)}
      </Card>
      <Card title="By department">{data.departments.length === 0 ? <Empty>No data.</Empty> : <Table head={['Department', 'Completed', 'Average']}>{data.departments.map((d) => <tr key={d.name}><Td>{d.name}</Td><Td>{d.completed}/{d.total} ({d.completionPct}%)</Td><Td>{d.averageRating ?? '—'}</Td></tr>)}</Table>}</Card>
    </div>
  );
}
