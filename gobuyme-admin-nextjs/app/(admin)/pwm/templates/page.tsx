'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Table, Td, TextArea, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface T { id: string; slug: string; name: string; kind: string; version: number; body: string; status: string }

export default function TemplatesPage() {
  const { me } = usePwm();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { templates: T[]; fields: Record<string, string> } }>('/admin/pwm/templates').then((r) => r.data), []);
  const [edit, setEdit] = useState<T | 'new' | null>(null);
  const { busy, error: actionError, run } = useAction();
  const [msg, setMsg] = useState('');
  return (
    <div>
      <PageHeader title="Document templates" sub="Contracts and letters with merge fields. A template is written by one person and approved by another, and only approved templates can generate documents."
        actions={<><Btn disabled={busy} onClick={() => run(async () => { const r = await api.post<{ message: string }>('/admin/pwm/templates/seed', {}); setMsg(r.message); reload(); })}>Add starter templates</Btn><Btn kind="primary" onClick={() => setEdit('new')}>+ Template</Btn></>} />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <Notice kind="warn">Starter templates are examples only. Have your legal counsel review contract wording before approving it. Pay is never available as a merge field.</Notice>
      {loading && !data ? <Empty>Loading…</Empty> : !data?.templates.length ? <Empty>No templates yet.</Empty> : (
        <Table head={['Template', 'Kind', 'Version', 'Status', '']}>
          {data.templates.map((t) => (
            <tr key={t.id} style={{ opacity: t.status === 'ARCHIVED' ? 0.55 : 1 }}>
              <Td><b>{t.name}</b></Td><Td>{label(t.kind)}</Td><Td>v{t.version}</Td><Td><Pill tone={t.status === 'APPROVED' ? 'good' : t.status === 'DRAFT' ? 'warn' : 'neutral'}>{label(t.status)}</Pill></Td>
              <Td><div style={{ display: 'flex', gap: 6 }}>
                {t.status === 'DRAFT' && <Btn small onClick={() => setEdit(t)}>Edit</Btn>}
                {t.status === 'DRAFT' && me?.can.approveContracts && <Btn small kind="primary" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/pwm/templates/${t.id}/approve`, {}); reload(); })}>Approve</Btn>}
                {t.status === 'APPROVED' && <Btn small onClick={() => setEdit({ ...t, id: '', status: 'NEWVERSION' })}>New version</Btn>}
              </div></Td>
            </tr>
          ))}
        </Table>
      )}
      {edit && data && <Form t={edit === 'new' ? null : edit} fields={data.fields} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function Form({ t, fields, onClose, onSaved }: { t: T | null; fields: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const newVersion = t?.status === 'NEWVERSION';
  const [f, setF] = useState({ name: t?.name ?? '', kind: t?.kind ?? 'LETTER', body: t?.body ?? '' });
  const { busy, error, run } = useAction();
  const save = () => run(async () => {
    if (t && t.status === 'DRAFT') await api.patch(`/admin/pwm/templates/${t.id}`, { name: f.name, body: f.body });
    else await api.post('/admin/pwm/templates', { ...f, ...(newVersion && t ? { slug: t.slug } : {}) });
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={t && t.status === 'DRAFT' ? 'Edit draft' : newVersion ? 'New version' : 'New template'} width={900}>
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 230px', gap: 16 }}>
        <div>
          {error && <Notice kind="error">{error}</Notice>}
          <Grid><Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Kind"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} disabled={!!t}><option value="LETTER">Letter</option><option value="CONTRACT">Contract</option><option value="EXIT">Exit document</option></Select></Field></Grid>
          <Field label="Text" hint="# Heading, ## Subheading, blank line between paragraphs. Use the fields on the right."><TextArea rows={18} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ fontFamily: 'monospace', fontSize: 12 }} /></Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name || !f.body} onClick={save}>Save draft</Btn></div>
        </div>
        <div style={{ fontSize: 12, overflowY: 'auto', maxHeight: 460 }}>
          <b>Merge fields</b>
          {Object.entries(fields).map(([k, v]) => <div key={k} style={{ padding: '4px 0' }}><button onClick={() => setF((x) => ({ ...x, body: `${x.body}{{${k}}}` }))} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'monospace', color: '#FF521B' }}>{`{{${k}}}`}</button><div style={{ opacity: 0.7 }}>{v}</div></div>)}
        </div>
      </div>
    </Modal>
  );
}
