'use client';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Notice, PageHeader, Pill, PlatformTag, Table, Td, fmtDate, pretty, useAction, useLoad, useSmois } from '@/components/smois/ui';

interface Conn { connectors: { id: string; label: string; platforms: string[]; configured: boolean; capabilities: { metrics: boolean; inbound: boolean; publish: boolean } }[];
  integrations: { id: string; accountId: string; provider: string; status: string; tokenExpiresAt: string | null; lastSyncAt: string | null; lastError: string | null }[];
  jobs: { id: string; accountId: string; status: string; trigger: string; startedAt: string; recordsProcessed: number; recordsSkipped: number; attempt: number; error: string | null }[] }
const CONNECT_MSG: Record<string, string> = { ok: 'Connected. The first sync runs within 15 minutes, or press Sync now.', declined: 'Consent was not given, so nothing was connected.', invalid: 'That connection link was not valid or had expired. Start again.', failed: 'The platform did not accept the connection. Check the server log and the developer app settings.' };

type Cap = 'yes' | 'limited' | 'review' | 'no';
interface Data {
  accounts: { id: string; name: string; platform: string; handle: string | null; connectionStatus: string; apiAuthStatus: string; connectedAt: string | null; lastSyncAt: string | null }[];
  matrix: { platform: string; api: string; publish: Cap; metrics: Cap; comments: Cap; messages: Cap; webhooks: Cap; notes: string }[];
  note: string; jobs: unknown[];
}
const CAP: Record<Cap, { label: string; tone: 'good' | 'warn' | 'info' | 'neutral' }> = { yes: { label: 'Yes', tone: 'good' }, limited: { label: 'Limited', tone: 'warn' }, review: { label: 'Needs review', tone: 'info' }, no: { label: 'No', tone: 'neutral' } };

