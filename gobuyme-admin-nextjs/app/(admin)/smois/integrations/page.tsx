'use client';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card, Empty, Notice, PageHeader, Pill, PlatformTag, Table, Td, fmtDate, pretty, useLoad } from '@/components/smois/ui';

type Cap = 'yes' | 'limited' | 'review' | 'no';
interface Data {
  accounts: { id: string; name: string; platform: string; handle: string | null; connectionStatus: string; apiAuthStatus: string; connectedAt: string | null; lastSyncAt: string | null }[];
  matrix: { platform: string; api: string; publish: Cap; metrics: Cap; comments: Cap; messages: Cap; webhooks: Cap; notes: string }[];
  note: string; jobs: unknown[];
}
const CAP: Record<Cap, { label: string; tone: 'good' | 'warn' | 'info' | 'neutral' }> = { yes: { label: 'Yes', tone: 'good' }, limited: { label: 'Limited', tone: 'warn' }, review: { label: 'Needs review', tone: 'info' }, no: { label: 'No', tone: 'neutral' } };

export default function IntegrationsPage() {
  const { theme: T } = useTheme();
  const { data, loading, error } = useLoad(() => api.get<{ data: Data }>('/admin/smois/integrations').then((r) => r.data), []);
  const connected = data?.accounts.filter((a) => a.connectionStatus === 'CONNECTED').length ?? 0;

  return (
    <div>
      <PageHeader title="Integration health" sub="Which accounts are linked to their platform, and what each platform's API would let us automate." />
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && (
        <>
          <Notice kind={connected ? 'success' : 'info'}>
            {connected ? `${connected} account(s) connected.` : 'No account is connected to a platform API yet.'} Until one is, figures are entered by hand and posts are recorded by a person after publishing. Nothing on the other pages is simulated or pulled from a platform.
          </Notice>

          <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '4px 0 8px' }}>Accounts</div>
          {data.accounts.length === 0 ? <Empty>No accounts registered.</Empty> : (
            <Table head={['Account', 'Connection', 'Authorization', 'Connected', 'Last sync', 'Failed jobs']}>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <Td><PlatformTag platform={a.platform} name={a.name} /></Td>
                  <Td><Pill tone={a.connectionStatus === 'MANUAL' ? 'neutral' : a.connectionStatus === 'CONNECTED' ? 'good' : 'bad'}>{a.connectionStatus === 'MANUAL' ? 'Tracked manually' : pretty(a.connectionStatus)}</Pill></Td>
                  <Td>{pretty(a.apiAuthStatus)}</Td><Td>{a.connectedAt ? fmtDate(a.connectedAt) : '—'}</Td><Td>{a.lastSyncAt ? fmtDate(a.lastSyncAt) : 'Never'}</Td><Td>0</Td>
                </tr>
              ))}
            </Table>
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
