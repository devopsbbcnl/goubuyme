'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, Empty, Notice, PageHeader, Pill, Table, Td, fmtDate, label, useLoad } from '@/components/pwm/ui';

interface R { id: string; status: string; cycle: string; dueDate: string; overdue: boolean; employee: string | null; managerRating: number | null; selfRating: number | null }

export default function MyReviews() {
  const { data, loading, error } = useLoad(() => api.get<{ data: { mine: R[]; toAssess: R[] } }>('/my-hr/reviews').then((r) => r.data), []);
  const step = (r: R, mine: boolean) => (r.status === 'ACKNOWLEDGED' ? 'Done' : r.status === 'SELF' ? (mine ? 'Your self-assessment' : 'Waiting for their self-assessment (you can go ahead)') : r.status === 'MANAGER' ? (mine ? 'With your manager' : 'Your assessment') : mine ? 'Read and acknowledge' : 'Hold the discussion');
  const rows = (list: R[], mine: boolean) => (
    <Table head={[mine ? 'Review' : 'Person', 'Due', 'Next step', 'Rating', '']}>
      {list.map((r) => (
        <tr key={r.id}><Td><b>{mine ? r.cycle : r.employee}</b>{!mine && <div style={{ fontSize: 11, opacity: 0.7 }}>{r.cycle}</div>}</Td><Td>{fmtDate(r.dueDate)} {r.overdue && <Pill tone="bad">Overdue</Pill>}</Td><Td>{step(r, mine)}</Td><Td>{r.status === 'ACKNOWLEDGED' ? `${r.managerRating ?? '—'} / 5` : '—'}</Td><Td><Link href={`/my-hr/reviews/${r.id}`} style={{ fontWeight: 700 }}>{r.status === 'ACKNOWLEDGED' ? 'View' : 'Open'}</Link></Td></tr>
      ))}
    </Table>
  );
  return (
    <div>
      <PageHeader title="Performance reviews" sub="Assess yourself, then your manager assesses you and you talk it through. Once you acknowledge, the review is closed." />
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : (
        <>
          {data && data.toAssess.length > 0 && <div style={{ marginBottom: 14 }}><Card title="People I assess">{rows(data.toAssess, false)}</Card></div>}
          <Card title="My reviews">{!data?.mine.length ? <Empty>No reviews yet. They appear when a review cycle starts.</Empty> : rows(data.mine, true)}</Card>
        </>
      )}
    </div>
  );
}
