'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/components/crm/shared';
import { CampaignStatus, CampaignStatusBadge } from '@/components/crm/marketing';

interface Row {
  id: string; name: string; channels: Array<'SMS' | 'EMAIL' | 'PUSH'>; status: CampaignStatus; audienceSize: number;
  startedAt: string | null; completedAt: string | null; createdAt: string; createdBy: { name: string };
  deliveries: Partial<Record<'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED', number>>;
}

export default function LeadBroadcastsPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const canCreate = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data: Row[] }>('/admin/crm/lead-broadcasts')
      .then(r => setRows(r.data)).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, []);

  const th: React.CSSProperties = { padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const msg = (text: string, color: string) => <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', fontSize: 13, color }}>{text}</td></tr>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Lead broadcasts</div>
          <div style={{ fontSize: 13, color: T.textSec }}>SMS and email to vendor and rider leads in the pipeline. Every message carries an opt-out link.</div>
        </div>
        {canCreate && (
          <Link href="/crm/lead-broadcasts/new" style={{ padding: '10px 18px', borderRadius: 4, background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            New broadcast
          </Link>
        )}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: T.surface2 }}>{['Broadcast', 'Channels', 'Status', 'Delivered', 'When'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {loading ? msg('Loading broadcasts…', T.textSec)
                : error ? msg(error, T.error)
                : rows.length === 0 ? msg('No lead broadcasts yet.', T.textSec)
                : rows.map(r => {
                  const sent = r.deliveries.SENT ?? 0;
                  const failed = r.deliveries.FAILED ?? 0;
                  const attempted = sent + failed + (r.deliveries.PENDING ?? 0) + (r.deliveries.SENDING ?? 0);
                  return (
                    <tr key={r.id} onClick={() => router.push(`/crm/lead-broadcasts/${r.id}`)} style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.surface2)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: T.textMuted }}>by {r.createdBy.name} · {r.audienceSize} leads</div>
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{r.channels.map(c => (c === 'SMS' ? 'SMS' : 'Email')).join(', ')}</td>
                      <td style={{ padding: '13px 16px' }}><CampaignStatusBadge status={r.status} /></td>
                      <td style={{ padding: '13px 16px', fontSize: 12, color: T.text }}>
                        {attempted ? `${sent} / ${attempted}` : '—'}
                        {failed > 0 && <span style={{ color: T.error }}> · {failed} failed</span>}
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>{fmtDateTime(r.completedAt ?? r.startedAt ?? r.createdAt)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
