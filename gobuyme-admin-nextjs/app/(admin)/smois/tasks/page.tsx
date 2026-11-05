'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Empty, Field, Input, Notice, PageHeader, Pill, PlatformTag, Select, StatusPill, Table, Tabs, Td, TextArea,
  fmtDateTime, fromLocalInput, pretty, toLocalInput, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

const TYPES = ['CONTENT_CREATION', 'GRAPHIC_DESIGN', 'VIDEO_PRODUCTION', 'PUBLISHING', 'COMMUNITY_MANAGEMENT', 'CAMPAIGN_EXECUTION', 'AUDIENCE_ENGAGEMENT', 'ANALYTICS_REVIEW', 'REPORTING', 'COMPETITOR_RESEARCH', 'SOCIAL_LISTENING', 'BRAND_MONITORING', 'GENERAL'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const EVIDENCE = ['POST_URL', 'GRAPHIC', 'REPORT', 'SCREENSHOT', 'VIDEO', 'DOCUMENT', 'INTERACTION', 'OTHER'];

interface Row {
  id: string; number: number; title: string; type: string; priority: string; status: string; deadline: string | null; overdue: boolean; ruleId: string | null;
  assignee: { id: string; user: { name: string } } | null; account: { name: string; platform: string } | null; createdByName: string | null; _count: { evidence: number; comments: number };
}
type View = 'mine' | 'all' | 'review' | 'overdue' | 'done' | 'recurring';

export default function TasksPage() {
  return <Suspense fallback={<Empty>Loading…</Empty>}><Inner /></Suspense>;
}

function Inner() {
  const { me } = useSmois();
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<View>(((params.get('view') as View) && (me?.can.viewAll || params.get('view') === 'mine')) ? (params.get('view') as View) : 'mine');
  const [open, setOpen] = useState<string | null>(params.get('open'));
  const [creating, setCreating] = useState(false);
  useEffect(() => { setOpen(params.get('open')); }, [params]);

  const { data, loading, error, reload } = useLoad(
    () => (view === 'recurring' ? Promise.resolve(null) : api.get<{ data: { tasks: Row[]; counts: { pending: number; overdue: number; review: number } } }>(`/admin/smois/tasks?view=${view}`).then((r) => r.data)),
    [view],
  );
  const close = () => { setOpen(null); if (params.get('open')) router.replace('/smois/tasks'); };
  const changed = () => { reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); };

  const tabs: { id: View; label: string; badge?: number }[] = [
    { id: 'mine', label: 'My tasks' },
    ...(me?.can.viewAll ? [{ id: 'all' as View, label: 'All open' }] : []),
    ...(me?.can.viewAll ? [{ id: 'review' as View, label: 'To review', badge: data?.counts.review }] : []),
    ...(me?.can.viewAll ? [{ id: 'overdue' as View, label: 'Overdue', badge: view === 'overdue' ? undefined : undefined }] : []),
    { id: 'done', label: 'Done' },
    ...(me?.can.manageTasks ? [{ id: 'recurring' as View, label: 'Recurring' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Tasks & assignments"
        sub="Work is assigned, accepted, evidenced and signed off. Overdue is worked out from the deadline, and every change is logged."
        actions={me?.can.manageTasks ? <Btn kind="primary" onClick={() => setCreating(true)}>+ New task</Btn> : undefined}
      />
      <Tabs value={view} onChange={setView} items={tabs} />
      {error && <Notice kind="error">{error}</Notice>}
      {view === 'recurring' ? <Recurring /> : loading && !data ? <Empty>Loading…</Empty> : data && data.tasks.length === 0 ? <Empty>No tasks here.</Empty> : data && (
        <Table head={['#', 'Task', 'Assignee', 'Account', 'Deadline', 'Priority', 'Status']}>
          {data.tasks.map((t) => (
            <tr key={t.id} onClick={() => setOpen(t.id)} style={{ cursor: 'pointer' }}>
              <Td style={{ opacity: 0.6 }}>{t.number}</Td>
              <Td><b>{t.title}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{pretty(t.type)}{t.ruleId ? ' · recurring' : ''} · {t._count.evidence} evidence</div></Td>
              <Td>{t.assignee?.user.name ?? <Pill tone="warn">Unassigned</Pill>}</Td>
              <Td>{t.account ? <PlatformTag platform={t.account.platform} name={t.account.name} /> : '—'}</Td>
              <Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(t.deadline)} {t.overdue && <Pill tone="bad">Overdue</Pill>}</Td>
              <Td><StatusPill status={t.priority} /></Td>
              <Td><StatusPill status={t.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <TaskForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); changed(); }} />}
      {open && <TaskDetail id={open} onClose={close} onChanged={changed} />}
    </div>
  );
}

function TaskForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { people } = useSmois();
  const accounts = useLoad(() => api.get<{ data: { id: string; name: string; platform: string }[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const [f, setF] = useState({ title: '', description: '', type: 'GENERAL', priority: 'NORMAL', assigneeId: '', accountId: '', deadline: '', expectedDeliverable: '', completionCriteria: '' });
  const [supporters, setSupporters] = useState<string[]>([]);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const doers = people.filter((p) => p.memberId && (p.role === 'MANAGER' || p.role === 'MANAGEMENT'));
  const save = () => run(async () => {
    await api.post('/admin/smois/tasks', { ...f, assigneeId: f.assigneeId || null, accountId: f.accountId || null, deadline: f.deadline ? fromLocalInput(f.deadline) : null, supporterIds: supporters });
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title="New task" width={600}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Title"><Input value={f.title} onChange={set('title')} /></Field>
        <Field label="Description"><TextArea rows={3} value={f.description} onChange={set('description')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Type"><Select value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</Select></Field>
          <Field label="Priority"><Select value={f.priority} onChange={set('priority')}>{PRIORITIES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</Select></Field>
          <Field label="Assign to"><Select value={f.assigneeId} onChange={set('assigneeId')}><option value="">Unassigned</option>{doers.map((p) => <option key={p.memberId!} value={p.memberId!}>{p.name}</option>)}</Select></Field>
          <Field label="Deadline"><Input type="datetime-local" value={f.deadline} onChange={set('deadline')} /></Field>
          <Field label="Account"><Select value={f.accountId} onChange={set('accountId')}><option value="">None</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Expected deliverable"><Input value={f.expectedDeliverable} onChange={set('expectedDeliverable')} /></Field>
        </div>
        <Field label="Completion criteria"><Input value={f.completionCriteria} onChange={set('completionCriteria')} /></Field>
        <Field label="Supporting team members">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{doers.filter((p) => p.memberId !== f.assigneeId).map((p) => (
            <label key={p.memberId!} style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
              <input type="checkbox" checked={supporters.includes(p.memberId!)} onChange={(e) => setSupporters(e.target.checked ? [...supporters, p.memberId!] : supporters.filter((x) => x !== p.memberId))} />{p.name}
            </label>
          ))}</div>
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Create task'}</Btn></div>
      </div>
    </Modal>
  );
}

interface Detail {
  id: string; number: number; title: string; description: string | null; type: string; priority: string; status: string; deadline: string | null; startsAt: string | null; completedAt: string | null;
  expectedDeliverable: string | null; completionCriteria: string | null; overdue: boolean; createdByName: string | null; canEdit: boolean; canEvidence: boolean; nextStatuses: string[];
  assignee: { user: { name: string } } | null; account: { name: string; platform: string } | null; supporters: { member: { id: string; user: { name: string } } }[];
  rule: { title: string; recurrence: string } | null;
  evidence: { id: string; kind: string; url: string | null; note: string | null; createdAt: string; addedByName: string | null }[];
  comments: { id: string; body: string; createdAt: string; authorName: string | null }[];
  history: { id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string; changedByName: string | null }[];
}

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: 'Accept', IN_PROGRESS: 'Start work', SUBMITTED: 'Submit for review', UNDER_REVIEW: 'Start review', APPROVED: 'Approve',
  REVISION_REQUIRED: 'Return for changes', COMPLETED: 'Mark complete', CANCELLED: 'Cancel task',
};

function TaskDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const { data, reload } = useLoad(() => api.get<{ data: Detail }>(`/admin/smois/tasks/${id}`).then((r) => r.data), [id]);
  const { busy, error, run } = useAction();
  const [note, setNote] = useState('');
  const [ev, setEv] = useState({ kind: 'POST_URL', url: '', note: '' });
  const [comment, setComment] = useState('');
  const done = () => { reload(); onChanged(); };

  const move = (status: string) => run(async () => { await api.post(`/admin/smois/tasks/${id}/status`, { status, note: note || undefined }); setNote(''); done(); });
  const addEvidence = () => run(async () => { await api.post(`/admin/smois/tasks/${id}/evidence`, { kind: ev.kind, url: ev.url || undefined, note: ev.note || undefined }); setEv({ kind: 'POST_URL', url: '', note: '' }); done(); });
  const addComment = () => run(async () => { await api.post(`/admin/smois/tasks/${id}/comments`, { body: comment }); setComment(''); done(); });

  return (
    <Modal open onClose={onClose} title={data ? `#${data.number} · ${data.title}` : 'Task'} width={760}>
      {!data ? <Empty>Loading…</Empty> : (
        <div style={{ padding: 20 }}>
          {error && <Notice kind="error">{error}</Notice>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <StatusPill status={data.status} /><StatusPill status={data.priority} />{data.overdue && <Pill tone="bad">Overdue</Pill>}<Pill>{pretty(data.type)}</Pill>
            {data.rule && <Pill>Repeats {data.rule.recurrence.toLowerCase()}</Pill>}
          </div>
          <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.8, marginBottom: 12 }}>
            <div>Assignee: <b style={{ color: T.text }}>{data.assignee?.user.name ?? 'Unassigned'}</b>{data.supporters.length > 0 && <> · With: {data.supporters.map((s) => s.member.user.name).join(', ')}</>} · Set by <b style={{ color: T.text }}>{data.createdByName}</b></div>
            <div>Deadline: <b style={{ color: T.text }}>{fmtDateTime(data.deadline)}</b>{data.completedAt && <> · Completed {fmtDateTime(data.completedAt)}</>}</div>
            {data.account && <div>Account: <PlatformTag platform={data.account.platform} name={data.account.name} /></div>}
            {data.expectedDeliverable && <div>Deliverable: <b style={{ color: T.text }}>{data.expectedDeliverable}</b></div>}
            {data.completionCriteria && <div>Done when: <b style={{ color: T.text }}>{data.completionCriteria}</b></div>}
            {data.description && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{data.description}</div>}
          </div>

          {data.nextStatuses.length > 0 && (
            <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: 12, marginBottom: 14 }}>
              <Field label="Note (needed when returning for changes)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.nextStatuses.map((s) => <Btn key={s} kind={s === 'CANCELLED' ? 'danger' : ['REVISION_REQUIRED'].includes(s) ? 'secondary' : 'primary'} disabled={busy} onClick={() => move(s)}>{STATUS_LABEL[s] ?? pretty(s)}</Btn>)}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 800, color: T.text, margin: '6px 0' }}>Completion evidence</div>
          {data.evidence.length === 0 ? <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>None yet. Evidence is required before submitting.</div> : data.evidence.map((e) => (
            <div key={e.id} style={{ fontSize: 12, padding: '6px 0', borderTop: `1px solid ${T.border}` }}>
              <Pill>{pretty(e.kind)}</Pill> {e.url && <a href={e.url} target="_blank" rel="noreferrer" style={{ color: T.primary }}>{e.url}</a>} {e.note && <span style={{ color: T.textSec }}>{e.note}</span>}
              <div style={{ color: T.textMuted, fontSize: 11 }}>{e.addedByName} · {fmtDateTime(e.createdAt)}</div>
            </div>
          ))}
          {data.canEvidence && !['COMPLETED', 'CANCELLED'].includes(data.status) && (
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr auto', gap: 8, margin: '8px 0 14px' }}>
              <Select value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value })}>{EVIDENCE.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}</Select>
              <Input placeholder="Link (https://…)" value={ev.url} onChange={(e) => setEv({ ...ev, url: e.target.value })} />
              <Input placeholder="Note" value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} />
              <Btn disabled={busy || (!ev.url && !ev.note)} onClick={addEvidence}>Add</Btn>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 800, color: T.text, margin: '10px 0 6px' }}>Discussion</div>
          {data.comments.map((c) => <div key={c.id} style={{ fontSize: 12, padding: '6px 0', borderTop: `1px solid ${T.border}` }}><b style={{ color: T.text }}>{c.authorName}</b> <span style={{ color: T.textMuted }}>{fmtDateTime(c.createdAt)}</span><div style={{ color: T.textSec }}>{c.body}</div></div>)}
          <div style={{ display: 'flex', gap: 8, margin: '8px 0 14px' }}><Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" /><Btn disabled={busy || !comment.trim()} onClick={addComment}>Post</Btn></div>

          <div style={{ fontSize: 12, fontWeight: 800, color: T.text, margin: '10px 0 6px' }}>History</div>
          {data.history.map((h) => (
            <div key={h.id} style={{ fontSize: 11.5, color: T.textSec, padding: '4px 0' }}>
              {fmtDateTime(h.createdAt)} · {h.changedByName ?? 'System'} · {h.fromStatus ? `${pretty(h.fromStatus)} → ` : ''}<b style={{ color: T.text }}>{pretty(h.toStatus)}</b>{h.note ? ` · ${h.note}` : ''}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

interface Rule { id: string; title: string; recurrence: string; dayOfWeek: number | null; dayOfMonth: number | null; dueAfterHours: number; isActive: boolean; assigneeName: string | null; type: string }
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Recurring() {
  const { people } = useSmois();
  const { data, reload, error } = useLoad(() => api.get<{ data: Rule[] }>('/admin/smois/recurring').then((r) => r.data), []);
  const [f, setF] = useState({ title: '', recurrence: 'DAILY', dayOfWeek: '1', dayOfMonth: '1', dueAfterHours: '24', assigneeId: '', type: 'GENERAL' });
  const { busy, error: err, run } = useAction();
  const doers = people.filter((p) => p.memberId && (p.role === 'MANAGER' || p.role === 'MANAGEMENT'));
  const add = () => run(async () => {
    await api.post('/admin/smois/recurring', { title: f.title, recurrence: f.recurrence, type: f.type, dayOfWeek: Number(f.dayOfWeek), dayOfMonth: Number(f.dayOfMonth), dueAfterHours: Number(f.dueAfterHours), assigneeId: f.assigneeId || null });
    setF({ ...f, title: '' }); reload();
  });
  return (
    <div>
      <Notice kind="info">Each rule creates one task per period for its assignee, with its own deadline and history. Checked every 15 minutes.</Notice>
      {(error || err) && <Notice kind="error">{error || err}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14, alignItems: 'end' }}>
        <Field label="Task"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Daily engagement check" /></Field>
        <Field label="Repeats"><Select value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></Select></Field>
        {f.recurrence === 'WEEKLY' && <Field label="Day"><Select value={f.dayOfWeek} onChange={(e) => setF({ ...f, dayOfWeek: e.target.value })}>{DOW.map((d, n) => <option key={d} value={n}>{d}</option>)}</Select></Field>}
        {f.recurrence === 'MONTHLY' && <Field label="Day of month (1–28)"><Input type="number" min={1} max={28} value={f.dayOfMonth} onChange={(e) => setF({ ...f, dayOfMonth: e.target.value })} /></Field>}
        <Field label="Due after (hours)"><Input type="number" min={1} value={f.dueAfterHours} onChange={(e) => setF({ ...f, dueAfterHours: e.target.value })} /></Field>
        <Field label="Assign to"><Select value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}><option value="">Unassigned</option>{doers.map((p) => <option key={p.memberId!} value={p.memberId!}>{p.name}</option>)}</Select></Field>
        <div style={{ paddingBottom: 12 }}><Btn kind="primary" disabled={busy || !f.title.trim()} onClick={add}>Add rule</Btn></div>
      </div>
      {data && data.length === 0 ? <Empty>No recurring tasks yet.</Empty> : data && (
        <Table head={['Task', 'Repeats', 'Assignee', 'Due after', 'Status', '']}>
          {data.map((r) => (
            <tr key={r.id}>
              <Td><b>{r.title}</b></Td>
              <Td>{pretty(r.recurrence)}{r.recurrence === 'WEEKLY' ? ` · ${DOW[r.dayOfWeek ?? 1]}` : r.recurrence === 'MONTHLY' ? ` · day ${r.dayOfMonth}` : ''}</Td>
              <Td>{r.assigneeName ?? '—'}</Td>
              <Td>{r.dueAfterHours}h</Td>
              <Td><Pill tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Paused'}</Pill></Td>
              <Td><Btn small onClick={() => run(async () => { await api.patch(`/admin/smois/recurring/${r.id}`, { isActive: !r.isActive }); reload(); })}>{r.isActive ? 'Pause' : 'Resume'}</Btn></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
