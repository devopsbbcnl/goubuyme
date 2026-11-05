'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import {
  Card, Empty, Field, Input, Notice, PageHeader, PLATFORMS, Pill, PlatformTag, Select, StatusPill, fmtDateTime, pretty,
  useLoad, useSmois,
} from '@/components/smois/ui';

interface Dash {
  scope: 'mine' | 'department';
  period: { key: string; label: string; from: string; to: string };
  accounts: { total: number; unassigned: number; apiConnected: number; byPlatform: { platform: string; count: number }[] };
  content: { created: number; awaitingApproval: number; approved: number; scheduled: number; published: number; failedPublications: number; rejected: number; overdueDeadlines: number };
  staff: { activeManagers: number; tasks: { assigned: number; completed: number; pending: number; overdue: number; awaitingReview: number } };
  upcoming: { id: string; status: string; scheduledAt: string | null; plannedAt: string | null; content: { id: string; title: string }; account: { name: string; platform: string } }[];
  me: { feedbackWaiting: number; submissions: { status: string; count: number }[] };
  dataIntegrity: { source: string; status: string; asOf: string; unavailable: { metric: string; reason: string }[] };
}

const PERIODS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['lastWeek', 'Last week'], ['month', 'This month'], ['lastMonth', 'Last month'],
  ['quarter', 'This quarter'], ['lastQuarter', 'Last quarter'], ['year', 'This year'], ['lastYear', 'Last year'], ['custom', 'Custom range'],
];

function Kpi({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: 'bad' | 'warn' }) {
  const { theme: T } = useTheme();
  const color = tone === 'bad' && Number(value) > 0 ? T.error : tone === 'warn' && Number(value) > 0 ? T.warning : T.text;
  const body = (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '14px 16px', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
      {href && <div style={{ fontSize: 11, color: T.primary, marginTop: 4, fontWeight: 600 }}>View →</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{body}</Link> : body;
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>{children}</div>
);
const Heading = ({ children }: { children: React.ReactNode }) => {
  const { theme: T } = useTheme();
  return <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.5, margin: '4px 0 10px' }}>{children}</div>;
};

