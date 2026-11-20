'use client';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card, Days, Empty, Notice, PageHeader, Pill, Stat, ContractStatusPill, fmtDate, useLoad, usePwm } from '@/components/pwm/ui';

interface ContractBrief { id: string; reference: string; status: string; expiryDate: string | null; daysRemaining: number | null; employee: { id: string; employeeNo: string; firstName: string; lastName: string; department: { name: string } | null } }
interface Dash {
  scope: string; headcount: number; pendingOnboarding: number; newHires30d: number; leavers12m: number; turnoverPct12m: number | null; avgTenureYears: number | null;
  byDepartment: { name: string; count: number }[]; byStatus: { name: string; count: number }[]; byType: { name: string; count: number }[];
  buckets: { key: string; label: string; count: number }[]; expiredActionRequired: ContractBrief[]; expiringSoon: ContractBrief[]; expiringThisMonth: number;
  renewals: { open: number; recommendationsOutstanding: number; awaitingDecision: number; approvedNotSigned: number; overdue: number };
  probationEnding: { id: string; employeeNo: string; firstName: string; lastName: string; probationEndDate: string; daysRemaining: number }[];
  documentsExpiring30d: number; waiting: { statusRequests: number; contractApprovals: number; payChanges: number };
  gaps: Record<string, number>; engine: { lastRunAt: string | null; ageMinutes: number | null; healthy: boolean } | null;
}

function Bars({ rows }: { rows: { name: string; count: number }[] }) {
  const { theme: T } = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <Empty>No data yet.</Empty>;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 34px', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: T.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <div style={{ background: T.surface2, borderRadius: 4, height: 10 }}><div style={{ width: `${(r.count / max) * 100}%`, background: T.primary, height: 10, borderRadius: 4 }} /></div>
          <b style={{ color: T.text, textAlign: 'right' }}>{r.count}</b>
        </div>
      ))}
    </div>
  );
}

