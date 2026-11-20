'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Input, Notice, PageHeader, Pill, Select, fmtDate, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface Task { id: string; stage: string; title: string; ownerRole: string; assigneeName: string | null; assigneeUserId: string | null; dueDate: string | null; mandatory: boolean; status: string; note: string | null; overdue: boolean; canUpdate: boolean; completedByName: string | null }
interface Detail { id: string; kind: string; status: string; startDate: string; canManage: boolean; tasks: Task[]; employee: { id: string; employeeNo: string; firstName: string; lastName: string; status: string; finalWorkingDay: string | null } }

export default function ChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const { theme: T } = useTheme();
  const { people } = usePwm();
  const { data: c, loading, error, reload } = useLoad(() => api.get<{ data: Detail }>(`/admin/pwm/checklists/${id}`).then((r) => r.data), [id]);
  const { busy, error: actionError, run } = useAction();
  const [rehire, setRehire] = useState('');
  const [msg, setMsg] = useState('');
  if (loading && !c) return <Empty>Loading…</Empty>;
  if (error || !c) return <Notice kind="error">{error || 'Checklist not found.'}</Notice>;
  const patch = (t: Task, body: Record<string, unknown>) => run(async () => { await api.patch(`/admin/pwm/checklist-tasks/${t.id}`, body); reload(); });
  const stages = [...new Set(c.tasks.map((t) => t.stage))];
  const open = c.status === 'OPEN';
  const complete = () => run(async () => { const r = await api.post<{ message: string }>(`/admin/pwm/checklists/${c.id}/complete`, rehire ? { rehireEligible: rehire === 'yes' } : {}); setMsg(r.message); reload(); });
  return (
    <div>
      <PageHeader title={`${label(c.kind)}: ${c.employee.firstName} ${c.employee.lastName}`} sub={`${c.employee.employeeNo} · started ${fmtDate(c.startDate)}${c.employee.finalWorkingDay && c.kind === 'OFFBOARDING' ? ` · final working day ${fmtDate(c.employee.finalWorkingDay)}` : ''}`}
        actions={<><Link href={`/pwm/employees/${c.employee.id}`}><Btn>Open employee</Btn></Link><Pill tone={open ? 'info' : 'good'}>{label(c.status)}</Pill></>} />
      {(actionError) && <Notice kind="error">{actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      {stages.map((s) => (
        <div key={s} style={{ marginBottom: 12 }}>
          <Card title={s}>
            {c.tasks.filter((t) => t.stage === s).map((t) => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'start' }}>
                <input type="checkbox" checked={t.status === 'DONE'} disabled={!open || !t.canUpdate || busy} onChange={(e) => patch(t, { status: e.target.checked ? 'DONE' : 'PENDING' })} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.status === 'DONE' || t.status === 'SKIPPED' ? T.textMuted : T.text, textDecoration: t.status === 'DONE' ? 'line-through' : 'none' }}>{t.title} {!t.mandatory && <span style={{ fontWeight: 400, color: T.textMuted }}>(optional)</span>}</div>
                  <div style={{ fontSize: 11, color: T.textSec, marginTop: 2 }}>{label(t.ownerRole)} · {t.assigneeName ?? 'Unassigned'} · due {t.dueDate ? fmtDate(t.dueDate) : '—'}{t.completedByName ? ` · done by ${t.completedByName}` : ''}{t.note ? ` · ${t.note}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {t.overdue && <Pill tone="bad">Overdue</Pill>}{t.status === 'SKIPPED' && <Pill>Skipped</Pill>}
                  {open && c.canManage && <select value={t.assigneeUserId ?? ''} onChange={(e) => patch(t, { assigneeUserId: e.target.value || null })} style={{ fontSize: 12, padding: 4, maxWidth: 140 }}><option value="">Assign…</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select>}
                </div>
              </div>
            ))}
          </Card>
        </div>
      ))}
      {open && c.canManage && (
        <Card title="Close this checklist">
          {c.kind === 'OFFBOARDING' && ['RESIGNED', 'TERMINATED'].includes(c.employee.status) && (
            <div style={{ maxWidth: 300, marginBottom: 10 }}><Select value={rehire} onChange={(e) => setRehire(e.target.value)}><option value="">Eligible for rehire?</option><option value="yes">Yes</option><option value="no">No</option></Select></div>
          )}
          <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>{c.kind === 'ONBOARDING' ? 'Closing confirms onboarding and moves the employee out of Pending onboarding.' : 'Closing archives the record after clearance. It is kept read-only; nothing is deleted.'} All required tasks must be done first.</div>
          <Btn kind="primary" disabled={busy} onClick={complete}>{c.kind === 'ONBOARDING' ? 'Confirm onboarding' : 'Close offboarding'}</Btn>
          <span style={{ display: 'none' }}><Input readOnly value="" /></span>
        </Card>
      )}
    </div>
  );
}
