'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Empty, Field, Input, Notice, PageHeader, Pill, Select, Table, Td,
  fmtDate, pretty, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

interface Member {
  id: string; userId: string; role: string; isActive: boolean; jobTitle: string | null; responsibilities: string | null; assignedToDeptAt: string; revokedAt: string | null;
  canApprove: boolean; canPublish: boolean; canEmergencyPublish: boolean; canConnectAccounts: boolean;
  user: { name: string; email: string; role: string };
  assignments: { id: string; kind: string; account: { name: string; platform: string } }[];
}

const ROLE_HELP: Record<string, string> = {
  MANAGEMENT: 'Sees everything, assigns work, approves content. Can be allowed to publish and connect accounts.',
  MANAGER: 'Works on the accounts they are assigned to: writes content, submits it, completes tasks.',
  REVIEWER: 'Reviews and approves submitted content. Cannot write or publish.',
  VIEWER: 'Read-only view of dashboards, calendar and records, for executives.',
};

export default function TeamPage() {
  const { theme: T } = useTheme();
  const { me, reloadMe } = useSmois();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Member[] }>('/admin/smois/members').then((r) => r.data), []);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<Member | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const canManage = !!me?.can.manageTeam;
  const { run, error: actionError } = useAction();

  const setAccess = (m: Member, revoke: boolean) => {
    const reason = revoke ? window.prompt(`Revoke ${m.user.name}'s access? Their work and history stay. Reason (optional):`) : '';
    if (revoke && reason === null) return;
    run(async () => { await api.post(`/admin/smois/members/${m.id}/${revoke ? 'revoke' : 'restore'}`, { reason }); reload(); reloadMe(); });
  };

  return (
    <div>
      <PageHeader
        title="Social media team"
        sub="Who can use the workspace, and what they may do. This access is separate from the rest of the admin console: social media staff see nothing else."
        actions={canManage ? <Btn kind="primary" onClick={() => setAdding(true)}>+ Add team member</Btn> : undefined}
      />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.length === 0 ? <Empty>No team members yet. Super admins already have full access.</Empty> : data && (
        <Table head={['Person', 'Role', 'Permissions', 'Accounts', 'Joined', '']}>
          {data.map((m) => (
            <tr key={m.id} style={{ opacity: m.isActive ? 1 : 0.55 }}>
              <Td><b>{m.user.name}</b><div style={{ fontSize: 11, color: T.textSec }}>{m.user.email}{m.jobTitle ? ` · ${m.jobTitle}` : ''}</div></Td>
              <Td><Pill tone="brand">{pretty(m.role)}</Pill>{!m.isActive && <div style={{ marginTop: 4 }}><Pill tone="bad">Access revoked</Pill></div>}</Td>
              <Td style={{ fontSize: 12 }}>
                {[m.canApprove && 'Approve', m.canPublish && 'Publish', m.canEmergencyPublish && 'Emergency publish', m.canConnectAccounts && 'Connect accounts'].filter(Boolean).join(' · ') || <span style={{ color: T.textMuted }}>None extra</span>}
              </Td>
              <Td style={{ fontSize: 12 }}>{m.assignments.length === 0 ? '—' : m.assignments.map((a) => `${a.account.name}${a.kind === 'PRIMARY' ? ' ★' : ''}`).join(', ')}</Td>
              <Td style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.assignedToDeptAt)}</Td>
              <Td>{canManage && <div style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => setEdit(m)}>Edit</Btn><Btn small kind={m.isActive ? 'danger' : 'secondary'} onClick={() => setAccess(m, m.isActive)}>{m.isActive ? 'Revoke' : 'Restore'}</Btn></div>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <AddMember onClose={() => setAdding(false)} onAdded={(s) => { setAdding(false); reload(); if (s) setSecret(s); }} />}
      {edit && <EditMember m={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Hand over these sign-in details" width={460}>
        {secret && <div style={{ padding: 20 }}>
          <Notice kind="warn">Shown once. Share them privately; the person can change the password after signing in.</Notice>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>Email: <b>{secret.email}</b><br />Temporary password: <b style={{ fontFamily: 'monospace' }}>{secret.password}</b></div>
          <div style={{ textAlign: 'right', marginTop: 14 }}><Btn kind="primary" onClick={() => setSecret(null)}>Done</Btn></div>
        </div>}
      </Modal>
    </div>
  );
}

function Flags({ f, setF }: { f: { canApprove: boolean; canPublish: boolean; canEmergencyPublish: boolean; canConnectAccounts: boolean }; setF: (v: typeof f) => void }) {
  const items: [keyof typeof f, string][] = [['canApprove', 'Can approve content'], ['canPublish', 'Can schedule and record publishing'], ['canEmergencyPublish', 'Can bypass approval in an emergency'], ['canConnectAccounts', 'Can register and assign accounts']];
  return (
    <Field label="Permissions">
      {items.map(([k, label]) => <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{label}</label>)}
    </Field>
  );
}

const DEFAULTS: Record<string, { canApprove: boolean; canPublish: boolean; canEmergencyPublish: boolean; canConnectAccounts: boolean }> = {
  MANAGEMENT: { canApprove: true, canPublish: true, canEmergencyPublish: false, canConnectAccounts: false },
  MANAGER: { canApprove: false, canPublish: false, canEmergencyPublish: false, canConnectAccounts: false },
  REVIEWER: { canApprove: true, canPublish: false, canEmergencyPublish: false, canConnectAccounts: false },
  VIEWER: { canApprove: false, canPublish: false, canEmergencyPublish: false, canConnectAccounts: false },
};

function AddMember({ onClose, onAdded }: { onClose: () => void; onAdded: (secret: { email: string; password: string } | null) => void }) {
  const eligible = useLoad(() => api.get<{ data: { id: string; name: string; email: string; role: string }[] }>('/admin/smois/eligible-users').then((r) => r.data), []);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [f, setF] = useState({ name: '', email: '', userId: '', role: 'MANAGER', jobTitle: '', ...DEFAULTS.MANAGER });
  const { busy, error, run } = useAction();
  const flags = { canApprove: f.canApprove, canPublish: f.canPublish, canEmergencyPublish: f.canEmergencyPublish, canConnectAccounts: f.canConnectAccounts };
  const save = () => run(async () => {
    const r = await api.post<{ data: { tempPassword: string | null } }>('/admin/smois/members', { role: f.role, jobTitle: f.jobTitle, ...flags, ...(mode === 'new' ? { name: f.name, email: f.email } : { userId: f.userId }) });
    onAdded(mode === 'new' && r.data.tempPassword ? { email: f.email, password: r.data.tempPassword } : null);
  });
  return (
    <Modal open onClose={onClose} title="Add team member" width={560}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Who">
          <Select value={mode} onChange={(e) => setMode(e.target.value as 'new' | 'existing')}><option value="new">Create a new sign-in for them</option><option value="existing">Give an existing admin access</option></Select>
        </Field>
        {mode === 'new' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          </div>
        ) : (
          <Field label="Admin" hint="They keep their existing admin role; this only adds the social media workspace."><Select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}><option value="">Choose…</option>{eligible.data?.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</Select></Field>
        )}
        <Field label="Role" hint={ROLE_HELP[f.role]}><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, ...DEFAULTS[e.target.value] })}>{Object.keys(DEFAULTS).map((r) => <option key={r} value={r}>{pretty(r)}</option>)}</Select></Field>
        <Field label="Job title"><Input value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></Field>
        <Flags f={flags} setF={(v) => setF({ ...f, ...v })} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={busy || (mode === 'new' ? !f.name.trim() || !f.email.trim() : !f.userId)} onClick={save}>{busy ? 'Adding…' : 'Add'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function EditMember({ m, onClose, onSaved }: { m: Member; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ role: m.role, jobTitle: m.jobTitle ?? '', responsibilities: m.responsibilities ?? '', canApprove: m.canApprove, canPublish: m.canPublish, canEmergencyPublish: m.canEmergencyPublish, canConnectAccounts: m.canConnectAccounts });
  const { busy, error, run } = useAction();
  const flags = { canApprove: f.canApprove, canPublish: f.canPublish, canEmergencyPublish: f.canEmergencyPublish, canConnectAccounts: f.canConnectAccounts };
  return (
    <Modal open onClose={onClose} title={`Edit ${m.user.name}`} width={520}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Role" hint={ROLE_HELP[f.role]}><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, ...DEFAULTS[e.target.value] })}>{Object.keys(DEFAULTS).map((r) => <option key={r} value={r}>{pretty(r)}</option>)}</Select></Field>
        <Field label="Job title"><Input value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></Field>
        <Field label="Responsibilities"><Input value={f.responsibilities} onChange={(e) => setF({ ...f, responsibilities: e.target.value })} /></Field>
        <Flags f={flags} setF={(v) => setF({ ...f, ...v })} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.patch(`/admin/smois/members/${m.id}`, f); onSaved(); })}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