export default function IntegrationsPage() {
  const { theme: T } = useTheme();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>('/admin/smois/integrations').then((r) => r.data), []);
  const { me } = useSmois();
  const conn = useLoad(() => api.get<{ data: Conn }>('/admin/smois/connections').then((r) => r.data), []);
  const { busy, error: actErr, setError, run } = useAction();
  const outcome = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('connect') : null;
  const connected = data?.accounts.filter((a) => a.connectionStatus === 'CONNECTED').length ?? 0;
  const canManage = !!me?.can.manageAccounts;
  const connect = (id: string) => run(async () => { setError(''); const r = await api.post<{ data: { url: string } }>('/admin/smois/connections/' + id + '/connect', {}); window.location.href = r.data.url; });
  const sync = (id: string) => run(async () => { setError(''); await api.post('/admin/smois/connections/' + id + '/sync', {}); conn.reload(); reload(); });
  const drop = (id: string) => { if (window.confirm('Disconnect this account? Readings already stored are kept.')) run(async () => { await api.post('/admin/smois/connections/' + id + '/disconnect', {}); conn.reload(); reload(); }); };

  return (
    <div>
      <PageHeader title="Integration health" sub="Which accounts are linked to their platform, and what each platform's API would let us automate." />
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && (
        <>
          {outcome && CONNECT_MSG[outcome] && <Notice kind={outcome === 'ok' ? 'success' : 'warn'}>{CONNECT_MSG[outcome]}</Notice>}
          {actErr && <Notice kind="error">{actErr}</Notice>}
          <Notice kind={connected ? 'success' : 'info'}>
            {connected ? `${connected} account(s) connected.` : 'No account is connected to a platform API yet.'} Until one is, figures are entered by hand and posts are recorded by a person after publishing. Nothing on the other pages is simulated or pulled from a platform.
          </Notice>

          <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '4px 0 8px' }}>Accounts</div>
          {data.accounts.length === 0 ? <Empty>No accounts registered.</Empty> : (
            <Table head={['Account', 'Connection', 'Authorization', 'Connected', 'Last sync', 'Failed runs (30)', '']}>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <Td><PlatformTag platform={a.platform} name={a.name} /></Td>
                  <Td><Pill tone={a.connectionStatus === 'MANUAL' ? 'neutral' : a.connectionStatus === 'CONNECTED' ? 'good' : 'bad'}>{a.connectionStatus === 'MANUAL' ? 'Tracked manually' : pretty(a.connectionStatus)}</Pill></Td>
                  <Td>{pretty(a.apiAuthStatus)}</Td><Td>{a.connectedAt ? fmtDate(a.connectedAt) : '—'}</Td><Td>{a.lastSyncAt ? fmtDate(a.lastSyncAt) : 'Never'}</Td><Td>{conn.data?.jobs.filter((j) => j.accountId === a.id && j.status === 'FAILED').length ?? 0}</Td>
                  <Td>{canManage && conn.data && (() => {
                    const c = conn.data.connectors.find((x) => x.platforms.includes(a.platform));
                    const i = conn.data.integrations.find((x) => x.accountId === a.id && x.status !== 'REVOKED');
                    if (!c) return <span style={{ fontSize: 11, color: T.textMuted }}>No connector</span>;
                    return (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {i && i.status === 'CONNECTED' && <Btn small disabled={busy} onClick={() => sync(a.id)}>Sync now</Btn>}
                        {i && i.status === 'CONNECTED' && <Btn small kind="ghost" disabled={busy} onClick={() => drop(a.id)}>Disconnect</Btn>}
                        {(!i || i.status !== 'CONNECTED') && <Btn small kind="primary" disabled={busy || !c.configured} onClick={() => connect(a.id)}>{c.configured ? (i ? 'Reconnect' : 'Connect') : 'Not set up on server'}</Btn>}
                      </div>
                    );
                  })()}</Td>
                </tr>
              ))}
            </Table>
          )}

          {conn.data && conn.data.jobs.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '22px 0 8px' }}>Recent sync runs</div>
              <Table head={['Started', 'Account', 'Trigger', 'Result', 'Stored', 'Skipped', 'Attempt', 'Detail']}>
                {conn.data.jobs.slice(0, 10).map((j) => (
                  <tr key={j.id}>
                    <Td>{fmtDate(j.startedAt)}</Td><Td>{data.accounts.find((a) => a.id === j.accountId)?.name ?? '—'}</Td><Td>{pretty(j.trigger)}</Td>
                    <Td><Pill tone={j.status === 'OK' ? 'good' : j.status === 'RETRY' ? 'warn' : 'bad'}>{pretty(j.status)}</Pill></Td>
                    <Td>{j.recordsProcessed}</Td><Td>{j.recordsSkipped}</Td><Td>{j.attempt}</Td><Td style={{ fontSize: 12, color: T.textSec }}>{j.error ?? ''}</Td>
                  </tr>
                ))}
              </Table>
            </>
          )}

          <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '22px 0 8px' }}>Platform capability matrix</div>
          <Notice kind="warn">{data.note}</Notice>
          <Table head={['Platform', 'API', 'Publish', 'Metrics', 'Comments', 'Messages', 'Webhooks', 'Notes']}>
            {data.matrix.map((m) => (
              <tr key={m.platform}>
                <Td><PlatformTag platform={m.platform} /></Td><Td style={{ fontSize: 12 }}>{m.api}</Td>
                {(['publish', 'metrics', 'comments', 'messages', 'webhooks'] as const).map((k) => <Td key={k}><Pill tone={CAP[m[k]].tone}>{CAP[m[k]].label}</Pill></Td>)}
                <Td style={{ fontSize: 12, color: T.textSec, minWidth: 260 }}>{m.notes}</Td>
              </tr>
            ))}
          </Table>

          <Card title="What connecting an account needs" style={{ marginTop: 18 }}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.textSec, lineHeight: 1.8 }}>
              <li>A developer app per platform, registered by the company (not an employee), with the company as owner and recovery contact.</li>
              <li>The platform&apos;s review or business verification where the table says &quot;Needs review&quot;. This takes days to weeks and is outside our control.</li>
              <li>Encrypted storage for access tokens, refresh and expiry handling, and a revoke path. Tokens must never reach the browser or the logs.</li>
              <li>A sync job per account with retries, rate-limit handling and a health row here, so a broken connection is visible.</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
