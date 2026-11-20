'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Days, Empty, Notice, PageHeader, Pill, SlaPill, Stat, STEP_LABEL, DECISION_LABEL, Tabs, fmtDate, useLoad } from '@/components/pwm/ui';

interface R {
  id: string; step: string; recommendation: string | null; decision: string | null; due: string | null; sla: string; daysToExpiry: number | null; officerName: string | null;
  contract: { id: string; reference: string; expiryDate: string | null }; employee: { id: string; employeeNo: string; firstName: string; lastName: string; department: { name: string } | null }; closedReason: string | null;
}
const COLS = ['RECOMMENDATION', 'DECISION', 'PREPARATION', 'ISSUANCE', 'SIGNATURE'];

export default function RenewalsPage() {
  const { theme: T } = useTheme();
  const [view, setView] = useState<'open' | 'done'>('open');
  const { data, loading, error } = useLoad(() => api.get<{ data: { renewals: R[]; summary: Record<string, number> } }>(`/admin/pwm/renewals?view=${view}`).then((r) => r.data), [view]);
  return (
    <div>
      <PageHeader title="Renewals" sub="Each expiring contract moves from the department head's recommendation to a management decision, a new contract, issue and signature." />
      {error && <Notice kind="error">{error}</Notice>}
      <Tabs value={view} onChange={setView} items={[{ id: 'open', label: 'Pipeline' }, { id: 'done', label: 'Finished (90 days)' }]} />
      {loading && !data ? <Empty>Loading…</Empty> : !data ? null : view === 'done' ? (
        data.renewals.length === 0 ? <Empty>Nothing finished recently.</Empty> : data.renewals.map((r) => (
          <Link key={r.id} href={`/pwm/renewals/${r.id}`} style={{ textDecoration: 'none' }}><div style={{ padding: '10px 0', borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: 13 }}><b>{r.employee.firstName} {r.employee.lastName}</b> · {r.contract.reference} · {r.decision ? DECISION_LABEL[r.decision] : '—'} <span style={{ color: T.textSec }}>{r.closedReason ?? ''}</span></div></Link>
        ))
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Stat label="Recommendations outstanding" value={data.summary.recommendationsOutstanding} /><Stat label="Awaiting decision" value={data.summary.awaitingDecision} />
            <Stat label="Approved, not signed" value={data.summary.approvedNotSigned} /><Stat label="Overdue steps" value={data.summary.overdue} />
          </div>
          {data.renewals.length === 0 ? <Empty>No renewals in progress. They open automatically 30 days before a contract expires.</Empty> : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS.length}, minmax(210px, 1fr))`, gap: 10, overflowX: 'auto' }}>
              {COLS.map((col) => (
                <div key={col} style={{ background: T.surface2, borderRadius: 4, padding: 10, minHeight: 120 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, marginBottom: 8, textTransform: 'uppercase' }}>{STEP_LABEL[col]} ({data.renewals.filter((r) => r.step === col).length})</div>
                  {data.renewals.filter((r) => r.step === col).map((r) => (
                    <Link key={r.id} href={`/pwm/renewals/${r.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.employee.firstName} {r.employee.lastName}</div>
                        <div style={{ fontSize: 11, color: T.textSec, margin: '2px 0 6px' }}>{r.employee.department?.name ?? 'No department'} · {r.contract.reference}</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><SlaPill sla={r.sla} /><Days days={r.daysToExpiry} />{r.due && <Pill>Due {fmtDate(r.due)}</Pill>}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
