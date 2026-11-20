'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Table, Td, TextArea, fmtDate, label, uploadDocument, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface P { id: string; slug: string; title: string; category: string | null; version: number; status: string; requiresAck: boolean; effectiveDate: string | null; publishedAt: string | null; acknowledged: number; audience: number }
interface Acks { policy: { title: string; version: number }; employees: { id: string; employeeNo: string; firstName: string; lastName: string; hasLogin: boolean; acknowledgedAt: string | null; department: { name: string } | null }[] }

export default function PoliciesPage() {
  const { me } = usePwm();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: P[] }>('/admin/pwm/policies').then((r) => r.data), []);
  const [edit, setEdit] = useState<P | 'new' | null>(null);
  const [acks, setAcks] = useState<Acks | null>(null);
  const { busy, error: actionError, run } = useAction();
  const manage = !!me?.can.managePolicies;
  return (
    <div>
      <PageHeader title="Policies" sub="Publish a policy and everyone is asked to read and acknowledge it. A new version archives the old one and asks again." actions={manage ? <Btn kind="primary" onClick={() => setEdit('new')}>+ Policy</Btn> : undefined} />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No policies yet.</Empty> : (
        <Table head={['Policy', 'Version', 'Status', 'Effective', 'Acknowledged', '']}>
          {data.map((p) => (
            <tr key={p.id} style={{ opacity: p.status === 'ARCHIVED' ? 0.55 : 1 }}>
              <Td><b>{p.title}</b>{p.category && <div style={{ fontSize: 11, opacity: 0.7 }}>{p.category}</div>}</Td><Td>v{p.version}</Td><Td><Pill tone={p.status === 'PUBLISHED' ? 'good' : 'neutral'}>{label(p.status)}</Pill></Td>
              <Td>{p.effectiveDate ? fmtDate(p.effectiveDate) : '—'}</Td><Td>{p.requiresAck && p.status === 'PUBLISHED' ? `${p.acknowledged} of ${p.audience}` : '—'}</Td>
              <Td>{manage && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.status === 'DRAFT' && <><Btn small onClick={() => setEdit(p)}>Edit</Btn><Btn small kind="primary" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/pwm/policies/${p.id}/publish`, {}); reload(); })}>Publish</Btn></>}
                {p.status === 'PUBLISHED' && <><Btn small onClick={async () => setAcks((await api.get<{ data: Acks }>(`/admin/pwm/policies/${p.id}/acknowledgements`)).data)}>Who has read it</Btn><Btn small onClick={() => setEdit({ ...p, status: 'NEWVERSION' })}>New version</Btn></>}
              </div>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {edit && <Form p={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <Modal open={!!acks} onClose={() => setAcks(null)} title={acks ? `${acks.policy.title} v${acks.policy.version}` : ''} width={620}>
        {acks && <div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, marginBottom: 8 }}>{acks.employees.filter((e) => e.acknowledgedAt).length} of {acks.employees.length} current employees have acknowledged. People without a My HR login cannot acknowledge yet.</div>
          {acks.employees.map((e) => <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid rgba(128,128,128,.2)' }}><span>{e.firstName} {e.lastName} <span style={{ opacity: 0.6 }}>{e.department?.name}</span></span>{e.acknowledgedAt ? <Pill tone="good">{fmtDate(e.acknowledgedAt)}</Pill> : <Pill tone={e.hasLogin ? 'warn' : 'neutral'}>{e.hasLogin ? 'Not yet' : 'No login'}</Pill>}</div>)}
        </div>}
      </Modal>
    </div>
  );
}

function Form({ p, onClose, onSaved }: { p: P | null; onClose: () => void; onSaved: () => void }) {
  const newVersion = p?.status === 'NEWVERSION';
  const existing = useLoad(() => (p ? api.get<{ data: { body: string | null; fileUrl: string | null } }>('/admin/pwm/policies/' + p.id).then((r) => r.data) : Promise.resolve(null)), []);
  const [f, setF] = useState({ title: p?.title ?? '', category: p?.category ?? '', body: '', fileUrl: '', requiresAck: p?.requiresAck ?? true, effectiveDate: p?.effectiveDate?.slice(0, 10) ?? '' });
  const [loaded, setLoaded] = useState(false);
  if (existing.data && !loaded) { setLoaded(true); setF((x) => ({ ...x, body: existing.data?.body ?? '', fileUrl: existing.data?.fileUrl ?? '' })); }
  const { busy, error, run } = useAction();
  const save = () => run(async () => {
    const body = { ...f, effectiveDate: f.effectiveDate || null, ...(newVersion && p ? { slug: p.slug } : {}) };
    if (p && p.status === 'DRAFT') await api.patch(`/admin/pwm/policies/${p.id}`, body); else await api.post('/admin/pwm/policies', body);
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={p && p.status === 'DRAFT' ? 'Edit draft' : newVersion ? 'New version' : 'New policy'} width={680}>
      <div style={{ padding: 20, maxHeight: '78vh', overflowY: 'auto' }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Grid><Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Category"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field><Field label="Effective from"><Input type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} /></Field></Grid>
        <Field label="Policy text"><TextArea rows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="Or attach a PDF"><input type="file" accept=".pdf" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const up = await uploadDocument(file); setF((x) => ({ ...x, fileUrl: up.url })); } catch (err) { alert((err as Error).message); } }} />{f.fileUrl && <div style={{ fontSize: 11 }}>File attached.</div>}</Field>
        <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={f.requiresAck} onChange={(e) => setF({ ...f, requiresAck: e.target.checked })} />Everyone must acknowledge this policy</label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.title || (!f.body && !f.fileUrl)} onClick={save}>Save draft</Btn></div>
      </div>
    </Modal>
  );
}
