'use client';
import { api } from '@/lib/api';
import { Btn, Empty, Notice, PageHeader, Pill, Table, Td, fmtDate, label, useAction, useLoad } from '@/components/pwm/ui';

interface A { id: string; tag: string; name: string; category: string; status: string; assignedAt: string; conditionOut: string | null; acknowledgedAt: string | null; returnedAt: string | null }

export default function MyAssets() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: A[] }>('/my-hr/assets').then((r) => r.data), []);
  const { busy, error: actionError, run } = useAction();
  const pending = data?.filter((a) => a.status === 'ACTIVE' && !a.acknowledgedAt).length ?? 0;
  return (
    <div>
      <PageHeader title="My assets" sub="Company property assigned to you. Please confirm when you receive something, and return it when you leave or it is no longer needed." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {pending > 0 && <Notice kind="warn">{pending} item{pending === 1 ? '' : 's'} waiting for you to acknowledge.</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No company property is assigned to you.</Empty> : (
        <Table head={['Item', 'Tag', 'Given', 'Condition', 'Status', '']}>
          {data.map((a) => <tr key={a.id}><Td><b>{a.name}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{label(a.category)}</div></Td><Td>{a.tag}</Td><Td>{fmtDate(a.assignedAt)}</Td><Td>{a.conditionOut ? label(a.conditionOut) : '—'}</Td><Td><Pill tone={a.status === 'ACTIVE' ? 'info' : 'neutral'}>{a.status === 'ACTIVE' ? 'In your care' : label(a.status)}</Pill>{a.returnedAt && <div style={{ fontSize: 11 }}>{fmtDate(a.returnedAt)}</div>}</Td><Td>{a.status === 'ACTIVE' && !a.acknowledgedAt && <Btn small kind="primary" disabled={busy} onClick={() => run(async () => { await api.post(`/my-hr/assets/${a.id}/acknowledge`, {}); reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); })}>I have received it</Btn>}</Td></tr>)}
        </Table>
      )}
    </div>
  );
}
