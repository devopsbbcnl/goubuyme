'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import {
  Btn, ContractStatusPill, Days, Empty, Input, Notice, PageHeader, Pager, Pill, Select, Table, Td, STEP_LABEL, downloadCsv, fmtDate, label, useAction, useDebounced, useLoad, usePwm,
} from '@/components/pwm/ui';

interface Row {
  id: string; reference: string; contractType: string; status: string; expiryDate: string | null; daysRemaining: number | null; bucket: string; renewalStep: string | null; renewalId: string | null;
  officerName: string | null; employee: { id: string; employeeNo: string; firstName: string; lastName: string; department: { name: string } | null };
}
interface Resp { data: Row[]; counts: Record<string, number>; bucketLabels: Record<string, string>; pagination: { totalPages: number } }

const ORDER = ['EXPIRED_ACTION', 'TODAY', 'D1_3', 'D4_7', 'D8_30', 'D31_60', 'D61_90', 'LATER'];

function Tracker() {
  const { theme: T } = useTheme();
  const { me } = usePwm();
  const sp = useSearchParams();
  const [bucket, setBucket] = useState(sp.get('bucket') ?? '');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'tracker' | 'all'>('tracker');
  const [pg, setPg] = useState(1);
  const dq = useDebounced(q);
  const { data, loading, error } = useLoad(() => api.get<Resp>(`/admin/pwm/contracts?view=${view}&page=${pg}&limit=50${bucket ? `&bucket=${bucket}` : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`), [view, bucket, dq, pg]);
  const { error: exportError, run } = useAction();
  const tone = (k: string) => (k === 'EXPIRED_ACTION' || k === 'TODAY' || k === 'D1_3' ? 'bad' : k === 'D4_7' || k === 'D8_30' ? 'warn' : 'neutral') as 'bad' | 'warn' | 'neutral';
  return (
    <div>
      <PageHeader title="Contracts" sub="Every contract by how close it is to expiry. A contract that expires without a decision is flagged, never silently ended."
        actions={<>
          <Select value={view} onChange={(e) => { setView(e.target.value as 'tracker' | 'all'); setBucket(''); setPg(1); }}><option value="tracker">Expiry tracker (in force)</option><option value="all">All contracts</option></Select>
          {me?.can.manageContracts && <Btn onClick={() => run(() => downloadCsv('/admin/pwm/contracts/export.csv', 'contract-expiry.csv'))}>Export CSV</Btn>}
        </>} />
      {(error || exportError) && <Notice kind="error">{error || exportError}</Notice>}
      {view === 'tracker' && data && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={() => { setBucket(''); setPg(1); }} style={{ all: 'unset', cursor: 'pointer' }}><Pill tone={bucket === '' ? 'brand' : 'neutral'}>All in force</Pill></button>
          {ORDER.map((k) => (
            <button key={k} onClick={() => { setBucket(k); setPg(1); }} style={{ all: 'unset', cursor: 'pointer', opacity: bucket && bucket !== k ? 0.55 : 1 }}>
              <Pill tone={data.counts[k] ? tone(k) : 'neutral'}>{data.bucketLabels[k]}: {data.counts[k] ?? 0}</Pill>
            </button>
          ))}
        </div>
      )}
      <div style={{ marginBottom: 12, maxWidth: 360 }}><Input placeholder="Search employee, ID or contract reference" value={q} onChange={(e) => { setQ(e.target.value); setPg(1); }} /></div>
      {loading && !data ? <Empty>Loading…</Empty> : !data?.data.length ? <Empty>No contracts here.</Empty> : (
        <>
          <Table head={['Employee', 'Department', 'Contract', 'Type', 'Status', 'Expiry', 'Renewal stage', 'HR officer']}>
            {data.data.map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/pwm/employees/${c.employee.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{c.employee.firstName} {c.employee.lastName}</Link><div style={{ fontSize: 11, color: T.textSec }}>{c.employee.employeeNo}</div></Td>
                <Td>{c.employee.department?.name ?? '—'}</Td><Td><Link href={`/pwm/contracts/${c.id}`} style={{ color: T.primary, fontWeight: 700 }}>{c.reference}</Link></Td><Td>{label(c.contractType)}</Td>
                <Td><ContractStatusPill status={c.status} /></Td>
                <Td>{c.expiryDate ? <div style={{ display: 'grid', gap: 4 }}><span>{fmtDate(c.expiryDate)}</span><Days days={c.daysRemaining} /></div> : '—'}</Td>
                <Td>{c.renewalStep ? <Link href={`/pwm/renewals/${c.renewalId}`} style={{ color: 'inherit' }}>{STEP_LABEL[c.renewalStep]}</Link> : '—'}</Td><Td>{c.officerName ?? <Pill tone="warn">Not set</Pill>}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={pg} pages={data.pagination.totalPages} onPage={setPg} />
        </>
      )}
    </div>
  );
}

export default function ContractsPage() {
  return <Suspense fallback={<Empty>Loading…</Empty>}><Tracker /></Suspense>;
}
