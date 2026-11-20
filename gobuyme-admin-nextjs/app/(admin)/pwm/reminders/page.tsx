'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Btn, Empty, Notice, PageHeader, Pager, Pill, Stat, Table, Tabs, Td, fmtDate, fmtDateTime, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface Rem {
  id: string; kind: string; tierKey: string; severity: string; title: string; link: string | null; recipientName: string; recipientRole: string; channel: string; status: string;
  sentAt: string | null; acknowledgedAt: string | null; requiresAck: boolean; attempts: number; lastError: string | null; cancelReason: string | null; canAcknowledge: boolean; canResend: boolean;
}
interface Up { contractId: string; reference: string; employee: string; tier: string; severity: string; sendsOn: string; daysAway: number }
interface Engine { lastRunAt?: string; ok?: boolean; healthy: boolean; ageMinutes: number | null; queued: number; failed: number; contractsWithoutOfficer: number; error?: string }
type View = 'mine' | 'upcoming' | 'sent' | 'unacknowledged' | 'failed' | 'cancelled';

export default function RemindersPage() {
  const { me } = usePwm();
  const admin = !!me?.can.manageReminders || me?.level === 'EXECUTIVE' || me?.level === 'AUDITOR';
  const [view, setView] = useState<View>(admin ? 'upcoming' : 'mine');
  const [pg, setPg] = useState(1);
  const list = useLoad(() => (view === 'upcoming' ? Promise.resolve(null) : api.get<{ data: Rem[]; pagination: { totalPages: number } }>(`/admin/pwm/reminders?view=${view}&page=${pg}&limit=40`)), [view, pg]);
  const up = useLoad(() => (view === 'upcoming' ? api.get<{ data: Up[] }>('/admin/pwm/reminders/upcoming').then((r) => r.data) : Promise.resolve(null)), [view]);
  const engine = useLoad(() => (me?.can.viewReminders ? api.get<{ data: Engine }>('/admin/pwm/engine').then((r) => r.data).catch(() => null) : Promise.resolve(null)), []);
  const { busy, error, run } = useAction();
  const act = (id: string, what: 'ack' | 'resend') => run(async () => { await api.post(`/admin/pwm/reminders/${id}/${what}`, {}); list.reload(); engine.reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); });
  const e = engine.data;
  return (
    <div>
      <PageHeader title="Automated reminders" sub="What was sent, to whom, whether it arrived and whether someone acknowledged it. Only a recorded decision stops a contract's reminders."
        actions={me?.can.manageTeam ? <Btn disabled={busy} onClick={() => run(async () => { await api.post('/admin/pwm/engine/run', {}); engine.reload(); list.reload(); })}>Run engine now</Btn> : undefined} />
      {error && <Notice kind="error">{error}</Notice>}
      {e && (
        <>
          {!e.healthy && <Notice kind="error">The reminder engine has not run in the last 2.5 hours{e.error ? ` (last error: ${e.error})` : ''}. Contract alerts may be late.</Notice>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Stat label="Engine" value={e.healthy ? 'Healthy' : 'Check'} sub={e.lastRunAt ? `last run ${fmtDateTime(e.lastRunAt)}` : 'has not run yet'} /><Stat label="Queued" value={e.queued} /><Stat label="Failed" value={e.failed} />
            <Stat label="Contracts with no HR officer" value={e.contractsWithoutOfficer} sub="alerts go to HR admins" />
          </div>
        </>
      )}
      <Tabs<View> value={view} onChange={(v) => { setView(v); setPg(1); }} items={[{ id: 'mine', label: 'For me' }, ...(admin ? [{ id: 'upcoming' as View, label: 'Upcoming' }, { id: 'sent' as View, label: 'Sent' }, { id: 'unacknowledged' as View, label: 'Not acknowledged' }, { id: 'failed' as View, label: 'Failed' }, { id: 'cancelled' as View, label: 'Cancelled' }] : [])]} />
      {view === 'upcoming' ? (up.loading && !up.data ? <Empty>Loading…</Empty> : !up.data?.length ? <Empty>No reminders scheduled.</Empty> : (
        <Table head={['Sends on', 'Tier', 'Employee', 'Contract']}>
          {up.data.map((u, i) => <tr key={i}><Td>{fmtDate(u.sendsOn)} <span style={{ opacity: 0.6 }}>({u.daysAway === 0 ? 'today' : `in ${u.daysAway} days`})</span></Td><Td><Pill tone={u.severity === 'CRITICAL' ? 'bad' : u.severity === 'URGENT' ? 'warn' : 'neutral'}>{u.tier}</Pill></Td><Td>{u.employee}</Td><Td><Link href={`/pwm/contracts/${u.contractId}`}>{u.reference}</Link></Td></tr>)}
        </Table>
      )) : list.loading && !list.data ? <Empty>Loading…</Empty> : !list.data?.data.length ? <Empty>Nothing here.</Empty> : (
        <>
          <Table head={['Reminder', 'To', 'Channel', 'Status', 'Sent', 'Acknowledged', '']}>
            {list.data.data.map((r) => (
              <tr key={r.id}>
                <Td><b>{r.link ? <Link href={r.link} style={{ color: 'inherit' }}>{r.title}</Link> : r.title}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{label(r.kind)} · {r.tierKey}</div></Td>
                <Td>{r.recipientName}<div style={{ fontSize: 11, opacity: 0.7 }}>{label(r.recipientRole)}</div></Td><Td>{label(r.channel)}</Td>
                <Td><Pill tone={r.status === 'FAILED' ? 'bad' : r.status === 'CANCELLED' ? 'neutral' : r.status === 'QUEUED' ? 'warn' : 'good'}>{label(r.status)}</Pill>{r.status === 'FAILED' && <div style={{ fontSize: 11 }}>{r.attempts} attempts{r.lastError ? `: ${r.lastError}` : ''}</div>}{r.cancelReason && <div style={{ fontSize: 11 }}>{r.cancelReason}</div>}</Td>
                <Td>{r.sentAt ? fmtDateTime(r.sentAt) : '—'}</Td><Td>{r.acknowledgedAt ? fmtDateTime(r.acknowledgedAt) : r.requiresAck && r.sentAt ? <Pill tone="warn">Waiting</Pill> : '—'}</Td>
                <Td><div style={{ display: 'flex', gap: 6 }}>{r.canAcknowledge && r.requiresAck && <Btn small kind="primary" disabled={busy} onClick={() => act(r.id, 'ack')}>Acknowledge</Btn>}{r.canResend && <Btn small disabled={busy} onClick={() => act(r.id, 'resend')}>Resend</Btn>}</div></Td>
              </tr>
            ))}
          </Table>
          <Pager page={pg} pages={list.data.pagination.totalPages} onPage={setPg} />
        </>
      )}
    </div>
  );
}
