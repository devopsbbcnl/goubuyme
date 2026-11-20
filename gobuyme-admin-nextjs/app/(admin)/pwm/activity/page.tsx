'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Empty, Input, Notice, PageHeader, Pager, Table, Td, downloadCsv, fmtDateTime, label, useAction, useLoad } from '@/components/pwm/ui';

interface Row { id: string; at: string; action: string; entity: string; entityId: string; by: string; ip: string | null; meta: { reason?: string; before?: unknown; after?: unknown } | null }

export default function ActivityPage() {
  const { theme: T } = useTheme();
  const [pg, setPg] = useState(1);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = `page=${pg}&limit=50${action ? `&action=${encodeURIComponent(action.toUpperCase())}` : ''}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;
  const { data, loading, error } = useLoad(() => api.get<{ data: Row[]; pagination: { totalPages: number; total: number } }>(`/admin/pwm/activity?${qs}`), [qs]);
  const { error: exportError, run } = useAction();
  return (
    <div>
      <PageHeader title="Activity log" sub="Every change to HR records, who made it, when and why. Entries cannot be edited or deleted, even by a database administrator." actions={<Btn onClick={() => run(() => downloadCsv(`/admin/pwm/activity/export.csv?${qs}`, 'pwm-activity.csv'))}>Export CSV</Btn>} />
      {(error || exportError) && <Notice kind="error">{error || exportError}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Input placeholder="Action, e.g. STATUS_CHANGED" value={action} onChange={(e) => { setAction(e.target.value); setPg(1); }} /><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPg(1); }} /><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPg(1); }} />
      </div>
      {loading && !data ? <Empty>Loading…</Empty> : !data?.data.length ? <Empty>No activity matches.</Empty> : (
        <>
          <Table head={['When', 'Who', 'Action', 'Record', 'Reason']}>
            {data.data.map((r) => <tr key={r.id}><Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</Td><Td>{r.by}</Td><Td><b>{label(r.action)}</b></Td><Td style={{ fontSize: 12, color: T.textSec }}>{r.entity.replace(/^Pwm/, '')} {r.entityId.slice(0, 8)}</Td><Td style={{ fontSize: 12 }}>{r.meta?.reason ?? ''}</Td></tr>)}
          </Table>
          <Pager page={pg} pages={data.pagination.totalPages} onPage={setPg} />
        </>
      )}
    </div>
  );
}
