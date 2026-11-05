'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Card, Empty, Field, Input, Notice, PageHeader, PLATFORMS, Pill, PlatformTag, Select, StatusPill, TextArea,
  fmtDate, pretty, toLocalInput, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

interface Assignment { id: string; kind: string; startsAt: string; endsAt: string | null; reason?: string | null; endedReason?: string | null; assignedByName?: string | null; member: { id: string; user?: { name: string }; userId?: string } }
interface Account {
  id: string; platform: string; name: string; handle: string | null; url: string | null; category: string | null; accountType: string | null;
  ownerLabel: string | null; connectionStatus: string; apiAuthStatus: string; lastSyncAt: string | null; description: string | null; notes: string | null;
  archivedAt: string | null; assignments: Assignment[]; recentContent?: { id: string; status: string; caption: string; content: { id: string; title: string } }[];
}

export default function AccountsPage() {
  const { theme: T } = useTheme();
  const { me, people } = useSmois();
  const [showArchived, setShowArchived] = useState(false);
  const [platform, setPlatform] = useState('');
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, loading, error, reload } = useLoad(
    () => api.get<{ data: Account[] }>(`/admin/smois/accounts?${showArchived ? 'includeArchived=1&' : ''}${platform ? `platform=${platform}` : ''}`).then((r) => r.data),
    [showArchived, platform],
  );
  const canManage = !!me?.can.manageAccounts;

  return (
    <div>
      <PageHeader
        title="Social accounts"
        sub="One shared record per company account. Managers are assigned to it; nobody owns it personally, and assignment history is kept."
        actions={canManage ? <Btn kind="primary" onClick={() => setEditing({ platform: 'INSTAGRAM' })}>+ Register account</Btn> : undefined}
      />
      <Notice kind="info">Accounts are tracked by hand for now. Live follower counts, analytics and one-click publishing arrive when each platform&apos;s API is connected; none of that is simulated here.</Notice>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 200 }}><Select value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></div>
        <label style={{ fontSize: 12, color: T.textSec, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data && <Empty>Loading…</Empty>}
      {data && data.length === 0 && <Empty>No accounts yet.{canManage ? ' Register your first one.' : ''}</Empty>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
        {data?.map((a) => (
          <div key={a.id} onClick={() => setOpenId(a.id)} style={{ cursor: 'pointer' }}>
            <Card style={{ opacity: a.archivedAt ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <PlatformTag platform={a.platform} />
                <Pill tone={a.connectionStatus === 'MANUAL' ? 'neutral' : a.connectionStatus === 'CONNECTED' ? 'good' : 'bad'}>{a.connectionStatus === 'MANUAL' ? 'Tracked manually' : pretty(a.connectionStatus)}</Pill>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginTop: 10 }}>{a.name}</div>
              <div style={{ fontSize: 12, color: T.textSec }}>{a.handle ? `@${a.handle}` : 'No handle'}{a.ownerLabel ? ` · ${a.ownerLabel}` : ''}</div>
              <div style={{ marginTop: 12, fontSize: 12, color: T.textSec }}>
                {a.assignments.length === 0 ? <span style={{ color: T.warning, fontWeight: 700 }}>No one assigned</span> : a.assignments.map((x) => (
                  <span key={x.id} style={{ marginRight: 6 }}>{x.member.user?.name}{x.kind === 'PRIMARY' ? ' ★' : ''}{x.kind === 'TEMPORARY' ? ' (temp)' : ''}</span>
                ))}
              </div>
              {a.archivedAt && <div style={{ marginTop: 8 }}><Pill>Archived</Pill></div>}
            </Card>
          </div>
        ))}
      </div>

      {editing && <AccountForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {openId && (
        <AccountDetail id={openId} canManage={canManage} people={people} onClose={() => setOpenId(null)} onChanged={reload}
          onEdit={(a) => { setOpenId(null); setEditing(a); }} />
      )}
    </div>
  );
}

function AccountForm({ initial, onClose, onSaved }: { initial: Partial<Account>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    platform: initial.platform ?? 'INSTAGRAM', name: initial.name ?? '', handle: initial.handle ?? '', url: initial.url ?? '',
    category: initial.category ?? '', accountType: initial.accountType ?? '', ownerLabel: initial.ownerLabel ?? '', description: initial.description ?? '', notes: initial.notes ?? '',
  });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => run(async () => {
    if (initial.id) await api.patch(`/admin/smois/accounts/${initial.id}`, f); else await api.post('/admin/smois/accounts', f);
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={initial.id ? 'Edit account' : 'Register account'} width={560}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Platform"><Select value={f.platform} onChange={set('platform')} disabled={!!initial.id}>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></Field>
        <Field label="Account name"><Input value={f.name} onChange={set('name')} placeholder="GoBuyMe Official" /></Field>
        <Field label="Handle" hint="Without the @"><Input value={f.handle} onChange={set('handle')} /></Field>
        <Field label="Profile link"><Input value={f.url} onChange={set('url')} placeholder="https://" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Category"><Input value={f.category} onChange={set('category')} placeholder="Brand, Support…" /></Field>
          <Field label="Account type"><Select value={f.accountType} onChange={set('accountType')}><option value="">—</option><option>business</option><option>creator</option><option>personal</option></Select></Field>
        </div>
        <Field label="Company owner" hint="The department or custodian who can recover this account. Not an individual employee login."><Input value={f.ownerLabel} onChange={set('ownerLabel')} /></Field>
        <Field label="Description"><TextArea rows={2} value={f.description} onChange={set('description')} /></Field>
        <Field label="Notes"><TextArea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></div>
      </div>
    </Modal>
  );
}

function AccountDetail({ id, canManage, people, onClose, onChanged, onEdit }: {
  id: string; canManage: boolean; people: { memberId: string | null; name: string; role: string }[]; onClose: () => void; onChanged: () => void; onEdit: (a: Account) => void;
}) {
  const { theme: T } = useTheme();
  const { data, reload } = useLoad(() => api.get<{ data: Account }>(`/admin/smois/accounts/${id}`).then((r) => r.data), [id]);
  const [member, setMember] = useState('');
  const [kind, setKind] = useState('SECONDARY');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const changed = () => { reload(); onChanged(); };
  const assignable = people.filter((p) => p.memberId && (p.role === 'MANAGER' || p.role === 'MANAGEMENT'));

  const assign = () => run(async () => {
    await api.post(`/admin/smois/accounts/${id}/assignments`, { memberId: member, kind, reason, ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}) });
    setMember(''); setReason(''); setEndsAt(''); changed();
  });
  const end = (aid: string) => {
    const why = window.prompt('Why is this assignment ending?');
    if (!why) return;
    run(async () => { await api.post(`/admin/smois/assignments/${aid}/end`, { reason: why }); changed(); });
  };
  const archive = (on: boolean) => run(async () => { await api.post(`/admin/smois/accounts/${id}/${on ? 'archive' : 'restore'}`, {}); changed(); if (on) onClose(); });

  const now = Date.now();
  return (
    <Modal open onClose={onClose} title={data?.name ?? 'Account'} width={720}>
      {!data ? <Empty>Loading…</Empty> : (
        <div style={{ padding: 20 }}>
          {error && <Notice kind="error">{error}</Notice>}
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <PlatformTag platform={data.platform} />
            <div style={{ display: 'flex', gap: 8 }}>
              {data.url && <a href={data.url} target="_blank" rel="noreferrer" style={{ color: T.primary, fontSize: 12, fontWeight: 700 }}>Open profile ↗</a>}
              {canManage && <Btn small onClick={() => onEdit(data)}>Edit</Btn>}
              {canManage && <Btn small kind="danger" onClick={() => archive(!data.archivedAt)}>{data.archivedAt ? 'Restore' : 'Archive'}</Btn>}
            </div>
          </div>
          <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.7, marginBottom: 14 }}>
            <div>Handle: <b style={{ color: T.text }}>{data.handle ? `@${data.handle}` : '—'}</b> · Type: <b style={{ color: T.text }}>{data.accountType ?? '—'}</b> · Category: <b style={{ color: T.text }}>{data.category ?? '—'}</b></div>
            <div>Company owner: <b style={{ color: T.text }}>{data.ownerLabel ?? '—'}</b> · Connection: <b style={{ color: T.text }}>{data.connectionStatus === 'MANUAL' ? 'Tracked manually (no API link)' : pretty(data.connectionStatus)}</b> · Last sync: <b style={{ color: T.text }}>{data.lastSyncAt ? fmtDate(data.lastSyncAt) : 'Never'}</b></div>
            {data.description && <div>{data.description}</div>}
            {data.notes && <div style={{ color: T.textMuted }}>Notes: {data.notes}</div>}
          </div>

          <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 8 }}>Assignments</div>
          {canManage && !data.archivedAt && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
              <Select value={member} onChange={(e) => setMember(e.target.value)}><option value="">Assign someone…</option>{assignable.map((p) => <option key={p.memberId!} value={p.memberId!}>{p.name} ({pretty(p.role)})</option>)}</Select>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="PRIMARY">Primary</option><option value="SECONDARY">Secondary</option><option value="TEMPORARY">Temporary</option></Select>
              {kind === 'TEMPORARY' && <Input type="datetime-local" value={endsAt || toLocalInput()} onChange={(e) => setEndsAt(e.target.value)} />}
              <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Btn kind="primary" disabled={!member || busy} onClick={assign}>Assign</Btn>
            </div>
          )}
          {data.assignments.length === 0 ? <Empty>No history.</Empty> : data.assignments.map((a) => {
            const active = !a.endsAt || new Date(a.endsAt).getTime() > now;
            return (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
                <div>
                  <b style={{ color: T.text }}>{a.member.user?.name}</b> <Pill tone={active ? 'good' : 'neutral'}>{pretty(a.kind)}{active ? '' : ' · ended'}</Pill>
                  <div style={{ color: T.textSec, marginTop: 3 }}>{fmtDate(a.startsAt)} → {a.endsAt ? fmtDate(a.endsAt) : 'ongoing'}{a.assignedByName ? ` · by ${a.assignedByName}` : ''}{a.reason ? ` · “${a.reason}”` : ''}{a.endedReason ? ` · ended: ${a.endedReason}` : ''}</div>
                </div>
                {canManage && active && <Btn small kind="ghost" onClick={() => end(a.id)}>End</Btn>}
              </div>
            );
          })}

          <div style={{ fontSize: 12, fontWeight: 800, color: T.text, margin: '16px 0 8px' }}>Recent content</div>
          {data.recentContent?.length ? data.recentContent.map((c) => (
            <a key={c.id} href={`/smois/content?open=${c.content.id}`} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.text }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.content.title}</span><StatusPill status={c.status} />
            </a>
          )) : <Empty>Nothing yet.</Empty>}
        </div>
      )}
    </Modal>
  );
}
