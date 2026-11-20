'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Stat, Table, Td, TextArea, fmtDate, fmtDateTime, label, useAction, useDebounced, useLoad, usePwm } from '@/components/pwm/ui';

interface A { id: string; tag: string; category: string; name: string; serial: string | null; status: string; condition: string; cost: number | null; location: string | null; holder: { id: string; name: string; acknowledged: boolean } | null }
interface Detail extends A { supplier: string | null; warrantyExpiry: string | null; expiries: { label: string; date: string }[] | null; seats: number | null; notes: string | null;
  assignments: { id: string; status: string; assignedAt: string; returnedAt: string | null; conditionOut: string | null; conditionIn: string | null; acknowledgedAt: string | null; resolutionNote: string | null; employee: { id: string; name: string }; assignedByName: string | null }[];
  events: { id: string; kind: string; note: string; cost: number | null; recovery: string | null; byName: string | null; createdAt: string }[] }
const CATS = ['LAPTOP', 'PHONE', 'ID_CARD', 'ACCESS_CARD', 'EQUIPMENT', 'VEHICLE', 'SOFTWARE', 'OTHER'];
const tone = (s: string) => (s === 'IN_STOCK' ? 'good' : s === 'ASSIGNED' ? 'info' : s === 'IN_REPAIR' ? 'warn' : s === 'LOST' ? 'bad' : 'neutral') as 'good' | 'info' | 'warn' | 'bad' | 'neutral';

