'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Table, Tabs, Td, TextArea, fmtDate, label, todayYmd, useAction, useLoad, usePwm } from '@/components/pwm/ui';

type Tab = 'register' | 'summary' | 'approvals' | 'schedules';
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : '—');

export default function AttendancePage() {
  const { me } = usePwm();
  const [tab, setTab] = useState<Tab>('register');
  return (
    <div>
      <PageHeader title="Attendance" sub="The daily register, absence and lateness by department, corrections and overtime, and work schedules. No location is ever collected." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'register', label: 'Daily register' }, { id: 'summary', label: 'Summary' }, { id: 'approvals', label: 'Corrections and overtime' }, ...(me?.can.manageAttendance ? [{ id: 'schedules' as Tab, label: 'Schedules' }] : [])]} />
      {tab === 'register' && <Register />}{tab === 'summary' && <Summary />}{tab === 'approvals' && <Approvals />}{tab === 'schedules' && <Schedules />}
    </div>
  );
}

function Register() {
  const { me } = usePwm();
  const [date, setDate] = useState(todayYmd());
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { date: string; holiday: boolean; rows: { employeeId: string; employeeNo: string; name: string; department: string | null; record: { id: string; status: string; clockIn: string | null; clockOut: string | null; minutesLate: number; minutesWorked: number; explanation: string | null; source: string } | null }[] } }>(`/admin/pwm/attendance/register?date=${date}`).then((r) => r.data), [date]);
  const { error: actionError, run } = useAction();
  const tone = (s?: string) => (s === 'PRESENT' || s === 'REMOTE' ? 'good' : s === 'LATE' ? 'warn' : s === 'ABSENT' ? 'bad' : 'neutral') as 'good' | 'warn' | 'bad' | 'neutral';
  return (
    <div>
      <div style={{ maxWidth: 200, marginBottom: 12 }}><Input type="date" value={date} max={todayYmd()} onChange={(e) => setDate(e.target.value)} /></div>
      {data?.holiday && <Notice kind="info">This day is a public holiday.</Notice>}
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.rows.length ? <Empty>No employees.</Empty> : (
        <Table head={['Employee', 'In', 'Out', 'Hours', 'Status', '']}>
          {data.rows.map((r) => (
            <tr key={r.employeeId}><Td><b>{r.name}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{r.department ?? ''}</div></Td><Td>{time(r.record?.clockIn ?? null)}</Td><Td>{time(r.record?.clockOut ?? null)}</Td><Td>{r.record?.minutesWorked ? Math.round(r.record.minutesWorked / 6) / 10 : '—'}</Td>
              <Td>{r.record ? <Pill tone={tone(r.record.status)}>{label(r.record.status)}{r.record.status === 'LATE' ? ` ${r.record.minutesLate}m` : ''}</Pill> : <span style={{ opacity: 0.5 }}>No record</span>}{r.record?.explanation && <div style={{ fontSize: 11 }}>{r.record.explanation}</div>}{r.record?.source === 'CORRECTED' && <div style={{ fontSize: 10, opacity: 0.7 }}>corrected</div>}</Td>
              <Td>{me?.can.manageAttendance && r.record?.status === 'ABSENT' && <Btn small onClick={() => { const note = window.prompt('Reason this absence is excused'); if (note) run(async () => { await api.post(`/admin/pwm/attendance/${r.record?.id}/excuse`, { note }); reload(); }); }}>Excuse</Btn>}</Td></tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function Summary() {
  const [to, setTo] = useState(todayYmd());
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const { data, loading, error } = useLoad(() => api.get<{ data: { departments: { name: string; present: number; late: number; absent: number; remote: number; leave: number; absenteeismPct: number | null; avgLateMinutes: number | null; overtimeHours: number }[] } }>(`/admin/pwm/attendance/summary?from=${from}&to=${to}`).then((r) => r.data), [from, to]);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, maxWidth: 420, marginBottom: 12 }}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.departments.length ? <Empty>No attendance recorded in this period.</Empty> : (
        <Table head={['Department', 'Present', 'Late', 'Absent', 'Remote', 'On leave', 'Absenteeism', 'Avg late', 'Overtime']}>
          {data.departments.map((d) => <tr key={d.name}><Td><b>{d.name}</b></Td><Td>{d.present}</Td><Td>{d.late}</Td><Td>{d.absent}</Td><Td>{d.remote}</Td><Td>{d.leave}</Td><Td>{d.absenteeismPct === null ? '—' : <Pill tone={d.absenteeismPct > 5 ? 'bad' : d.absenteeismPct > 2 ? 'warn' : 'good'}>{d.absenteeismPct}%</Pill>}</Td><Td>{d.avgLateMinutes === null ? '—' : `${d.avgLateMinutes} min`}</Td><Td>{d.overtimeHours} h</Td></tr>)}
        </Table>
      )}
    </div>
  );
}

function Approvals() {
  const c = useLoad(() => api.get<{ data: { id: string; date: string; reason: string; originalIn: string | null; originalOut: string | null; requestedIn: string | null; requestedOut: string | null; employee: { name: string } }[] }>('/admin/pwm/attendance/corrections').then((r) => r.data), []);
  const o = useLoad(() => api.get<{ data: { id: string; date: string; hours: number; reason: string; employee: { name: string } }[] }>('/admin/pwm/overtime').then((r) => r.data), []);
  const [dlg, setDlg] = useState<{ kind: 'attendance/corrections' | 'overtime'; id: string; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const decide = () => run(async () => { if (!dlg) return; await api.post(`/admin/pwm/${dlg.kind}/${dlg.id}/decide`, { approve: dlg.approve, note }); setDlg(null); setNote(''); c.reload(); o.reload(); });
  const Buttons = ({ kind, id }: { kind: 'attendance/corrections' | 'overtime'; id: string }) => <div style={{ display: 'flex', gap: 6 }}><Btn small kind="primary" onClick={() => setDlg({ kind, id, approve: true })}>Approve</Btn><Btn small kind="danger" onClick={() => setDlg({ kind, id, approve: false })}>Decline</Btn></div>;
  return (
    <div>
      {error && <Notice kind="error">{error}</Notice>}
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Supervisors usually approve these in My HR. HR can step in for anything still waiting.</div>
      <h4 style={{ margin: '8px 0' }}>Corrections</h4>
      {!c.data?.length ? <Empty>None waiting.</Empty> : <Table head={['Employee', 'Date', 'Original', 'Requested', 'Reason', '']}>{c.data.map((x) => <tr key={x.id}><Td><b>{x.employee.name}</b></Td><Td>{fmtDate(x.date)}</Td><Td>{time(x.originalIn)} to {time(x.originalOut)}</Td><Td>{time(x.requestedIn)} to {time(x.requestedOut)}</Td><Td>{x.reason}</Td><Td><Buttons kind="attendance/corrections" id={x.id} /></Td></tr>)}</Table>}
      <h4 style={{ margin: '16px 0 8px' }}>Overtime</h4>
      {!o.data?.length ? <Empty>None waiting.</Empty> : <Table head={['Employee', 'Date', 'Hours', 'Reason', '']}>{o.data.map((x) => <tr key={x.id}><Td><b>{x.employee.name}</b></Td><Td>{fmtDate(x.date)}</Td><Td>{x.hours}</Td><Td>{x.reason}</Td><Td><Buttons kind="overtime" id={x.id} /></Td></tr>)}</Table>}
      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.approve ? 'Approve' : 'Decline'} width={440}><div style={{ padding: 20 }}><Field label={dlg?.approve ? 'Comment (optional)' : 'Reason (required)'}><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn kind={dlg?.approve ? 'primary' : 'danger'} disabled={busy || (!dlg?.approve && !note.trim())} onClick={decide}>Confirm</Btn></div></div></Modal>
    </div>
  );
}

interface Sch { id: string; name: string; startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; workDays: number[]; isDefault: boolean; assigned: number }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Schedules() {
  const { data, reload, error } = useLoad(() => api.get<{ data: Sch[] }>('/admin/pwm/schedules').then((r) => r.data), []);
  const depts = useLoad(() => api.get<{ data: { id: string; name: string }[] }>('/admin/pwm/departments').then((r) => r.data), []);
  const [edit, setEdit] = useState<Sch | 'new' | null>(null);
  const [assign, setAssign] = useState<{ s: Sch; dept: string } | null>(null);
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  return (
    <div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <div style={{ marginBottom: 10 }}><Btn kind="primary" onClick={() => setEdit('new')}>+ Schedule</Btn></div>
      {data && <Table head={['Schedule', 'Hours', 'Days', 'Grace', 'People', '']}>{data.map((s) => <tr key={s.id}><Td><b>{s.name}</b> {s.isDefault && <Pill>Default</Pill>}</Td><Td>{s.startTime} to {s.endTime}, {s.breakMinutes} min break</Td><Td>{s.workDays.map((d) => DAYS[d - 1]).join(' ')}</Td><Td>{s.graceMinutes} min</Td><Td>{s.assigned || (s.isDefault ? 'everyone else' : 0)}</Td><Td><div style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => setEdit(s)}>Edit</Btn><Btn small onClick={() => setAssign({ s, dept: '' })}>Assign</Btn></div></Td></tr>)}</Table>}
      {edit && <SchForm s={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <Modal open={!!assign} onClose={() => setAssign(null)} title={`Assign ${assign?.s.name ?? ''}`} width={440}><div style={{ padding: 20 }}>
        <Field label="Everyone in department"><Select value={assign?.dept ?? ''} onChange={(e) => assign && setAssign({ ...assign, dept: e.target.value })}><option value="">Choose…</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setAssign(null)}>Cancel</Btn><Btn kind="primary" disabled={busy || !assign?.dept} onClick={() => run(async () => { if (!assign) return; const r = await api.post<{ message: string }>(`/admin/pwm/schedules/${assign.s.id}/assign`, { departmentId: assign.dept }); setMsg(r.message); setAssign(null); reload(); })}>Assign</Btn></div>
      </div></Modal>
    </div>
  );
}

function SchForm({ s, onClose, onSaved }: { s: Sch | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: s?.name ?? '', startTime: s?.startTime ?? '08:00', endTime: s?.endTime ?? '17:00', breakMinutes: String(s?.breakMinutes ?? 60), graceMinutes: String(s?.graceMinutes ?? 15), workDays: s?.workDays ?? [1, 2, 3, 4, 5] });
  const { busy, error, run } = useAction();
  const toggle = (d: number) => setF({ ...f, workDays: f.workDays.includes(d) ? f.workDays.filter((x) => x !== d) : [...f.workDays, d].sort() });
  return (
    <Modal open onClose={onClose} title={s ? `Edit ${s.name}` : 'New schedule'} width={520}><div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
      <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Grid cols={3}><Field label="Starts"><Input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field><Field label="Ends"><Input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field><Field label="Break (min)"><Input type="number" value={f.breakMinutes} onChange={(e) => setF({ ...f, breakMinutes: e.target.value })} /></Field><Field label="Grace (min)" hint="Not late until after this"><Input type="number" value={f.graceMinutes} onChange={(e) => setF({ ...f, graceMinutes: e.target.value })} /></Field></Grid>
      <Field label="Work days"><div style={{ display: 'flex', gap: 10 }}>{DAYS.map((d, i) => <label key={d} style={{ fontSize: 13 }}><input type="checkbox" checked={f.workDays.includes(i + 1)} onChange={() => toggle(i + 1)} /> {d}</label>)}</div></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name} onClick={() => run(async () => { const body = { ...f, breakMinutes: Number(f.breakMinutes), graceMinutes: Number(f.graceMinutes) }; if (s) await api.patch(`/admin/pwm/schedules/${s.id}`, body); else await api.post('/admin/pwm/schedules', body); onSaved(); })}>Save</Btn></div>
    </div></Modal>
  );
}
