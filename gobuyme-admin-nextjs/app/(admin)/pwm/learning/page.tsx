'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Table, Tabs, Td, TextArea, fmtDate, label, todayYmd, useAction, useLoad, usePwm } from '@/components/pwm/ui';

type Tab = 'enrolments' | 'courses' | 'compliance' | 'budgets' | 'skills';
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export default function LearningPage() {
  const { me } = usePwm();
  const [tab, setTab] = useState<Tab>('enrolments');
  return (
    <div>
      <PageHeader title="Learning and development" sub="The course catalogue, who is enrolled, department budgets, mandatory-training compliance and the skills matrix." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'enrolments', label: 'Enrolments' }, { id: 'courses', label: 'Courses' }, { id: 'compliance', label: 'Mandatory training' }, { id: 'budgets', label: 'Budgets' }, { id: 'skills', label: 'Skills matrix' }]} />
      {tab === 'enrolments' && <Enrolments manage={!!me?.can.manageLearning} />}{tab === 'courses' && <Courses manage={!!me?.can.manageLearning} />}{tab === 'compliance' && <Compliance manage={!!me?.can.manageLearning} />}{tab === 'budgets' && <Budgets manage={!!me?.can.manageLearning} />}{tab === 'skills' && <Skills manage={!!me?.can.manageLearning} />}
    </div>
  );
}

interface Enr { id: string; status: string; course: string; mandatory: boolean; assigned: boolean; cost: number; employee: { id: string; name: string; department: string | null }; completedAt: string | null; certificateUrl: string | null; overBudget: boolean; budgetRemaining: number | null }
function Enrolments({ manage }: { manage: boolean }) {
  const [status, setStatus] = useState('REQUESTED');
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Enr[] }>(`/admin/pwm/learning/enrolments${status ? `?status=${status}` : ''}`).then((r) => r.data), [status]);
  const [dlg, setDlg] = useState<{ id: string; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [assign, setAssign] = useState(false);
  const { busy, error: actionError, run } = useAction();
  const decide = () => run(async () => { if (!dlg) return; await api.post(`/admin/pwm/learning/enrolments/${dlg.id}/decide`, { approve: dlg.approve, note }); setDlg(null); setNote(''); reload(); });
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 220 }}><option value="REQUESTED">Waiting for approval</option><option value="APPROVED">Approved, in progress</option><option value="COMPLETED">Completed</option><option value="">All</option></Select>{manage && <Btn kind="primary" onClick={() => setAssign(true)}>Assign a course</Btn>}</div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>Nothing here.</Empty> : (
        <Table head={['Employee', 'Course', 'Cost', 'Status', '']}>
          {data.map((e) => <tr key={e.id}><Td><b>{e.employee.name}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{e.employee.department}</div></Td><Td>{e.course} {e.mandatory && <Pill tone="warn">Mandatory</Pill>} {e.assigned && <Pill>Assigned</Pill>}</Td><Td>{e.cost ? naira(e.cost) : 'Free'}</Td>
            <Td><Pill tone={e.status === 'COMPLETED' ? 'good' : e.status === 'REQUESTED' ? 'warn' : e.status === 'APPROVED' ? 'info' : 'neutral'}>{label(e.status)}</Pill>{e.overBudget && <div><Pill tone="bad">Over budget by {naira(e.cost - (e.budgetRemaining ?? 0))}</Pill></div>}{e.certificateUrl && <div><a href={e.certificateUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>Certificate</a></div>}</Td>
            <Td><div style={{ display: 'flex', gap: 6 }}>{e.status === 'REQUESTED' && <><Btn small kind="primary" onClick={() => setDlg({ id: e.id, approve: true })}>Approve</Btn><Btn small kind="danger" onClick={() => setDlg({ id: e.id, approve: false })}>Decline</Btn></>}{manage && e.status === 'APPROVED' && <Btn small onClick={() => run(async () => { await api.post(`/admin/pwm/learning/enrolments/${e.id}/complete`, { completedAt: todayYmd(), certificateUrl: e.certificateUrl ?? undefined }); reload(); })}>Mark complete</Btn>}</div></Td></tr>)}
        </Table>
      )}
      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.approve ? 'Approve' : 'Decline'} width={440}><div style={{ padding: 20 }}><Field label={dlg?.approve ? 'Comment (optional)' : 'Reason (required)'}><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn kind={dlg?.approve ? 'primary' : 'danger'} disabled={busy || (!dlg?.approve && !note.trim())} onClick={decide}>Confirm</Btn></div></div></Modal>
      {assign && <AssignCourse onClose={() => setAssign(false)} onDone={() => { setAssign(false); reload(); }} />}
    </div>
  );
}

