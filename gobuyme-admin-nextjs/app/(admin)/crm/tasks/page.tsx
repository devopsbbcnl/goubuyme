'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/crm/shared';
import { Task, TaskList, TaskModal } from '@/components/crm/tasks';

type View = 'mine' | 'unassigned' | 'overdue' | 'team' | 'done';
interface Counts { mine: number; mineOverdue: number; unassigned: number; overdue: number }

export default function TasksPage() {
  const { theme: T } = useTheme();
  const [view, setView] = useState<View>('mine');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() =>
    api.get<{ data: { tasks: Task[]; counts: Counts } }>(`/admin/crm/tasks?view=${view}`)
      .then(res => { setTasks(res.data.tasks); setCounts(res.data.counts); setError(''); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false)),
  [view]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const changed = () => {
    load();
    window.dispatchEvent(new Event('gbm:pending-counts-updated'));
  };

  const tabs: Array<{ key: View; label: string; count?: number; alert?: boolean }> = [
    { key: 'mine', label: 'My tasks', count: counts?.mine, alert: (counts?.mineOverdue ?? 0) > 0 },
    { key: 'unassigned', label: 'Unassigned', count: counts?.unassigned },
    { key: 'overdue', label: 'Overdue (team)', count: counts?.overdue, alert: (counts?.overdue ?? 0) > 0 },
    { key: 'team', label: 'All open' },
    { key: 'done', label: 'Done' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Tasks</div>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {counts ? `${counts.mine} open for you${counts.mineOverdue ? `, ${counts.mineOverdue} overdue` : ''}. You get an email when a task goes overdue and a digest at 8am.` : 'Loading…'}
          </div>
        </div>
        <button onClick={() => setCreating(true)} style={{ padding: '10px 18px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          New task
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setView(t.key)} style={{
            padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            border: view === t.key ? `1px solid ${T.primary}` : 'none',
            background: view === t.key ? T.primaryTint : T.surface2,
            color: view === t.key ? T.primary : t.alert ? T.error : T.textSec,
          }}>{t.label}{t.count !== undefined ? ` ${t.count}` : ''}</button>
        ))}
      </div>

      <Card style={{ paddingTop: 6, paddingBottom: 6 }}>
        {loading && tasks.length === 0 ? <div style={{ fontSize: 13, color: T.textSec, padding: '10px 0' }}>Loading tasks…</div>
          : error ? <div style={{ fontSize: 13, color: T.error, padding: '10px 0' }}>{error}</div>
          : <TaskList tasks={tasks} onChanged={changed} emptyText={view === 'mine' ? 'Nothing on your list. 🎉' : 'No tasks here.'} />}
      </Card>

      {creating && <TaskModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); changed(); }} />}
    </div>
  );
}
