'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';

export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface Task {
  id: string; title: string; description: string | null; dueAt: string | null;
  priority: TaskPriority; status: TaskStatus; completedAt: string | null; createdAt: string;
  assignee: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  relatedUser: { id: string; name: string; role: string; vendor: { businessName: string } | null } | null;
  lead: { id: string; name: string; type: string } | null;
  ticket: { id: string; number: number; subject: string } | null;
}

export interface TaskLinks { relatedUserId?: string; leadId?: string; ticketId?: string }

interface Agent { id: string; name: string; role: string }

/** Local datetime-input value (YYYY-MM-DDTHH:mm) for a date. */
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const dueLabel = (dueAt: string | null, now = Date.now()) => {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const diffDays = Math.round((new Date(due).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  const time = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const overdue = due.getTime() < now;
  const text = diffDays === 0 ? `Today ${time}` : diffDays === 1 ? `Tomorrow ${time}` : diffDays === -1 ? `Yesterday ${time}`
    : due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { text: overdue ? `Overdue · ${text}` : text, overdue, today: diffDays === 0 };
};

export function TaskList({ tasks, onChanged, emptyText = 'No tasks.', showLinks = true }: {
  tasks: Task[]; onChanged: () => void; emptyText?: string; showLinks?: boolean;
}) {
  const { theme: T } = useTheme();
  const [editing, setEditing] = useState<Task | null>(null);
  const [error, setError] = useState('');

  const setStatus = async (task: Task, status: TaskStatus) => {
    setError('');
    try { await api.patch(`/admin/crm/tasks/${task.id}`, { status }); onChanged(); } catch (err) { setError((err as Error).message); }
  };

  if (tasks.length === 0) return <div style={{ fontSize: 13, color: T.textSec, padding: '6px 0' }}>{emptyText}</div>;

  return (
    <div>
      {error && <div style={{ fontSize: 12, color: T.error, marginBottom: 6 }}>{error}</div>}
      {tasks.map(t => {
        const due = dueLabel(t.dueAt);
        const done = t.status !== 'OPEN';
        const who = t.relatedUser ? (t.relatedUser.vendor?.businessName ?? t.relatedUser.name) : null;
        return (
          <div key={t.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
              checked={done}
              onChange={() => setStatus(t, done ? 'OPEN' : 'DONE')}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: T.primary, cursor: 'pointer' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <button onClick={() => setEditing(t)} style={{
                background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: 700, color: done ? T.textMuted : T.text, textDecoration: done ? 'line-through' : 'none',
              }}>
                {t.priority === 'HIGH' && !done && <span style={{ color: T.error }}>! </span>}{t.title}
              </button>
              {t.description && <div style={{ fontSize: 12, color: T.textSec, marginTop: 2, whiteSpace: 'pre-wrap' }}>{t.description}</div>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: T.textMuted, marginTop: 4 }}>
                {due && !done && (
                  <span style={{ color: due.overdue ? T.error : due.today ? T.warning : T.textMuted, fontWeight: due.overdue || due.today ? 700 : 400 }}>{due.text}</span>
                )}
                <span>{t.assignee ? t.assignee.name : 'Unassigned'}</span>
                {showLinks && who && <Link href={`/crm/profiles/${t.relatedUser!.id}`} style={{ color: T.primary }}>{who}</Link>}
                {showLinks && t.lead && <Link href={`/crm/pipeline/${t.lead.id}`} style={{ color: T.primary }}>Lead: {t.lead.name}</Link>}
                {showLinks && t.ticket && <Link href={`/crm/inbox?ticket=${t.ticket.id}`} style={{ color: T.primary }}>Ticket #{t.ticket.number}</Link>}
                {done && t.completedAt && <span>{t.status === 'DONE' ? 'Done' : 'Cancelled'} {new Date(t.completedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          </div>
        );
      })}
      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

export function TaskModal({ task, links, defaultTitle, onClose, onSaved }: {
  task?: Task; links?: TaskLinks; defaultTitle?: string; onClose: () => void; onSaved: () => void;
}) {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isOps = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';
  const [agents, setAgents] = useState<Agent[]>([]);
  const [title, setTitle] = useState(task?.title ?? defaultTitle ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueAt, setDueAt] = useState(task?.dueAt ? toLocalInput(new Date(task.dueAt)) : toLocalInput(new Date(Date.now() + 24 * 3_600_000)));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'NORMAL');
  const [assigneeId, setAssigneeId] = useState(task ? (task.assignee?.id ?? '') : (user?.id ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data: Agent[] }>('/admin/crm/tickets/agents').then(res => setAgents(res.data)).catch(() => {});
  }, []);

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '10px 12px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: T.textSec, display: 'block' };
  const assignable = isOps ? agents : agents.filter(a => a.id === user?.id);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { title, description: description || null, dueAt: dueAt ? new Date(dueAt).toISOString() : null, priority, assigneeId: assigneeId || null };
      if (task) await api.patch(`/admin/crm/tasks/${task.id}`, payload);
      else await api.post('/admin/crm/tasks', { ...payload, ...links });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    setSaving(true);
    try { await api.del(`/admin/crm/tasks/${task.id}`); onSaved(); } catch (err) { setError((err as Error).message); setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={task ? 'Edit task' : 'New task'} width={480}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={label}>Task
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="Call back about missing item" style={{ ...field, marginTop: 6 }} autoFocus />
        </label>
        <label style={label}>Details (optional)
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={2000} style={{ ...field, marginTop: 6, resize: 'vertical' }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={label}>Due
            <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} style={{ ...field, marginTop: 6 }} />
          </label>
          <label style={label}>Priority
            <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} style={{ ...field, marginTop: 6 }}>
              <option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option>
            </select>
          </label>
        </div>
        <label style={label}>Assignee
          <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={{ ...field, marginTop: 6 }}>
            <option value="">Team (unassigned)</option>
            {task?.assignee && !assignable.some(a => a.id === task.assignee!.id) && <option value={task.assignee.id}>{task.assignee.name}</option>}
            {assignable.map(a => <option key={a.id} value={a.id}>{a.id === user?.id ? `${a.name} (me)` : a.name}</option>)}
          </select>
        </label>
        {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {task ? (
            <button onClick={remove} disabled={saving} style={{ background: 'none', border: 'none', color: T.error, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
          ) : <span />}
          <button onClick={save} disabled={saving || !title.trim()} style={{
            padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', opacity: saving || !title.trim() ? 0.6 : 1,
          }}>{saving ? 'Saving…' : task ? 'Save' : 'Create task'}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Tasks linked to one record (person, lead or ticket), with a "New task" button. */
export function LinkedTasks({ links, defaultTitle }: { links: TaskLinks; defaultTitle?: string }) {
  const { theme: T } = useTheme();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [creating, setCreating] = useState(false);
  const query = new URLSearchParams(Object.entries(links).filter(([, v]) => v) as Array<[string, string]>).toString();

  const load = () => api.get<{ data: { tasks: Task[] } }>(`/admin/crm/tasks?${query}`).then(res => setTasks(res.data.tasks)).catch(() => setTasks([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [query]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tasks</span>
        <button onClick={() => setCreating(true)} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ New task</button>
      </div>
      {tasks === null ? <div style={{ fontSize: 12, color: T.textSec }}>Loading…</div> : <TaskList tasks={tasks} onChanged={load} emptyText="No tasks yet." showLinks={false} />}
      {creating && <TaskModal links={links} defaultTitle={defaultTitle} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}
