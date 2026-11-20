'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Grid, Input, Notice, PageHeader, PersonSelect, Pill, Select, Stat, Table, Tabs, Td, TextArea, fmtDate, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface C { id: string; reference: string; type: string; category: string; severity: string; stage: string; outcome: string | null; employee: { id: string; name: string; employeeNo: string }; responseDue: string | null; hearingAt: string | null; overdue: boolean }
type Tab = 'cases' | 'report';

export default function CasesPage() {
  const { me } = usePwm();
  const [tab, setTab] = useState<Tab>('cases');
  return (
    <div>
      <PageHeader title="Employee relations" sub="Grievances and disciplinary cases. You see only the cases you are named on; everything you open is logged." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'cases', label: 'My cases' }, ...(me?.can.viewERReports ? [{ id: 'report' as Tab, label: 'Report' }] : [])]} />
      {tab === 'cases' ? <MyCases /> : <Report />}
    </div>
  );
}

function MyCases() {
  const { me } = usePwm();
  const router = useRouter();
  const { data, loading, error } = useLoad(() => api.get<{ data: C[] }>('/admin/pwm/cases').then((r) => r.data), []);
  const [adding, setAdding] = useState(false);
  return (
    <div>
      {me?.can.createCases && <div style={{ marginBottom: 10 }}><Btn kind="primary" onClick={() => setAdding(true)}>+ Open a case</Btn></div>}
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>You are not named on any case.</Empty> : (
        <Table head={['Case', 'Type', 'About', 'Stage', 'Dates', '']}>
          {data.map((c) => <tr key={c.id}><Td><b>{c.reference}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{c.category}</div></Td><Td>{label(c.type)} <Pill tone={c.severity === 'HIGH' ? 'bad' : c.severity === 'MEDIUM' ? 'warn' : 'neutral'}>{label(c.severity)}</Pill></Td><Td>{c.employee.name}</Td><Td><Pill tone={c.stage === 'CLOSED' ? 'neutral' : 'info'}>{label(c.stage)}</Pill>{c.outcome && <div style={{ fontSize: 11 }}>{label(c.outcome)}</div>}{c.overdue && <Pill tone="bad">Response overdue</Pill>}</Td><Td style={{ fontSize: 12 }}>{c.responseDue && <div>Response by {fmtDate(c.responseDue)}</div>}{c.hearingAt && <div>Hearing {fmtDate(c.hearingAt)}</div>}</Td><Td><Link href={`/pwm/cases/${c.id}`} style={{ fontWeight: 700 }}>Open</Link></Td></tr>)}
        </Table>
      )}
      {adding && <NewCase onClose={() => setAdding(false)} onCreated={(id) => router.push(`/pwm/cases/${id}`)} />}
    </div>
  );
}

function NewCase({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const emps = useLoad(() => api.get<{ data: { id: string; firstName: string; lastName: string; employeeNo: string }[] }>('/admin/pwm/employees/lookup').then((r) => r.data), []);
  const [f, setF] = useState({ type: 'DISCIPLINARY', employeeId: '', category: '', severity: 'MEDIUM', summary: '', handler: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Open a case" width={600}><div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
      <Notice kind="info">You become a handler. Only the people you name can see this case. For a grievance, choose the person raising it; for a disciplinary case, the person it is about.</Notice>
      <Grid><Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="DISCIPLINARY">Disciplinary</option><option value="GRIEVANCE">Grievance</option></Select></Field><Field label="Employee"><Select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}><option value="">Choose…</option>{emps.data?.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.employeeNo})</option>)}</Select></Field><Field label="Category"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Timekeeping, conduct…" /></Field><Field label="Severity"><Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></Select></Field><Field label="Second handler (optional)"><PersonSelect value={f.handler} onChange={(v) => setF({ ...f, handler: v })} /></Field></Grid>
      <Field label="Summary"><TextArea rows={4} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.employeeId || !f.category || !f.summary} onClick={() => run(async () => { const r = await api.post<{ data: { id: string } }>('/admin/pwm/cases', { type: f.type, employeeId: f.employeeId, category: f.category, severity: f.severity, summary: f.summary, handlerUserIds: f.handler ? [f.handler] : [] }); onCreated(r.data.id); })}>Open case</Btn></div>
    </div></Modal>
  );
}

function Report() {
  const { data, error } = useLoad(() => api.get<{ data: { total: number; open: number; averageDaysToClose: number | null; byType: { name: string; count: number }[]; byCategory: { name: string; count: number }[]; byOutcome: { name: string; count: number }[]; byDepartment: { name: string; count: number }[] } }>('/admin/pwm/er/report').then((r) => r.data), []);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <Empty>Loading…</Empty>;
  const list = (rows: { name: string; count: number }[]) => rows.length ? rows.map((r) => <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}><span>{label(r.name)}</span><b>{r.count}</b></div>) : <div style={{ fontSize: 12, opacity: 0.7 }}>None</div>;
  return (
    <div>
      <Notice kind="info">Counts only, for the last 12 months. No names or case details. Departments with fewer than five cases are combined.</Notice>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}><Stat label="Cases" value={data.total} /><Stat label="Open" value={data.open} /><Stat label="Average days to close" value={data.averageDaysToClose ?? 'n/a'} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>{([['By type', data.byType], ['By category', data.byCategory], ['By outcome', data.byOutcome], ['By department', data.byDepartment]] as const).map(([t, r]) => <div key={t} style={{ border: '1px solid rgba(128,128,128,.3)', borderRadius: 4, padding: 12 }}><b style={{ fontSize: 12 }}>{t}</b>{list(r as { name: string; count: number }[])}</div>)}</div>
    </div>
  );
}