export default function SmoisOverview() {
  const { theme: T } = useTheme();
  const { me, people } = useSmois();
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [platform, setPlatform] = useState('');
  const [employee, setEmployee] = useState('');
  const [scope, setScope] = useState<'department' | 'mine'>(me?.can.viewAll ? 'department' : 'mine');

  const qs = new URLSearchParams({ period, ...(period === 'custom' && from ? { from: new Date(from).toISOString() } : {}), ...(period === 'custom' && to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}), ...(platform ? { platform } : {}), ...(employee ? { employeeId: employee } : {}), scope });
  const { data, loading, error } = useLoad(() => api.get<{ data: Dash }>(`/admin/smois/dashboard?${qs}`).then((r) => r.data), [qs.toString()]);

  const range = (extra = '') => `from=${encodeURIComponent(data?.period.from ?? '')}&to=${encodeURIComponent(data?.period.to ?? '')}${extra}`;

  return (
    <div>
      <PageHeader
        title={scope === 'mine' ? 'My dashboard' : 'Social media department'}
        sub={`Welcome, ${me?.user.name}. Every figure here is counted from SMOIS records. Platform metrics (followers, reach, engagement) appear once accounts are connected through their APIs.`}
      />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Field label="Period"><Select value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          {period === 'custom' && <>
            <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </>}
          <Field label="Platform"><Select value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></Field>
          {me?.can.viewAll && <>
            <Field label="Employee"><Select value={employee} onChange={(e) => { setEmployee(e.target.value); if (e.target.value) setScope('department'); }}><option value="">Everyone</option>{people.filter((p) => p.role !== 'SUPER').map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</Select></Field>
            <Field label="View"><Select value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'department')}><option value="department">Whole department</option><option value="mine">Only me</option></Select></Field>
          </>}
        </div>
      </Card>

      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data && <Empty>Loading…</Empty>}
      {data && (
        <>
          {data.me.feedbackWaiting > 0 && (
            <Notice kind="warn">{data.me.feedbackWaiting} of your posts {data.me.feedbackWaiting === 1 ? 'has' : 'have'} reviewer feedback waiting. <Link href="/smois/approvals?tab=feedback" style={{ color: 'inherit', textDecoration: 'underline' }}>Open feedback</Link></Notice>
          )}

          <Heading>Content · {data.period.label}</Heading>
          <Grid>
            <Kpi label="Created" value={data.content.created} href={`/smois/content`} />
            <Kpi label="Awaiting approval" value={data.content.awaitingApproval} href="/smois/approvals" tone="warn" />
            <Kpi label="Approved" value={data.content.approved} href="/smois/approvals?tab=history" />
            <Kpi label="Scheduled (upcoming)" value={data.content.scheduled} href="/smois/calendar" />
            <Kpi label="Published" value={data.content.published} href={`/smois/publishing?${range()}`} />
            <Kpi label="Failed publications" value={data.content.failedPublications} href="/smois/publishing?status=PUBLISH_FAILED" tone="bad" />
            <Kpi label="Rejected" value={data.content.rejected} href="/smois/approvals?tab=history" />
            <Kpi label="Overdue to publish" value={data.content.overdueDeadlines} href="/smois/publishing?status=SCHEDULED" tone="bad" />
          </Grid>

          <Heading>Tasks</Heading>
          <Grid>
            <Kpi label="Assigned (period)" value={data.staff.tasks.assigned} href="/smois/tasks?view=all" />
            <Kpi label="Completed (period)" value={data.staff.tasks.completed} href="/smois/tasks?view=done" />
            <Kpi label="Pending now" value={data.staff.tasks.pending} href="/smois/tasks" />
            <Kpi label="Overdue" value={data.staff.tasks.overdue} href="/smois/tasks?view=overdue" tone="bad" />
            {scope === 'department' && <Kpi label="Awaiting review" value={data.staff.tasks.awaitingReview} href="/smois/tasks?view=review" tone="warn" />}
            {scope === 'department' && <Kpi label="Active managers" value={data.staff.activeManagers} href="/smois/team" />}
          </Grid>

          <Heading>Accounts</Heading>
          <Grid>
            <Kpi label="Registered accounts" value={data.accounts.total} href="/smois/accounts" />
            <Kpi label="Without an assignee" value={data.accounts.unassigned} href="/smois/accounts" tone="warn" />
            <Kpi label="Linked through an API" value={data.accounts.apiConnected} />
          </Grid>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Card title="Coming up">
              {data.upcoming.length === 0 ? <Empty>Nothing planned.</Empty> : data.upcoming.map((u) => (
                <Link key={u.id} href={`/smois/content?open=${u.content.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.content.title}</div>
                      <div style={{ fontSize: 11, color: T.textSec, marginTop: 2 }}><PlatformTag platform={u.account.platform} name={u.account.name} /> · {fmtDateTime(u.scheduledAt ?? u.plannedAt)}</div>
                    </div>
                    <StatusPill status={u.status} />
                  </div>
                </Link>
              ))}
            </Card>

            <Card title="Where the figures come from">
              <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.6 }}>
                <div><b style={{ color: T.text }}>Source:</b> {data.dataIntegrity.source}</div>
                <div><b style={{ color: T.text }}>Status:</b> <Pill tone="good">Verified</Pill> {data.dataIntegrity.status.replace('Verified: ', '')}</div>
                <div><b style={{ color: T.text }}>Period:</b> {fmtDateTime(data.period.from)} – {fmtDateTime(data.period.to)}</div>
                <div><b style={{ color: T.text }}>As of:</b> {fmtDateTime(data.dataIntegrity.asOf)}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.textSec, margin: '14px 0 6px', textTransform: 'uppercase' }}>Not available yet</div>
              {data.dataIntegrity.unavailable.map((u) => (
                <div key={u.metric} style={{ fontSize: 12, color: T.textSec, padding: '6px 0', borderTop: `1px solid ${T.border}` }}>
                  <b style={{ color: T.text }}>{u.metric}.</b> {u.reason}
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
