'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Table, Tabs, Td, TextArea, fmtDate, label, todayYmd, useAction, useLoad, usePwm } from '@/components/pwm/ui';

type Tab = 'requests' | 'balances' | 'policy' | 'yearend' | 'report';
interface Req { id: string; status: string; type: string; startDate: string; endDate: string; days: number; reason: string | null; waitingOn: string | null; employee: { id: string; employeeNo: string; firstName: string; lastName: string; department: { name: string } | null }; approvals: { step: number; role: string; approverName: string | null; decision: string | null; actedByName: string | null }[] }
interface Type { id: string; key: string; name: string; annualDays: number; accrual: string; carryOverCap: number; maxConsecutiveDays: number | null; allowHalfDay: boolean; paid: boolean; approvalChain: string[]; setsOnLeaveStatus: boolean; countsWeekends: boolean; active: boolean; afterProbationOnly: boolean; docAfterDays: number | null; allowNegative: boolean }
interface Bal { year: number; types: { id: string; name: string }[]; employees: { id: string; employeeNo: string; name: string; department: string | null; balances: { typeId: string; available: number; used: number; entitled: number }[] }[] }

export default function LeavePage() {
  const { me } = usePwm();
  const [tab, setTab] = useState<Tab>('requests');
  return (
    <div>
      <PageHeader title="Leave" sub="Requests, balances and the leave policy. Employees ask in My HR; the right people approve in turn." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'requests', label: 'Requests' }, { id: 'balances', label: 'Balances' }, { id: 'report', label: 'Report' }, ...(me?.can.configureLeave ? [{ id: 'policy' as Tab, label: 'Policy and holidays' }, { id: 'yearend' as Tab, label: 'Year-end' }] : [])]} />
      {tab === 'requests' && <Requests />}{tab === 'balances' && <Balances />}{tab === 'report' && <Report />}{tab === 'policy' && <Policy />}{tab === 'yearend' && <YearEnd />}
    </div>
  );
}

function Requests() {
  const { me } = usePwm();
  const [status, setStatus] = useState('PENDING');
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Req[] }>(`/admin/pwm/leave/requests${status ? `?status=${status}` : ''}`).then((r) => r.data), [status]);
  const [dlg, setDlg] = useState<{ id: string; approve: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const { busy, error: actionError, run } = useAction();
  const decide = () => run(async () => { if (!dlg) return; await api.post(`/admin/pwm/leave/requests/${dlg.id}/decide`, { approve: dlg.approve, note }); setDlg(null); setNote(''); reload(); });
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 200 }}><option value="PENDING">Waiting</option><option value="APPROVED">Approved</option><option value="REJECTED">Declined</option><option value="CANCELLED">Cancelled</option><option value="">All</option></Select>
        {me?.can.manageLeave && <Btn kind="primary" onClick={() => setAdding(true)}>+ Record leave for someone</Btn>}
      </div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No requests.</Empty> : (
        <Table head={['Employee', 'Leave', 'Dates', 'Days', 'Status', '']}>
          {data.map((r) => (
            <tr key={r.id}>
              <Td><b>{r.employee.firstName} {r.employee.lastName}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{r.employee.department?.name ?? ''}</div></Td><Td>{r.type}{r.reason && <div style={{ fontSize: 11, opacity: 0.7 }}>{r.reason}</div>}</Td>
              <Td>{fmtDate(r.startDate)} to {fmtDate(r.endDate)}</Td><Td>{r.days}</Td>
              <Td><Pill tone={r.status === 'APPROVED' ? 'good' : r.status === 'PENDING' ? 'warn' : r.status === 'REJECTED' ? 'bad' : 'neutral'}>{label(r.status)}</Pill>{r.waitingOn && <div style={{ fontSize: 11 }}>waiting on {label(r.waitingOn)}</div>}<div style={{ fontSize: 10, opacity: 0.7 }}>{r.approvals.map((a) => `${label(a.role)}${a.decision ? ` ✓ ${a.actedByName ?? ''}` : ''}`).join(' → ')}</div></Td>
              <Td><div style={{ display: 'flex', gap: 6 }}>{r.status === 'PENDING' && <><Btn small kind="primary" onClick={() => setDlg({ id: r.id, approve: true })}>Approve</Btn><Btn small kind="danger" onClick={() => setDlg({ id: r.id, approve: false })}>Decline</Btn></>}{me?.can.manageLeave && ['PENDING', 'APPROVED'].includes(r.status) && <Btn small onClick={() => { const reason = window.prompt('Reason for cancelling'); if (reason) run(async () => { await api.post(`/admin/pwm/leave/requests/${r.id}/cancel`, { reason }); reload(); }); }}>Cancel</Btn>}</div></Td>
            </tr>
          ))}
        </Table>
      )}
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>You can decide a request when it is at the HR step, or when you are its named approver. Nobody can decide their own.</div>
      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.approve ? 'Approve' : 'Decline'} width={440}><div style={{ padding: 20 }}><Field label={dlg?.approve ? 'Comment (optional)' : 'Reason (required)'}><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn kind={dlg?.approve ? 'primary' : 'danger'} disabled={busy || (!dlg?.approve && !note.trim())} onClick={decide}>Confirm</Btn></div></div></Modal>
      {adding && <OnBehalf onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function OnBehalf({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const emps = useLoad(() => api.get<{ data: { id: string; firstName: string; lastName: string; employeeNo: string }[] }>('/admin/pwm/employees/lookup').then((r) => r.data), []);
  const types = useLoad(() => api.get<{ data: Type[] }>('/admin/pwm/leave/types').then((r) => r.data.filter((t) => t.active)), []);
  const [f, setF] = useState({ employeeId: '', typeId: '', start: todayYmd(), end: todayYmd(), reason: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Record leave for an employee" width={520}>
      <div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
        <Field label="Employee"><Select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}><option value="">Choose…</option>{emps.data?.map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName} ({x.employeeNo})</option>)}</Select></Field>
        <Grid><Field label="Type"><Select value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}><option value="">Choose…</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field><Field label="From"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field><Field label="To"><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field></Grid>
        <Field label="Reason"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.employeeId || !f.typeId} onClick={() => run(async () => { await api.post('/admin/pwm/leave/requests', f); onDone(); })}>Submit</Btn></div>
      </div>
    </Modal>
  );
}