interface Course { id: string; title: string; provider: string | null; mode: string; cost: number; durationHours: number; mandatory: boolean; recurrenceMonths: number | null; active: boolean }
function Courses({ manage }: { manage: boolean }) {
  const { data, error, reload } = useLoad(() => api.get<{ data: Course[] }>('/admin/pwm/learning/courses').then((r) => r.data), []);
  const [edit, setEdit] = useState<Course | 'new' | null>(null);
  return (
    <div>
      {error && <Notice kind="error">{error}</Notice>}
      {manage && <div style={{ marginBottom: 10 }}><Btn kind="primary" onClick={() => setEdit('new')}>+ Course</Btn></div>}
      {!data?.length ? <Empty>No courses yet.</Empty> : <Table head={['Course', 'Provider', 'Mode', 'Cost', 'Hours', 'Rules', '']}>{data.map((c) => <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}><Td><b>{c.title}</b></Td><Td>{c.provider ?? '—'}</Td><Td>{label(c.mode)}</Td><Td>{c.cost ? naira(c.cost) : 'Free'}</Td><Td>{c.durationHours || '—'}</Td><Td>{c.mandatory ? <Pill tone="warn">Mandatory{c.recurrenceMonths ? `, every ${c.recurrenceMonths} months` : ''}</Pill> : '—'}</Td><Td>{manage && <Btn small onClick={() => setEdit(c)}>Edit</Btn>}</Td></tr>)}</Table>}
      {edit && <CourseForm c={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}
function CourseForm({ c, onClose, onSaved }: { c: Course | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: c?.title ?? '', provider: c?.provider ?? '', mode: c?.mode ?? 'ONLINE', cost: String(c?.cost ?? 0), durationHours: String(c?.durationHours ?? 0), mandatory: c?.mandatory ?? false, recurrenceMonths: String(c?.recurrenceMonths ?? ''), active: c?.active ?? true });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={c ? 'Edit course' : 'New course'} width={560}><div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
      <Grid><Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Provider"><Input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /></Field><Field label="Mode"><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="ONLINE">Online</option><option value="CLASSROOM">Classroom</option><option value="ON_THE_JOB">On the job</option><option value="EXTERNAL">External</option></Select></Field><Field label="Cost (₦)"><Input type="number" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field><Field label="Hours"><Input type="number" value={f.durationHours} onChange={(e) => setF({ ...f, durationHours: e.target.value })} /></Field></Grid>
      <label style={{ display: 'flex', gap: 8, fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={f.mandatory} onChange={(e) => setF({ ...f, mandatory: e.target.checked })} />Mandatory for everyone</label>
      {f.mandatory && <Field label="Repeat every (months)" hint="Blank = once only"><Input type="number" value={f.recurrenceMonths} onChange={(e) => setF({ ...f, recurrenceMonths: e.target.value })} /></Field>}
      <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 10 }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Available</label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.title} onClick={() => run(async () => { const body = { ...f, cost: Number(f.cost), durationHours: Number(f.durationHours), recurrenceMonths: f.mandatory && f.recurrenceMonths ? Number(f.recurrenceMonths) : null }; if (c) await api.patch(`/admin/pwm/learning/courses/${c.id}`, body); else await api.post('/admin/pwm/learning/courses', body); onSaved(); })}>Save</Btn></div>
    </div></Modal>
  );
}
function AssignCourse({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const courses = useLoad(() => api.get<{ data: Course[] }>('/admin/pwm/learning/courses').then((r) => r.data.filter((c) => c.active)), []);
  const emps = useLoad(() => api.get<{ data: { id: string; firstName: string; lastName: string; employeeNo: string }[] }>('/admin/pwm/employees/lookup').then((r) => r.data), []);
  const [courseId, setCourseId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Assign a course" width={540}><div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
      <Field label="Course"><Select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">Choose…</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
      <Field label="People"><div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 13 }}>{emps.data?.map((p) => <label key={p.id} style={{ display: 'block', padding: '2px 0' }}><input type="checkbox" checked={picked.includes(p.id)} onChange={() => setPicked(picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])} /> {p.firstName} {p.lastName} ({p.employeeNo})</label>)}</div></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !courseId || !picked.length} onClick={() => run(async () => { await api.post('/admin/pwm/learning/enrolments', { courseId, employeeIds: picked }); onDone(); })}>Assign {picked.length || ''}</Btn></div>
    </div></Modal>
  );
}

