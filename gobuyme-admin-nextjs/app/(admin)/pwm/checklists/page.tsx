'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Empty, Notice, PageHeader, Pill, Table, Tabs, Td, EmpStatusPill, fmtDate, label, useLoad } from '@/components/pwm/ui';

interface C { id: string; kind: string; startDate: string; percent: number; done: number; total: number; overdue: number; mandatoryOpen: number; employee: { id: string; employeeNo: string; firstName: string; lastName: string; jobTitle: string; status: string; department: { name: string } | null } }
type View = 'ALL' | 'ONBOARDING' | 'OFFBOARDING' | 'mine';

export default function ChecklistsPage() {
  const [view, setView] = useState<View>('ALL');
  const { data, loading, error } = useLoad(() => api.get<{ data: C[] }>(`/admin/pwm/checklists?status=OPEN${view === 'mine' ? '&mine=1' : view !== 'ALL' ? `&kind=${view}` : ''}`).then((r) => r.data), [view]);
  return (
    <div>
      <PageHeader title="Onboarding & offboarding" sub="Every joiner and leaver has a tracked checklist with an owner and a due date for each task." />
      {error && <Notice kind="error">{error}</Notice>}
      <Tabs<View> value={view} onChange={setView} items={[{ id: 'ALL', label: 'All open' }, { id: 'ONBOARDING', label: 'Onboarding' }, { id: 'OFFBOARDING', label: 'Offboarding' }, { id: 'mine', label: 'My tasks' }]} />
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No open checklists.</Empty> : (
        <Table head={['Employee', 'Type', 'Started', 'Progress', 'Needs attention', 'Status']}>
          {data.map((c) => (
            <tr key={c.id}>
              <Td><Link href={`/pwm/checklists/${c.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{c.employee.firstName} {c.employee.lastName}</Link><div style={{ fontSize: 11, opacity: 0.7 }}>{c.employee.employeeNo} · {c.employee.department?.name ?? 'No department'}</div></Td>
              <Td>{label(c.kind)}</Td><Td>{fmtDate(c.startDate)}</Td><Td>{c.done}/{c.total} ({c.percent}%)</Td>
              <Td>{c.overdue > 0 ? <Pill tone="bad">{c.overdue} overdue</Pill> : c.mandatoryOpen > 0 ? <Pill tone="warn">{c.mandatoryOpen} required open</Pill> : <Pill tone="good">Ready to close</Pill>}</Td><Td><EmpStatusPill status={c.employee.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