function ContractList({ rows, empty }: { rows: ContractBrief[]; empty: string }) {
  const { theme: T } = useTheme();
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div>
      {rows.map((c) => (
        <Link key={c.id} href={`/pwm/contracts/${c.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{c.employee.firstName} {c.employee.lastName}</div>
              <div style={{ fontSize: 11, color: T.textSec }}>{c.employee.employeeNo} · {c.employee.department?.name ?? 'No department'} · {c.reference} · {fmtDate(c.expiryDate)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}><ContractStatusPill status={c.status} /><Days days={c.daysRemaining} /></div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function PwmDashboard() {
  const { theme: T } = useTheme();
  const { me } = usePwm();
  const { data: d, loading, error } = useLoad(() => api.get<{ data: Dash }>('/admin/pwm/dashboard').then((r) => r.data), []);
  if (loading && !d) return <Empty>Loading…</Empty>;
  if (error || !d) return <Notice kind="error">{error || 'Could not load the dashboard.'}</Notice>;
  const waiting = d.waiting.statusRequests + d.waiting.contractApprovals + d.waiting.payChanges;
  const gapRows: [string, number][] = [
    ['Current staff with no contract in force', d.gaps.employeesWithoutContract], ['Staff with no department', d.gaps.employeesWithoutDepartment], ['Departments with no head', d.gaps.departmentsWithoutHead],
    ['Missing work email', d.gaps.missingWorkEmail], ['Missing date of birth', d.gaps.missingDob], ['Missing emergency contact', d.gaps.missingEmergencyContact],
    ['No reporting manager', d.gaps.missingManager], ['No HR officer assigned', d.gaps.missingHrOfficer],
  ];
  return (
    <div>
      <PageHeader title="People & Workforce" sub={d.scope === 'DEPARTMENT' ? 'Your department only.' : 'Who works here, on what terms, and what must happen next.'} />
      {d.engine && !d.engine.healthy && <Notice kind="error">The reminder engine has not reported in {d.engine.ageMinutes === null ? 'yet' : `for ${d.engine.ageMinutes} minutes`}. Contract expiry reminders may be late. Check the backend job.</Notice>}
      {d.expiredActionRequired.length > 0 && <Notice kind="error">{d.expiredActionRequired.length} contract{d.expiredActionRequired.length === 1 ? ' has' : 's have'} expired with no decision recorded. Employment has not ended; someone must decide.</Notice>}
      {waiting > 0 && <Notice kind="warn">Waiting on you: {d.waiting.statusRequests > 0 && <><Link href="/pwm/approvals">{d.waiting.statusRequests} status request{d.waiting.statusRequests === 1 ? '' : 's'}</Link> </>}{d.waiting.contractApprovals > 0 && <><Link href="/pwm/approvals">{d.waiting.contractApprovals} contract approval{d.waiting.contractApprovals === 1 ? '' : 's'}</Link> </>}{d.waiting.payChanges > 0 && <Link href="/pwm/approvals">{d.waiting.payChanges} pay change{d.waiting.payChanges === 1 ? '' : 's'}</Link>}</Notice>}
      {me && me.unacknowledged > 0 && <Notice kind="info"><Link href="/pwm/reminders">{me.unacknowledged} reminder{me.unacknowledged === 1 ? '' : 's'} need your acknowledgement.</Link></Notice>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="Current employees" value={d.headcount} sub={`${d.pendingOnboarding} onboarding`} />
        <Stat label="Expiring this month" value={d.expiringThisMonth} sub="contracts" />
        <Stat label="Renewals open" value={d.renewals.open} sub={`${d.renewals.overdue} overdue`} />
        <Stat label="Awaiting decision" value={d.renewals.awaitingDecision} sub={`${d.renewals.recommendationsOutstanding} recommendations due`} />
        <Stat label="Approved, not signed" value={d.renewals.approvedNotSigned} />
        <Stat label="New hires (30 days)" value={d.newHires30d} />
        <Stat label="Turnover (12 months)" value={d.turnoverPct12m === null ? 'n/a' : `${d.turnoverPct12m}%`} sub={`${d.leavers12m} left`} />
        <Stat label="Average tenure" value={d.avgTenureYears === null ? 'n/a' : `${d.avgTenureYears} yrs`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <Card title="Contract expiry" right={<Link href="/pwm/contracts" style={{ fontSize: 12, color: T.primary }}>Open tracker</Link>}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {d.buckets.filter((b) => b.key !== 'NO_EXPIRY' && b.count > 0).map((b) => <Link key={b.key} href={`/pwm/contracts?bucket=${b.key}`} style={{ textDecoration: 'none' }}><Pill tone={b.key === 'EXPIRED_ACTION' || b.key === 'TODAY' || b.key === 'D1_3' ? 'bad' : b.key === 'D4_7' || b.key === 'D8_30' ? 'warn' : 'neutral'}>{b.label}: {b.count}</Pill></Link>)}
          </div>
          <ContractList rows={[...d.expiredActionRequired, ...d.expiringSoon].slice(0, 8)} empty="Nothing is expiring in the next 30 days." />
        </Card>
        <Card title="Headcount by department"><Bars rows={d.byDepartment} /></Card>
        <Card title="By employment type"><Bars rows={d.byType} /></Card>
        <Card title="By status"><Bars rows={d.byStatus} /></Card>
        <Card title="Probation ending soon">
          {d.probationEnding.length === 0 ? <Empty>No probation reviews due in 30 days.</Empty> : d.probationEnding.map((p) => (
            <Link key={p.id} href={`/pwm/employees/${p.id}`} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text }}>
              <span>{p.firstName} {p.lastName} <span style={{ color: T.textSec }}>({p.employeeNo})</span></span><Pill tone={p.daysRemaining <= 7 ? 'bad' : 'warn'}>{fmtDate(p.probationEndDate)}</Pill>
            </Link>
          ))}
          {d.documentsExpiring30d > 0 && <div style={{ marginTop: 10, fontSize: 12, color: T.textSec }}>{d.documentsExpiring30d} certificates or documents expire within 30 days.</div>}
        </Card>
        <Card title="Records that need attention">
          {gapRows.filter(([, n]) => n > 0).length === 0 ? <Empty>Every record is complete.</Empty> : gapRows.filter(([, n]) => n > 0).map(([l, n]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13 }}><span style={{ color: T.textSec }}>{l}</span><b style={{ color: T.text }}>{n}</b></div>
          ))}
        </Card>
      </div>
    </div>
  );
}
