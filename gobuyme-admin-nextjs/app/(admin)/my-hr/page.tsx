'use client';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, ContractStatusPill, Days, Empty, EmpStatusPill, Notice, PageHeader, Pill, Stat, fmtDate, label, useAction, useLoad } from '@/components/pwm/ui';

interface Me {
  profile: { fullName: string; employeeNo: string; jobTitle: string; departmentName: string | null; manager: string | null; hireDate: string; status: string; employmentType: string; location: string | null };
  contract: { reference: string; contractType: string; status: string; commencementDate: string; expiryDate: string | null; daysRemaining: number | null; noticeValue: number | null; noticeUnit: string | null } | null;
  openTasks: number; policiesToAcknowledge: number; announcements: { id: string; title: string; body: string; pinned: boolean; publishAt: string }[];
}
interface Task { id: string; title: string; stage: string; status: string; dueDate: string | null; kind: string; about: string }

export default function MyHrHome() {
  const { theme: T } = useTheme();
  const me = useLoad(() => api.get<{ data: Me }>('/my-hr/me').then((r) => r.data), []);
  const tasks = useLoad(() => api.get<{ data: Task[] }>('/my-hr/tasks').then((r) => r.data), []);
  const { busy, error, run } = useAction();
  if (me.loading && !me.data) return <Empty>Loading…</Empty>;
  if (me.error || !me.data) return <Notice kind="error">{me.error || 'No employee record is linked to this login. Ask HR to link it.'}</Notice>;
  const d = me.data;
  const open = tasks.data?.filter((t) => t.status !== 'DONE') ?? [];
  const done = (id: string) => run(async () => { await api.patch(`/my-hr/tasks/${id}`, { status: 'DONE' }); tasks.reload(); me.reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); });
  return (
    <div>
      <PageHeader title={`Hello, ${d.profile.fullName.split(' ')[0]}`} sub={`${d.profile.jobTitle}${d.profile.departmentName ? ` · ${d.profile.departmentName}` : ''} · ${d.profile.employeeNo}`} actions={<EmpStatusPill status={d.profile.status} />} />
      {error && <Notice kind="error">{error}</Notice>}
      {d.policiesToAcknowledge > 0 && <Notice kind="warn"><Link href="/my-hr/policies">{d.policiesToAcknowledge} polic{d.policiesToAcknowledge === 1 ? 'y needs' : 'ies need'} your acknowledgement.</Link></Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Stat label="Started" value={fmtDate(d.profile.hireDate)} /><Stat label="Reports to" value={d.profile.manager ?? '—'} /><Stat label="Open tasks" value={d.openTasks} /><Stat label="Policies to read" value={d.policiesToAcknowledge} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <Card title="My contract">
          {!d.contract ? <Empty>No contract is on record yet. Contact HR if this looks wrong.</Empty> : (
            <div style={{ fontSize: 13, color: T.text, lineHeight: 2 }}>
              <b>{d.contract.reference}</b> · {label(d.contract.contractType)} <ContractStatusPill status={d.contract.status} /><br />
              Starts {fmtDate(d.contract.commencementDate)} · {d.contract.expiryDate ? <>ends {fmtDate(d.contract.expiryDate)} <Days days={d.contract.daysRemaining} /></> : 'no end date'}<br />
              {d.contract.noticeValue ? <>Notice period: {d.contract.noticeValue} {(d.contract.noticeUnit ?? '').toLowerCase()}</> : null}
            </div>
          )}
        </Card>
        <Card title="My tasks">
          {open.length === 0 ? <Empty>Nothing waiting for you.</Empty> : open.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: T.text }}><b>{t.title}</b><div style={{ fontSize: 11, color: T.textSec }}>{t.stage}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}</div></div>
              <Btn small kind="primary" disabled={busy} onClick={() => done(t.id)}>Done</Btn>
            </div>
          ))}
        </Card>
        <Card title="Announcements">
          {d.announcements.length === 0 ? <Empty>No announcements.</Empty> : d.announcements.map((a) => (
            <div key={a.id} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{a.title} {a.pinned && <Pill tone="brand">Pinned</Pill>}</div>
              <div style={{ fontSize: 12, color: T.textSec, whiteSpace: 'pre-wrap' }}>{a.body}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
