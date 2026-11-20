'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Input, Notice, PageHeader, Pill, Select, Table, Td, fmtDate, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface Member { id: string; userId: string; role: string; isActive: boolean; jobTitle: string | null; isMd: boolean; canViewCompensation: boolean; createdAt: string; user: { name: string; email: string } | null }

const HELP: Record<string, string> = {
  HR_ADMIN: 'Runs HR: employees, contracts, settings, imports. Sees pay only if switched on below.',
  HR_OFFICER: 'Day-to-day HR work on employees, contracts and checklists. Never sees pay or approves.',
  DEPARTMENT_HEAD: 'Sees only their own department. Recommends renewals. Must be set as a department head under Departments.',
  EXECUTIVE: 'Approves renewals, suspensions, terminations and pay changes. Receives management alerts.',
  FINANCE: 'Prepares pay changes and sees bank and statutory fields.',
  AUDITOR: 'Read-only access to activity logs and records.',
};

export default function TeamPage() {
  const { theme: T } = useTheme();
  const { me } = usePwm();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Member[] }>('/admin/pwm/members').then((r) => r.data), []);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<Member | null>(null);
  const { error: actionError, run } = useAction();
  const manage = !!me?.can.manageTeam;
  return (
    <div>
      <PageHeader title="HR team access" sub="Who can use People & Workforce and what they can do. Super admins already have full access. This is separate from the rest of the admin console." actions={manage ? <Btn kind="primary" onClick={() => setAdding(true)}>+ Add person</Btn> : undefined} />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>Nobody has been added yet. Create the admin login under Admin Users first, then add them here.</Empty> : (
        <Table head={['Person', 'Role', 'Extras', 'Added', '']}>
          {data.map((m) => (
            <tr key={m.id} style={{ opacity: m.isActive ? 1 : 0.55 }}>
              <Td><b>{m.user?.name ?? 'Unknown'}</b><div style={{ fontSize: 11, color: T.textSec }}>{m.user?.email}{m.jobTitle ? ` · ${m.jobTitle}` : ''}</div></Td>
              <Td><Pill tone="brand">{label(m.role)}</Pill>{!m.isActive && <Pill tone="bad">Revoked</Pill>}</Td>
              <Td style={{ fontSize: 12 }}>{[m.isMd && 'Managing Director alerts', m.canViewCompensation && 'Can see pay'].filter(Boolean).join(' · ') || '—'}</Td><Td>{fmtDate(m.createdAt)}</Td>
              <Td>{manage && <div style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => setEdit(m)}>Edit</Btn><Btn small kind={m.isActive ? 'danger' : 'secondary'} onClick={() => run(async () => { await api.post(`/admin/pwm/members/${m.id}/${m.isActive ? 'revoke' : 'restore'}`, {}); reload(); })}>{m.isActive ? 'Revoke' : 'Restore'}</Btn></div>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <Form onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {edit && <Form m={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function Form({ m, onClose, onSaved }: { m?: Member; onClose: () => void; onSaved: () => void }) {
  const eligible = useLoad(() => (m ? Promise.resolve([]) : api.get<{ data: { id: string; name: string; email: string }[] }>('/admin/pwm/eligible-users').then((r) => r.data)), []);
  const [f, setF] = useState({ userId: '', role: m?.role ?? 'HR_OFFICER', jobTitle: m?.jobTitle ?? '', isMd: m?.isMd ?? false, canViewCompensation: m?.canViewCompensation ?? false });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={m ? `Edit ${m.user?.name}` : 'Add person'} width={520}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {!m && <Field label="Admin" hint="Only existing operations or support admins appear. Add their login under Admin Users first."><Select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}><option value="">Choose…</option>{eligible.data?.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</Select></Field>}
        <Field label="Role" hint={HELP[f.role]}><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.keys(HELP).map((r) => <option key={r} value={r}>{label(r)}</option>)}</Select></Field>
        <Field label="Job title"><Input value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></Field>
        {f.role === 'EXECUTIVE' && <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 8 }}><input type="checkbox" checked={f.isMd} onChange={(e) => setF({ ...f, isMd: e.target.checked })} />This person is the Managing Director (receives critical day-before and day-of alerts)</label>}
        {f.role === 'HR_ADMIN' && <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 8 }}><input type="checkbox" checked={f.canViewCompensation} onChange={(e) => setF({ ...f, canViewCompensation: e.target.checked })} />Can see and prepare pay (use only where HR administers pay)</label>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || (!m && !f.userId)} onClick={() => run(async () => { if (m) await api.patch(`/admin/pwm/members/${m.id}`, f); else await api.post('/admin/pwm/members', f); onSaved(); })}>Save</Btn></div>
      </div>
    </Modal>
  );
}
