'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ContentDetail } from '@/components/smois/ContentDetail';
import { api } from '@/lib/api';
import {
  Empty, Notice, PageHeader, Pill, PlatformTag, StatusPill, Table, Tabs, Td, fmtDateTime, useLoad, useSmois,
} from '@/components/smois/ui';

interface Row {
  id: string; status: string; caption: string; version: number; submittedAt: string | null; overdue: boolean; canReview: boolean;
  creatorName: string | null; submittedByName: string | null;
  account: { name: string; platform: string }; content: { id: string; title: string };
  reviews: { id: string; decision: string; reviewerName: string | null; comments: string | null; createdAt: string }[];
}
type View = 'queue' | 'mine' | 'feedback' | 'history';

export default function ApprovalsPage() {
  return <Suspense fallback={<Empty>Loading…</Empty>}><Inner /></Suspense>;
}

function Inner() {
  const { me } = useSmois();
  const initial = (useSearchParams().get('tab') as View) || (me?.can.approve ? 'queue' : 'mine');
  const [view, setView] = useState<View>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Row[] }>(`/admin/smois/approvals?view=${view}`).then((r) => r.data), [view]);

  const tabs: { id: View; label: string }[] = [
    ...(me?.can.approve || me?.can.viewAll ? [{ id: 'queue' as View, label: 'Review queue' }] : []),
    { id: 'mine', label: 'My submissions' }, { id: 'feedback', label: 'Feedback for me' }, { id: 'history', label: 'Decisions' },
  ];

  return (
    <div>
      <PageHeader title="Approval centre" sub="Nothing goes out until someone other than its author has approved it. Delays over the reminder time are chased automatically." />
      <Tabs value={view} onChange={setView} items={tabs} />
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.length === 0 ? <Empty>Nothing here.</Empty> : data && (
        <Table head={['Content', 'Account', 'Status', 'Author', 'Submitted', view === 'history' ? 'Latest decision' : '']}>
          {data.map((r) => (
            <tr key={r.id} onClick={() => setOpen(r.content.id)} style={{ cursor: 'pointer' }}>
              <Td><b>{r.content.title}</b><div style={{ fontSize: 11, opacity: 0.7, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.caption}</div></Td>
              <Td><PlatformTag platform={r.account.platform} name={r.account.name} /></Td>
              <Td><StatusPill status={r.status} /></Td>
              <Td>{r.creatorName}</Td>
              <Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.submittedAt)} {r.overdue && <Pill tone="bad">Overdue</Pill>}</Td>
              <Td>{view === 'history' && r.reviews[0] ? <><StatusPill status={r.reviews[0].decision} /><div style={{ fontSize: 11, opacity: 0.7 }}>{r.reviews[0].reviewerName}</div></> : view === 'queue' && !r.canReview ? <Pill>Yours, needs another reviewer</Pill> : null}</Td>
            </tr>
          ))}
        </Table>
      )}
      {open && <ContentDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