function Compliance({ manage }: { manage: boolean }) {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { courseId: string; course: string; recurrenceMonths: number | null; total: number; compliant: number; overdue: { id: string; name: string; employeeNo: string; lastDone: string | null }[] }[] }>('/admin/pwm/learning/compliance').then((r) => r.data), []);
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  if (loading && !data) return <Empty>Loading…</Empty>;
  return (
    <div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      {!data?.length ? <Empty>No mandatory courses. Mark a course as mandatory to track compliance.</Empty> : data.map((c) => (
        <div key={c.courseId} style={{ marginBottom: 12 }}><Card title={`${c.course}: ${c.compliant} of ${c.total} up to date (${c.total ? Math.round((c.compliant / c.total) * 100) : 0}%)`} right={manage && c.overdue.length > 0 ? <Btn small kind="primary" disabled={busy} onClick={() => run(async () => { const r = await api.post<{ message: string }>(`/admin/pwm/learning/courses/${c.courseId}/assign-mandatory`, {}); setMsg(r.message); reload(); })}>Assign to {c.overdue.length}</Btn> : undefined}>
          {c.overdue.length === 0 ? <div style={{ fontSize: 13 }}>Everyone is up to date.</div> : c.overdue.map((o) => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}><Link href={`/pwm/employees/${o.id}`}>{o.name}</Link><span style={{ opacity: 0.7 }}>{o.lastDone ? `last done ${fmtDate(o.lastDone)}` : 'never done'}</span></div>)}
        </Card></div>
      ))}
    </div>
  );
}

function Budgets({ manage }: { manage: boolean }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, error, reload } = useLoad(() => api.get<{ data: { rows: { departmentId: string | null; name: string; amount: number; committed: number; actual: number; remaining: number }[] } }>(`/admin/pwm/learning/budgets?year=${year}`).then((r) => r.data), [year]);
  const { busy, error: actionError, run } = useAction();
  const set = (departmentId: string | null, current: number) => { const v = window.prompt('Budget for the year (₦)', String(current)); if (v !== null && v !== '') run(async () => { await api.put('/admin/pwm/learning/budgets', { departmentId, year, amount: Number(v) }); reload(); }); };
  return (
    <div>
      <div style={{ maxWidth: 140, marginBottom: 12 }}><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {data && <Table head={['Department', 'Budget', 'Committed', 'Spent', 'Left', '']}>{data.rows.map((r) => <tr key={r.departmentId ?? 'pool'}><Td><b>{r.name}</b></Td><Td>{naira(r.amount)}</Td><Td>{naira(r.committed)}</Td><Td>{naira(r.actual)}</Td><Td><Pill tone={r.amount > 0 && r.remaining < 0 ? 'bad' : 'neutral'}>{naira(r.remaining)}</Pill></Td><Td>{manage && <Btn small disabled={busy} onClick={() => set(r.departmentId, r.amount)}>Set</Btn>}</Td></tr>)}</Table>}
    </div>
  );
}