function Balances() {
  const { me } = usePwm();
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Bal }>(`/admin/pwm/leave/balances?year=${year}`).then((r) => r.data), [year]);
  const [adj, setAdj] = useState<{ employeeId: string; typeId: string; name: string } | null>(null);
  const [f, setF] = useState({ delta: '', reason: '' });
  const { busy, error: actionError, run } = useAction();
  return (
    <div>
      <div style={{ maxWidth: 140, marginBottom: 12 }}><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.employees.length ? <Empty>No employees.</Empty> : (
        <Table head={['Employee', ...data.types.map((t) => t.name)]}>
          {data.employees.map((e) => <tr key={e.id}><Td><b>{e.name}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{e.department ?? e.employeeNo}</div></Td>{e.balances.map((b) => <Td key={b.typeId} style={{ whiteSpace: 'nowrap' }}>{b.entitled === 0 && b.used === 0 ? '—' : <><b>{b.available}</b> <span style={{ opacity: 0.6, fontSize: 11 }}>left</span> {me?.can.manageLeave && <button onClick={() => setAdj({ employeeId: e.id, typeId: b.typeId, name: e.name })} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: '#FF521B' }}>adjust</button>}</>}</Td>)}</tr>)}
        </Table>
      )}
      <Modal open={!!adj} onClose={() => setAdj(null)} title={`Adjust balance: ${adj?.name ?? ''}`} width={440}><div style={{ padding: 20 }}>
        <Notice kind="info">Use a positive number to add days and a negative number to remove them. The reason is kept in the history.</Notice>
        <Grid><Field label="Days (+/-)"><Input type="number" step="0.5" value={f.delta} onChange={(e) => setF({ ...f, delta: e.target.value })} /></Field></Grid>
        <Field label="Reason"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setAdj(null)}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.delta || !f.reason} onClick={() => run(async () => { if (!adj) return; await api.post('/admin/pwm/leave/adjust', { ...adj, year, delta: Number(f.delta), reason: f.reason }); setAdj(null); setF({ delta: '', reason: '' }); reload(); })}>Save</Btn></div>
      </div></Modal>
    </div>
  );
}

