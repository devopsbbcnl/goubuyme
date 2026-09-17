'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { CrmRole, RoleBadge, fmtDateTime } from '@/components/crm/shared';
import { CHANNEL_LABEL, CampaignChannel, CampaignStatus, CampaignStatusBadge, MarketingTabs } from '@/components/crm/marketing';

interface CampaignRow {
  id: string; name: string; status: CampaignStatus; channels: CampaignChannel[]; title: string;
  scheduledAt: string | null; startedAt: string | null; completedAt: string | null; audienceSize: number | null; createdAt: string;
  segment: { id: string; name: string; role: CrmRole } | null;
  automation: { id: string; name: string } | null;
  createdBy: { name: string };
  deliveries: Partial<Record<'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED', number>>;
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' }, { key: 'DRAFT', label: 'Drafts' }, { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'SENDING', label: 'Sending' }, { key: 'SENT', label: 'Sent' }, { key: 'automation', label: 'From automations' },
];

export default function CampaignsPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const canCreate = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => {
      const params = new URLSearchParams();
      if (filter === 'automation') params.set('source', 'automation');
      else if (filter) params.set('status', filter);
      api.get<{ data: CampaignRow[] }>(`/admin/crm/campaigns?${params}`)
        .then(res => { setRows(res.data); setError(''); })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    };
    setLoading(true);
    load();
    // Keep "Sending" progress moving without a manual refresh.
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Campaigns</div>
          <div style={{ fontSize: 13, color: T.textSec }}>Send push, email and SMS messages to a segment and track the orders they drive.</div>
        </div>
        {canCreate && (
          <Link href="/crm/campaigns/new" style={{ padding: '10px 18px', borderRadius: 4, background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            New campaign
          </Link>
        )}
      </div>
      <MarketingTabs />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            border: filter === f.key ? `1px solid ${T.primary}` : 'none',
            background: filter === f.key ? T.primaryTint : T.surface2, color: filter === f.key ? T.primary : T.textSec,
          }}>{f.label}</button>
        ))}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Campaign', 'Audience', 'Channels', 'Status', 'Delivered', 'When'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading campaigns…</td></tr>
              ) : error ? (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', fontSize: 13, color: T.error }}>{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', fontSize: 13, color: T.textSec }}>No campaigns yet.</td></tr>
              ) : rows.map(c => {
                const sent = c.deliveries.SENT ?? 0;
                const total = Object.values(c.deliveries).reduce((a, b) => a + (b ?? 0), 0);
                const when = c.completedAt ?? c.startedAt ?? c.scheduledAt ?? c.createdAt;
                return (
                  <tr key={c.id} onClick={() => router.push(`/crm/campaigns/${c.id}`)} style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = T.surface2)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: T.textMuted }}>{c.automation ? `Automation · ${c.automation.name}` : `by ${c.createdBy.name}`}</div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>
                      {c.segment ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{c.segment.name} <RoleBadge role={c.segment.role} /></span> : c.automation ? 'Automation audience' : '—'}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{c.channels.map(ch => CHANNEL_LABEL[ch]).join(', ')}</td>
                    <td style={{ padding: '13px 16px' }}><CampaignStatusBadge status={c.status} /></td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: T.text }}>
                      {total ? `${sent.toLocaleString()} / ${total.toLocaleString()}` : '—'}
                      {(c.deliveries.FAILED ?? 0) > 0 && <span style={{ color: T.error }}> · {c.deliveries.FAILED} failed</span>}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>
                      {c.status === 'SCHEDULED' ? 'Sends ' : ''}{fmtDateTime(when)}
                    </td>
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
