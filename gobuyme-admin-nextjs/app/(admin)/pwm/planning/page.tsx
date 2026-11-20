'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Stat, Table, Td, TextArea, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface Row { id: string; department: string; departmentId: string; jobTitle: string; planned: number; actual: number; openVacancies: number; gap: number; toRecruit: number; state: string; status: string; notes: string | null; decisionNote: string | null }
interface Data { year: number; departments: { id: string; name: string }[]; rows: Row[]; totals: { planned: number; actual: number; short: number; toRecruit: number; pendingApproval: number } }
const tone = (s: string) => (s === 'APPROVED' ? 'good' : s === 'SUBMITTED' ? 'warn' : s === 'REJECTED' ? 'bad' : 'neutral') as 'good' | 'warn' | 'bad' | 'neutral';

export default function PlanningPage() {
  const { me } = usePwm();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>(`/admin/pwm/planning?year=${year}`).then((r) => r.data), [year]);
  const [f, setF] = useState({ departmentId: '', jobTitle: '', planned: '', notes: '' });
  const [note, setNote] = useState('');
  const { busy, error: actionError, run } = useAction();
  const manage = !!me?.can.managePlanning;
  const approve = !!me?.can.approvePlanning;
  const drafts = data?.rows.filter((r) => r.status === 'DRAFT').length ?? 0;
  const thisYear = new Date().getFullYear();
  return (
    <div>
      <PageHeader title="Workforce planning" sub="How many people each role should have this year, compared with who is in post and what is being recruited. Only approved lines count in the totals." actions={<Select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ maxWidth: 110 }}>{[-1, 0, 1, 2].map((d) => <option key={d} value={thisYear + d}>{thisYear + d}</option>)}</Select>} />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}><Stat label="Planned (approved)" value={data.totals.planned} /><Stat label="In post" value={data.totals.actual} /><Stat label="Roles short of plan" value={data.totals.short} /><Stat label="Still to recruit" value={data.totals.toRecruit} sub="After open vacancies" /><Stat label="Waiting approval" value={data.totals.pendingApproval} /></div>}
      {manage && (
        <Card title="Add or change a plan line">
          <Grid cols={4}>
            <Field label="Department"><Select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">Choose…</option>{data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Job title" hint="Match the title used on employee records"><Input value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></Field>
            <Field label="Planned headcount"><Input type="number" min={0} value={f.planned} onChange={(e) => setF({ ...f, planned: e.target.value })} /></Field>
            <Field label="Note"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </Grid>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn kind="primary" disabled={busy || !f.departmentId || !f.jobTitle || f.planned === ''} onClick={() => run(async () => { await api.put('/admin/pwm/planning', { year, ...f, planned: Number(f.planned) }); setF({ departmentId: f.departmentId, jobTitle: '', planned: '', notes: '' }); reload(); })}>Save line</Btn>
            <Btn disabled={busy || !drafts} onClick={() => run(async () => { await api.post('/admin/pwm/planning/submit', { year }); reload(); })}>Send {drafts} draft line{drafts === 1 ? '' : 's'} for approval</Btn>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Changing a line returns it to draft. The person who prepared a line cannot approve it.</div>
        </Card>
      )}
      {approve && !!data?.totals.pendingApproval && (
        <div style={{ marginTop: 14 }}>
          <Card title="Decision">
            <Field label="Comment (needed to send back)"><TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.post('/admin/pwm/planning/decide', { year, approve: true, note }); setNote(''); reload(); })}>Approve plan</Btn>
              <Btn kind="danger" disabled={busy || !note.trim()} onClick={() => run(async () => { await api.post('/admin/pwm/planning/decide', { year, approve: false, note }); setNote(''); reload(); })}>Send back</Btn>
            </div>
          </Card>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        {loading && !data ? <Empty>Loading…</Empty> : !data?.rows.length ? <Empty>No plan for {year} yet.</Empty> : (
          <Table head={['Department', 'Role', 'Planned', 'In post', 'Hiring', 'Gap', 'Status', '']}>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <Td>{r.department}</Td>
                <Td>{r.jobTitle}{r.notes && <div style={{ fontSize: 11, opacity: 0.7 }}>{r.notes}</div>}</Td>
                <Td>{r.planned}</Td><Td>{r.actual}</Td><Td>{r.openVacancies}</Td>
                <Td>{r.state === 'ON_PLAN' ? <Pill tone="good">On plan</Pill> : r.state === 'SHORT' ? <Pill tone="warn">{r.gap} short{r.toRecruit ? `, ${r.toRecruit} to recruit` : ''}</Pill> : <Pill tone="info">{-r.gap} over</Pill>}</Td>
                <Td><Pill tone={tone(r.status)}>{label(r.status)}</Pill>{r.decisionNote && <div style={{ fontSize: 11 }}>{r.decisionNote}</div>}</Td>
                <Td>{manage && ['DRAFT', 'REJECTED'].includes(r.status) && <Btn small disabled={busy} onClick={() => run(async () => { await api.del(`/admin/pwm/planning/${r.id}`); reload(); })}>Remove</Btn>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}