function Report() {
  const { theme: T } = useTheme();
  const { data } = useLoad(() => api.get<{ data: { year: number; totalDays: number; requests: number; byType: { name: string; days: number }[]; byDepartment: { name: string; days: number }[] } }>('/admin/pwm/leave/report').then((r) => r.data), []);
  if (!data) return <Empty>Loading…</Empty>;
  const list = (rows: { name: string; days: number }[]) => rows.length ? rows.map((r) => <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text }}><span>{r.name}</span><b>{r.days} days</b></div>) : <Empty>No approved leave.</Empty>;
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}><Card title={`${data.year}: ${data.totalDays} days across ${data.requests} requests, by type`}>{list(data.byType)}</Card><Card title="By department">{list(data.byDepartment)}</Card></div>;
}

function Policy() {
  const types = useLoad(() => api.get<{ data: Type[] }>('/admin/pwm/leave/types').then((r) => r.data), []);
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const hol = useLoad(() => api.get<{ data: { id: string; date: string; name: string }[] }>(`/admin/pwm/holidays?year=${year}`).then((r) => r.data), [year]);
  const [edit, setEdit] = useState<Type | null>(null);
  const [h, setH] = useState({ date: '', name: '' });
  const [msg, setMsg] = useState('');
  const { busy, error, run } = useAction();
  return (
    <div>
      {error && <Notice kind="error">{error}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <Notice kind="warn">The default entitlements are placeholders. Have legal counsel check them against the Labour Act before go-live.</Notice>
      <div style={{ marginBottom: 10 }}>{!types.data?.length && <Btn kind="primary" disabled={busy} onClick={() => run(async () => { const r = await api.post<{ message: string }>('/admin/pwm/leave/types/seed', {}); setMsg(r.message); types.reload(); })}>Add the default leave types</Btn>}</div>
      {types.data && types.data.length > 0 && (
        <Table head={['Type', 'Days / year', 'Accrual', 'Carry-over', 'Approval', 'Rules', '']}>
          {types.data.map((t) => <tr key={t.id} style={{ opacity: t.active ? 1 : 0.5 }}><Td><b>{t.name}</b></Td><Td>{t.annualDays}</Td><Td>{label(t.accrual)}</Td><Td>{t.carryOverCap ? `up to ${t.carryOverCap}` : 'none'}</Td><Td style={{ fontSize: 12 }}>{t.approvalChain.map(label).join(' → ')}</Td>
            <Td style={{ fontSize: 11 }}>{[t.paid ? 'paid' : 'unpaid', t.allowHalfDay && 'half days', t.maxConsecutiveDays && `max ${t.maxConsecutiveDays} days`, t.docAfterDays !== null && `document after ${t.docAfterDays}`, t.setsOnLeaveStatus && 'sets On leave', t.afterProbationOnly && 'after probation', t.countsWeekends && 'calendar days'].filter(Boolean).join(', ')}</Td><Td><Btn small onClick={() => setEdit(t)}>Edit</Btn></Td></tr>)}
        </Table>
      )}
      <div style={{ marginTop: 16 }}><Card title="Public holidays" right={<div style={{ display: 'flex', gap: 6 }}><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 90 }} /><Btn small disabled={busy} onClick={() => run(async () => { const r = await api.post<{ message: string }>('/admin/pwm/holidays/seed', { year }); setMsg(r.message); hol.reload(); })}>Add fixed-date holidays</Btn></div>}>
        {!hol.data?.length ? <Empty>None for {year}. Add Good Friday, Easter Monday and the Eid holidays once announced.</Empty> : hol.data.map((x) => <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}><span>{fmtDate(x.date)} · {x.name}</span><Btn small onClick={() => run(async () => { await api.post(`/admin/pwm/holidays/${x.id}/delete`, {}); hol.reload(); })}>Remove</Btn></div>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><Input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /><Input placeholder="Name" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} /><Btn disabled={busy || !h.date || !h.name} onClick={() => run(async () => { await api.post('/admin/pwm/holidays', h); setH({ date: '', name: '' }); hol.reload(); })}>Add</Btn></div>
      </Card></div>
      {edit && <EditType t={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); types.reload(); }} />}
    </div>
  );
}