export default function AssetsPage() {
  const { me } = usePwm();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { summary: Record<string, number>; assets: A[] } }>(`/admin/pwm/assets?${status ? `status=${status}&` : ''}${dq ? `q=${encodeURIComponent(dq)}` : ''}`).then((r) => r.data), [status, dq]);
  const exp = useLoad(() => api.get<{ data: { assetId: string; tag: string; name: string; label: string; date: string }[] }>('/admin/pwm/assets/expiring').then((r) => r.data).catch(() => []), []);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const manage = !!me?.can.manageAssets;
  return (
    <div>
      <PageHeader title="Assets" sub="Laptops, phones, cards, vehicles and licences: where each one is, who has it, and its history." actions={manage ? <Btn kind="primary" onClick={() => setAdding(true)}>+ Asset</Btn> : undefined} />
      {error && <Notice kind="error">{error}</Notice>}
      {data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 14 }}>{['IN_STOCK', 'ASSIGNED', 'IN_REPAIR', 'LOST', 'RETIRED'].map((s) => <Stat key={s} label={label(s)} value={data.summary[s] ?? 0} />)}</div>}
      {exp.data && exp.data.length > 0 && <Notice kind="warn">{exp.data.length} warranty, insurance or licence date{exp.data.length === 1 ? '' : 's'} due within 60 days: {exp.data.slice(0, 4).map((x) => `${x.name} ${x.label.toLowerCase()} ${fmtDate(x.date)}`).join('; ')}{exp.data.length > 4 ? '…' : ''}</Notice>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}><Input placeholder="Search tag, name, serial" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} /><Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 180 }}><option value="">All statuses</option>{['IN_STOCK', 'ASSIGNED', 'IN_REPAIR', 'LOST', 'RETIRED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
      {loading && !data ? <Empty>Loading…</Empty> : !data?.assets.length ? <Empty>No assets match.</Empty> : (
        <Table head={['Tag', 'Asset', 'Category', 'Status', 'Held by', '']}>
          {data.assets.map((a) => <tr key={a.id}><Td><b>{a.tag}</b></Td><Td>{a.name}{a.serial && <div style={{ fontSize: 11, opacity: 0.7 }}>{a.serial}</div>}</Td><Td>{label(a.category)}</Td><Td><Pill tone={tone(a.status)}>{label(a.status)}</Pill></Td><Td>{a.holder ? <>{a.holder.name} {!a.holder.acknowledged && <Pill tone="warn">Not acknowledged</Pill>}</> : '—'}</Td><Td><Btn small onClick={() => setOpen(a.id)}>Open</Btn></Td></tr>)}
        </Table>
      )}
      {adding && <AddAsset onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {open && <AssetDrawer id={open} manage={manage} onClose={() => setOpen(null)} onChanged={reload} />}
      <span style={{ display: 'none' }}>{fmtDateTime('')}</span>
    </div>
  );
}

function AddAsset({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ category: 'LAPTOP', name: '', tag: '', serial: '', cost: '', supplier: '', warrantyExpiry: '', location: '', insurance: '', roadworthy: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Add an asset" width={600}><div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
      <Grid><Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field><Field label="Make and model"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Tag" hint="Blank = generated"><Input value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} /></Field><Field label="Serial / IMEI"><Input value={f.serial} onChange={(e) => setF({ ...f, serial: e.target.value })} /></Field><Field label="Cost (₦)"><Input type="number" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field><Field label="Supplier"><Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field><Field label="Warranty ends"><Input type="date" value={f.warrantyExpiry} onChange={(e) => setF({ ...f, warrantyExpiry: e.target.value })} /></Field><Field label="Location"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        {f.category === 'VEHICLE' && <><Field label="Insurance expires"><Input type="date" value={f.insurance} onChange={(e) => setF({ ...f, insurance: e.target.value })} /></Field><Field label="Roadworthiness expires"><Input type="date" value={f.roadworthy} onChange={(e) => setF({ ...f, roadworthy: e.target.value })} /></Field></>}</Grid>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name} onClick={() => run(async () => { await api.post('/admin/pwm/assets', { category: f.category, name: f.name, tag: f.tag || undefined, serial: f.serial, cost: f.cost || null, supplier: f.supplier, warrantyExpiry: f.warrantyExpiry || null, location: f.location, expiries: [f.insurance && { label: 'Insurance', date: f.insurance }, f.roadworthy && { label: 'Roadworthiness', date: f.roadworthy }].filter(Boolean) }); onDone(); })}>Add</Btn></div>
    </div></Modal>
  );
}

function AssetDrawer({ id, manage, onClose, onChanged }: { id: string; manage: boolean; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Detail }>(`/admin/pwm/assets/${id}`).then((r) => r.data), [id]);
  const emps = useLoad(() => (manage ? api.get<{ data: { id: string; firstName: string; lastName: string; employeeNo: string }[] }>('/admin/pwm/employees/lookup').then((r) => r.data) : Promise.resolve([])), []);
  const [emp, setEmp] = useState('');
  const [ev, setEv] = useState({ kind: 'MAINTENANCE', note: '', cost: '' });
  const [cond, setCond] = useState('GOOD');
  const { busy, error: actionError, run } = useAction();
  const done = () => { reload(); onChanged(); };
  const active = data?.assignments.find((x) => x.status === 'ACTIVE');
  return (
    <Modal open onClose={onClose} title={data ? `${data.tag}: ${data.name}` : 'Asset'} width={760}>
      <div style={{ padding: 20, maxHeight: '78vh', overflowY: 'auto' }}>
        {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
        {loading && !data ? <Empty>Loading…</Empty> : data && (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 10 }}><Pill tone={tone(data.status)}>{label(data.status)}</Pill> · {label(data.category)} · condition {data.condition.toLowerCase()}{data.serial ? ` · ${data.serial}` : ''}{data.supplier ? ` · ${data.supplier}` : ''}{data.warrantyExpiry ? ` · warranty ${fmtDate(data.warrantyExpiry)}` : ''}{data.expiries?.map((x) => ` · ${x.label} ${fmtDate(x.date)}`)}</div>
            {manage && data.status === 'IN_STOCK' && <Card title="Assign"><Grid><Field label="To"><Select value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Choose…</option>{emps.data?.map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName} ({x.employeeNo})</option>)}</Select></Field><Field label="Condition"><Select value={cond} onChange={(e) => setCond(e.target.value)}>{['NEW', 'GOOD', 'FAIR', 'POOR'].map((c) => <option key={c}>{c}</option>)}</Select></Field></Grid><Btn kind="primary" disabled={busy || !emp} onClick={() => run(async () => { await api.post(`/admin/pwm/assets/${id}/assign`, { employeeId: emp, conditionOut: cond }); done(); })}>Assign and ask them to acknowledge</Btn></Card>}
            {manage && active && (
              <Card title={`With ${active.employee.name}`}>
                <div style={{ fontSize: 12, marginBottom: 8 }}>Since {fmtDate(active.assignedAt)} · {active.acknowledgedAt ? `acknowledged ${fmtDate(active.acknowledgedAt)}` : 'not yet acknowledged'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Select value={cond} onChange={(e) => setCond(e.target.value)} style={{ maxWidth: 130 }}>{['NEW', 'GOOD', 'FAIR', 'POOR'].map((c) => <option key={c}>{c}</option>)}</Select>
                  <Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/pwm/assets/assignments/${active.id}/return`, { conditionIn: cond }); done(); })}>Record return</Btn>
                  <Btn kind="danger" disabled={busy} onClick={() => { const o = window.prompt('Type WRITTEN_OFF or CHARGED'); const n = o ? window.prompt('Reason (recorded)') : null; if (o && n) run(async () => { await api.post(`/admin/pwm/assets/assignments/${active.id}/resolve`, { outcome: o.toUpperCase(), note: n }); done(); }); }}>Write off / charge</Btn>
                </div>
              </Card>
            )}
            <div style={{ marginTop: 10 }}><Card title="Custody history">{data.assignments.length === 0 ? <Empty>Never assigned.</Empty> : data.assignments.map((x) => <div key={x.id} style={{ padding: '6px 0', fontSize: 13, borderBottom: '1px solid rgba(128,128,128,.2)' }}><Link href={`/pwm/employees/${x.employee.id}`} style={{ fontWeight: 700 }}>{x.employee.name}</Link> · {fmtDate(x.assignedAt)}{x.returnedAt ? ` to ${fmtDate(x.returnedAt)}` : ''} <Pill tone={x.status === 'ACTIVE' ? 'info' : 'neutral'}>{label(x.status)}</Pill>{x.resolutionNote && <div style={{ fontSize: 11, opacity: 0.75 }}>{x.resolutionNote}</div>}</div>)}</Card></div>
            <div style={{ marginTop: 10 }}><Card title="Condition and maintenance">
              {data.events.map((e) => <div key={e.id} style={{ padding: '5px 0', fontSize: 13 }}><Pill>{label(e.kind)}</Pill> {e.note}{e.cost ? ` (₦${e.cost.toLocaleString('en-NG')})` : ''}<div style={{ fontSize: 11, opacity: 0.7 }}>{fmtDateTime(e.createdAt)} · {e.byName}</div></div>)}
              {manage && <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}><Select value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value })} style={{ maxWidth: 150 }}>{['MAINTENANCE', 'CONDITION', 'LOST', 'DAMAGED', 'FOUND', 'NOTE'].map((k) => <option key={k} value={k}>{label(k)}</option>)}</Select><Input placeholder="Note" value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} style={{ flex: 1, minWidth: 160 }} /><Input type="number" placeholder="Cost" value={ev.cost} onChange={(e) => setEv({ ...ev, cost: e.target.value })} style={{ maxWidth: 100 }} /><Btn disabled={busy || !ev.note} onClick={() => run(async () => { await api.post(`/admin/pwm/assets/${id}/events`, ev); setEv({ kind: 'MAINTENANCE', note: '', cost: '' }); done(); })}>Add</Btn></div>}
            </Card></div>
            {data.notes && <div style={{ marginTop: 10 }}><TextArea readOnly rows={2} value={data.notes} /></div>}
          </>
        )}
      </div>
    </Modal>
  );
}
