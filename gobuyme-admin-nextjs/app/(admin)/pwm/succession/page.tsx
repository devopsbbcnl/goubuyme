'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Stat, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface Pos { id: string; jobTitle: string; department: string | null; criticality: string; notes: string | null; risk: string; incumbent: { id: string; name: string } | null; successors: { id: string; employeeId: string; name: string; currentTitle: string | null; readiness: string; developmentNote: string | null }[] }
interface Data { positions: Pos[]; summary: { exposed: number; thin: number; covered: number } }
const READY: Record<string, string> = { READY_NOW: 'Ready now', ONE_TO_TWO_YEARS: '1 to 2 years', THREE_PLUS_YEARS: '3 or more years' };
const riskTone = (r: string) => (r === 'COVERED' ? 'good' : r === 'THIN' ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';

export default function SuccessionPage() {
  const { me } = usePwm();
  const manage = !!me?.can.manageSuccession;
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>('/admin/pwm/succession').then((r) => r.data), []);
  const emps = useLoad(() => (manage ? api.get<{ data: { id: string; firstName: string; lastName: string; employeeNo: string }[] }>('/admin/pwm/employees/lookup').then((r) => r.data) : Promise.resolve([])), [manage]);
  const depts = useLoad(() => (manage ? api.get<{ data: { id: string; name: string }[] }>('/admin/pwm/departments').then((r) => r.data) : Promise.resolve([])), [manage]);
  const [p, setP] = useState({ jobTitle: '', departmentId: '', incumbentId: '', criticality: 'MEDIUM' });
  const [s, setS] = useState<Record<string, { employeeId: string; readiness: string }>>({});
  const { busy, error: actionError, run } = useAction();
  const opts = emps.data?.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeNo})</option>);
  return (
    <div>
      <PageHeader title="Succession planning" sub="Confidential. Who could step into each key role, and how soon. Opening this page is recorded." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}><Stat label="Exposed" value={data.summary.exposed} sub="No ready successor" /><Stat label="Thin" value={data.summary.thin} /><Stat label="Covered" value={data.summary.covered} /></div>}
      {manage && (
        <Card title="Add a key position">
          <Grid cols={4}>
            <Field label="Job title"><Input value={p.jobTitle} onChange={(e) => setP({ ...p, jobTitle: e.target.value })} /></Field>
            <Field label="Department"><Select value={p.departmentId} onChange={(e) => setP({ ...p, departmentId: e.target.value })}><option value="">None</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Current post-holder"><Select value={p.incumbentId} onChange={(e) => setP({ ...p, incumbentId: e.target.value })}><option value="">Vacant</option>{opts}</Select></Field>
            <Field label="Impact if empty"><Select value={p.criticality} onChange={(e) => setP({ ...p, criticality: e.target.value })}>{['HIGH', 'MEDIUM', 'LOW'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </Grid>
          <Btn kind="primary" disabled={busy || !p.jobTitle} onClick={() => run(async () => { await api.post('/admin/pwm/succession', { ...p, departmentId: p.departmentId || undefined, incumbentId: p.incumbentId || undefined }); setP({ jobTitle: '', departmentId: '', incumbentId: '', criticality: 'MEDIUM' }); reload(); })}>Add</Btn>
        </Card>
      )}
      <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        {loading && !data ? <Empty>Loading…</Empty> : !data?.positions.length ? <Empty>No key positions yet.</Empty> : data.positions.map((x) => (
          <Card key={x.id} title={`${x.jobTitle}${x.department ? ` · ${x.department}` : ''}`} right={<span style={{ display: 'flex', gap: 6 }}><Pill tone={x.criticality === 'HIGH' ? 'bad' : 'neutral'}>{x.criticality.toLowerCase()} impact</Pill><Pill tone={riskTone(x.risk)}>{x.risk.toLowerCase()}</Pill></span>}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>In post: <b>{x.incumbent?.name ?? 'Vacant'}</b></div>
            {x.successors.length === 0 ? <div style={{ fontSize: 13, opacity: 0.75 }}>Nobody named as a successor.</div> : x.successors.map((y) => (
              <div key={y.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 13 }}>
                <span><b>{y.name}</b>{y.currentTitle && ` (${y.currentTitle})`} · {READY[y.readiness]}</span>
                {manage && <Btn small disabled={busy} onClick={() => run(async () => { await api.del(`/admin/pwm/succession/successors/${y.id}`); reload(); })}>Remove</Btn>}
              </div>
            ))}
            {manage && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Select value={s[x.id]?.employeeId ?? ''} onChange={(e) => setS({ ...s, [x.id]: { ...(s[x.id] ?? { readiness: 'ONE_TO_TWO_YEARS' }), employeeId: e.target.value } })} style={{ maxWidth: 240 }}><option value="">Add successor…</option>{opts}</Select>
                <Select value={s[x.id]?.readiness ?? 'ONE_TO_TWO_YEARS'} onChange={(e) => setS({ ...s, [x.id]: { ...(s[x.id] ?? { employeeId: '' }), readiness: e.target.value } })} style={{ maxWidth: 180 }}>{Object.entries(READY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <Btn small disabled={busy || !s[x.id]?.employeeId} onClick={() => run(async () => { await api.post(`/admin/pwm/succession/${x.id}/successors`, s[x.id]); setS({ ...s, [x.id]: { employeeId: '', readiness: 'ONE_TO_TWO_YEARS' } }); reload(); })}>Add</Btn>
                <Btn small kind="danger" disabled={busy} onClick={() => run(async () => { await api.del(`/admin/pwm/succession/${x.id}`); reload(); })}>Remove position</Btn>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