function EditType({ t, onClose, onSaved }: { t: Type; onClose: () => void; onSaved: () => void }) {
  type TypeForm = Omit<Type, 'maxConsecutiveDays' | 'docAfterDays'> & { maxConsecutiveDays: number | ''; docAfterDays: number | '' };
  const [f, setF] = useState<TypeForm>({ ...t, maxConsecutiveDays: t.maxConsecutiveDays ?? '', docAfterDays: t.docAfterDays ?? '' });
  const { busy, error, run } = useAction();
  const chain = ['SUPERVISOR', 'DEPT_HEAD', 'HR'];
  const flag = (k: keyof TypeForm, text: string) => <label style={{ display: 'flex', gap: 6, fontSize: 13 }}><input type="checkbox" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{text}</label>;
  return (
    <Modal open onClose={onClose} title={`Edit ${t.name}`} width={620}>
      <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>{error && <Notice kind="error">{error}</Notice>}
        <Grid cols={3}><Field label="Days per year"><Input type="number" value={f.annualDays} onChange={(e) => setF({ ...f, annualDays: Number(e.target.value) })} /></Field><Field label="Accrual"><Select value={f.accrual} onChange={(e) => setF({ ...f, accrual: e.target.value })}><option value="UPFRONT">Whole year upfront</option><option value="MONTHLY">Monthly</option></Select></Field>
          <Field label="Carry over up to (days)"><Input type="number" value={f.carryOverCap} onChange={(e) => setF({ ...f, carryOverCap: Number(e.target.value) })} /></Field><Field label="Max days at a time"><Input type="number" value={f.maxConsecutiveDays} onChange={(e) => setF({ ...f, maxConsecutiveDays: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
          <Field label="Document needed after (days)"><Input type="number" value={f.docAfterDays} onChange={(e) => setF({ ...f, docAfterDays: e.target.value === '' ? '' : Number(e.target.value) })} /></Field></Grid>
        <Field label="Approval steps, in order"><div style={{ display: 'flex', gap: 12 }}>{chain.map((c) => <label key={c} style={{ fontSize: 13 }}><input type="checkbox" checked={f.approvalChain.includes(c)} onChange={() => setF({ ...f, approvalChain: f.approvalChain.includes(c) ? f.approvalChain.filter((x) => x !== c) : chain.filter((x) => x === c || f.approvalChain.includes(x)) })} /> {label(c)}</label>)}</div></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>{flag('paid', 'Paid')}{flag('allowHalfDay', 'Half days allowed')}{flag('allowNegative', 'Balance may go negative')}{flag('afterProbationOnly', 'Only after probation')}{flag('setsOnLeaveStatus', 'Sets employee status to On leave')}{flag('countsWeekends', 'Count calendar days')}{flag('active', 'In use')}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.patch(`/admin/pwm/leave/types/${t.id}`, { ...f, maxConsecutiveDays: f.maxConsecutiveDays === '' ? null : f.maxConsecutiveDays, docAfterDays: f.docAfterDays === '' ? null : f.docAfterDays }); onSaved(); })}>Save</Btn></div>
      </div>
    </Modal>
  );
}

function YearEnd() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<{ employee: string; type: string; remaining: number; carried: number; forfeited: number }[] | null>(null);
  const [msg, setMsg] = useState('');
  const { busy, error, run } = useAction();
  const go = (apply: boolean) => run(async () => { const r = await api.post<{ message: string; data: { rows: typeof rows } }>('/admin/pwm/leave/year-end', { year, apply }); setRows(r.data.rows); setMsg(r.message); });
  return (
    <div>
      {error && <Notice kind="error">{error}</Notice>}{msg && <Notice kind="info">{msg}</Notice>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 12 }}><Field label="Year that is ending"><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field><Btn disabled={busy} onClick={() => go(false)}>Preview</Btn><Btn kind="primary" disabled={busy || !rows} onClick={() => window.confirm(`Apply carry-over from ${year} into ${year + 1}?`) && go(true)}>Apply</Btn></div>
      {rows && (rows.length === 0 ? <Empty>Nothing to carry over.</Empty> : <Table head={['Employee', 'Leave', 'Left over', 'Carried', 'Forfeited']}>{rows.map((r, i) => <tr key={i}><Td>{r.employee}</Td><Td>{r.type}</Td><Td>{r.remaining}</Td><Td><b>{r.carried}</b></Td><Td>{r.forfeited}</Td></tr>)}</Table>)}
    </div>
  );
}