function Skills({ manage }: { manage: boolean }) {
  const { theme: T } = useTheme();
  const [dept, setDept] = useState('');
  const depts = useLoad(() => api.get<{ data: { id: string; name: string }[] }>('/admin/pwm/departments').then((r) => r.data), []);
  const skills = useLoad(() => api.get<{ data: { id: string; name: string; category: string | null }[] }>('/admin/pwm/skills').then((r) => r.data), []);
  const { data, error, reload } = useLoad(() => api.get<{ data: { skills: { id: string; name: string }[]; rows: { id: string; name: string; jobTitle: string; cells: { skillId: string; level: number | null; required: number | null; gap: number | null }[] }[]; gaps: { name: string; peopleWithGap: number }[] } }>(`/admin/pwm/skills/matrix${dept ? `?departmentId=${dept}` : ''}`).then((r) => r.data), [dept]);
  const [newSkill, setNewSkill] = useState('');
  const { busy, error: actionError, run } = useAction();
  const assess = (employeeId: string, skillId: string, current: number | null) => { const v = window.prompt('Level 1 (basic) to 5 (expert)', String(current ?? '')); if (v) run(async () => { await api.post('/admin/pwm/skills/assess', { employeeId, skillId, level: Number(v) }); reload(); }); };
  const require = (jobTitle: string, skillId: string) => { const v = window.prompt(`Level a "${jobTitle}" needs (0 removes the requirement)`, '3'); if (v !== null) run(async () => { await api.put('/admin/pwm/skills/requirements', { jobTitle, skillId, requiredLevel: Number(v) }); reload(); skills.reload(); }); };
  const cell = (c: { level: number | null; required: number | null; gap: number | null }) => ({ background: c.gap ? (c.gap >= 2 ? T.errorBg : T.warningBg) : c.level ? T.successBg : T.surface2, color: c.gap ? (c.gap >= 2 ? T.error : T.warning) : c.level ? T.success : T.textMuted });
  return (
    <div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} style={{ maxWidth: 240 }}><option value="">All departments</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        {manage && <><Input placeholder="New skill" value={newSkill} onChange={(e) => setNewSkill(e.target.value)} style={{ maxWidth: 200 }} /><Btn disabled={busy || !newSkill.trim()} onClick={() => run(async () => { await api.post('/admin/pwm/skills', { name: newSkill }); setNewSkill(''); reload(); skills.reload(); })}>Add skill</Btn></>}
      </div>
      {!data?.skills.length ? <Empty>Add skills, then assess people and set what each job title needs.</Empty> : (
        <>
          <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', fontSize: 12 }}><thead><tr><th style={{ textAlign: 'left', padding: 6 }}>Employee</th>{data.skills.map((s) => <th key={s.id} style={{ padding: 6, whiteSpace: 'nowrap' }}>{s.name}</th>)}</tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.id}><td style={{ padding: 6, whiteSpace: 'nowrap' }}><Link href={`/pwm/employees/${r.id}`} style={{ fontWeight: 700 }}>{r.name}</Link><div style={{ fontSize: 10, opacity: 0.7 }}>{r.jobTitle}</div></td>{r.cells.map((c) => <td key={c.skillId} style={{ padding: 2 }}><button onClick={() => assess(r.id, c.skillId, c.level)} onContextMenu={(e) => { e.preventDefault(); if (manage) require(r.jobTitle, c.skillId); }} title="Click to assess. Right-click to set what this job title needs." style={{ all: 'unset', cursor: 'pointer', display: 'block', minWidth: 52, textAlign: 'center', padding: '6px 4px', borderRadius: 4, fontWeight: 700, ...cell(c) }}>{c.level ?? '·'}{c.required ? `/${c.required}` : ''}</button></td>)}</tr>)}</tbody></table></div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>Each cell is current level / level the job title needs. Red: two or more levels short. Amber: one short. Green: meets it.</div>
          {data.gaps.some((g) => g.peopleWithGap > 0) && <div style={{ marginTop: 10, fontSize: 13 }}><b>Gaps:</b> {data.gaps.filter((g) => g.peopleWithGap > 0).map((g) => `${g.name} (${g.peopleWithGap} people)`).join(', ')}</div>}
        </>
      )}
      <span style={{ display: 'none' }}>{skills.data?.length}</span>
    </div>
  );
}

