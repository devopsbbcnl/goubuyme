'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Table, Td, TextArea, fmtDateTime, useAction, useLoad } from '@/components/pwm/ui';

interface A { id: string; title: string; body: string; pinned: boolean; publishAt: string; expiresAt: string | null; archivedAt: string | null; departmentIds: string[] | null; createdByName: string | null }

export default function AnnouncementsPage() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: A[] }>('/admin/pwm/announcements').then((r) => r.data), []);
  const depts = useLoad(() => api.get<{ data: { id: string; name: string }[] }>('/admin/pwm/departments').then((r) => r.data), []);
  const [adding, setAdding] = useState(false);
  const { error: actionError, run } = useAction();
  const [now] = useState(() => Date.now());
  return (
    <div>
      <PageHeader title="Announcements" sub="Company news shown on each person's My HR page and sent to them as an alert. Choose everyone or particular departments." actions={<Btn kind="primary" onClick={() => setAdding(true)}>+ Announcement</Btn>} />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>Nothing posted yet.</Empty> : (
        <Table head={['Title', 'Audience', 'Shows', 'State', '']}>
          {data.map((a) => {
            const live = !a.archivedAt && new Date(a.publishAt).getTime() <= now && (!a.expiresAt || new Date(a.expiresAt).getTime() > now);
            return (
              <tr key={a.id}><Td><b>{a.title}</b>{a.pinned && <Pill tone="brand">Pinned</Pill>}<div style={{ fontSize: 12, opacity: 0.8, maxWidth: 420 }}>{a.body.slice(0, 140)}{a.body.length > 140 ? '…' : ''}</div></Td>
                <Td>{a.departmentIds?.length ? a.departmentIds.map((id) => depts.data?.find((d) => d.id === id)?.name ?? '?').join(', ') : 'Everyone'}</Td><Td style={{ fontSize: 12 }}>{fmtDateTime(a.publishAt)}{a.expiresAt ? ` to ${fmtDateTime(a.expiresAt)}` : ''}</Td>
                <Td><Pill tone={live ? 'good' : 'neutral'}>{a.archivedAt ? 'Archived' : live ? 'Live' : new Date(a.publishAt).getTime() > now ? 'Scheduled' : 'Ended'}</Pill></Td>
                <Td>{!a.archivedAt && <Btn small onClick={() => run(async () => { await api.post(`/admin/pwm/announcements/${a.id}/archive`, {}); reload(); })}>Archive</Btn>}</Td></tr>
            );
          })}
        </Table>
      )}
      {adding && <Form depts={depts.data ?? []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function Form({ depts, onClose, onSaved }: { depts: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: '', body: '', publishAt: '', expiresAt: '', pinned: false, departmentIds: [] as string[] });
  const { busy, error, run } = useAction();
  const toggle = (id: string) => setF((x) => ({ ...x, departmentIds: x.departmentIds.includes(id) ? x.departmentIds.filter((d) => d !== id) : [...x.departmentIds, id] }));
  return (
    <Modal open onClose={onClose} title="New announcement" width={600}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Message"><TextArea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Grid><Field label="Show from" hint="Blank means now."><Input type="datetime-local" value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} /></Field><Field label="Show until"><Input type="datetime-local" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></Field></Grid>
        <Field label="Who sees it" hint="Leave all unticked for everyone."><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>{depts.map((d) => <label key={d.id}><input type="checkbox" checked={f.departmentIds.includes(d.id)} onChange={() => toggle(d.id)} /> {d.name}</label>)}</div></Field>
        <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />Pin to the top</label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.title || !f.body} onClick={() => run(async () => { await api.post('/admin/pwm/announcements', { ...f, publishAt: f.publishAt ? new Date(f.publishAt).toISOString() : undefined, expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null }); onSaved(); })}>Post</Btn></div>
      </div>
    </Modal>
  );
}
