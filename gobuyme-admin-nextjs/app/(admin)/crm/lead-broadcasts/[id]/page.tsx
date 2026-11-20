'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Card, SectionLabel, fmtDateTime } from '@/components/crm/shared';
import { CampaignStatus, CampaignStatusBadge } from '@/components/crm/marketing';

interface Detail {
  id: string; name: string; channels: Array<'SMS' | 'EMAIL' | 'PUSH'>; body: string; emailSubject: string | null; status: CampaignStatus;
  audienceSize: number; startedAt: string | null; completedAt: string | null; createdAt: string; createdBy: { id: string; name: string };
  stats: {
    channels: Record<string, Record<'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED', number>>;
    reasons: Array<{ status: 'FAILED' | 'SKIPPED'; reason: string; count: number }>;
  };
}

const STATUS_KEYS = ['SENT', 'PENDING', 'SENDING', 'FAILED', 'SKIPPED'] as const;
const STATUS_LABEL = { SENT: 'Sent', PENDING: 'Waiting', SENDING: 'Sending', FAILED: 'Failed', SKIPPED: 'Skipped' } as const;

export default function LeadBroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [stopping, setStopping] = useState(false);

  const load = useCallback(() =>
    api.get<{ data: Detail }>(`/admin/crm/lead-broadcasts/${id}`).then(r => { setData(r.data); setError(''); }).catch(e => setError((e as Error).message)),
  [id]);
  useEffect(() => { load(); }, [load]);
  // Keep the numbers moving while messages are still going out.
  useEffect(() => {
    if (data?.status !== 'SENDING') return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [data?.status, load]);

  const stop = async () => {
    setStopping(true);
    try { await api.post(`/admin/crm/lead-broadcasts/${id}/cancel`, {}); await load(); } catch (e) { setError((e as Error).message); } finally { setStopping(false); }
  };

  if (!data) return <div style={{ fontSize: 13, color: error ? T.error : T.textSec }}>{error || 'Loading broadcast…'}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/crm/lead-broadcasts" style={{ color: T.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← Lead broadcasts</Link>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{data.name}</span>
              <CampaignStatusBadge status={data.status} />
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
              by {data.createdBy.name} · started {fmtDateTime(data.startedAt ?? data.createdAt)}{data.completedAt ? ` · finished ${fmtDateTime(data.completedAt)}` : ''} · {data.audienceSize} leads matched
            </div>
          </div>
          {isSuper && data.status === 'SENDING' && (
            <button onClick={stop} disabled={stopping} style={{ padding: '8px 14px', borderRadius: 4, border: `1px solid ${T.error}`, background: 'transparent', color: T.error, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              {stopping ? 'Stopping…' : 'Stop sending'}
            </button>
          )}
        </div>
        {error && <div style={{ fontSize: 12, color: T.error, marginTop: 8 }}>{error}</div>}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {data.channels.filter(c => data.stats.channels[c]).map(c => (
          <Card key={c}>
            <SectionLabel>{c === 'SMS' ? 'SMS' : 'Email'}</SectionLabel>
            {STATUS_KEYS.map(k => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
                <span style={{ color: T.textSec }}>{STATUS_LABEL[k]}</span>
                <span style={{ fontWeight: 700, color: k === 'FAILED' && data.stats.channels[c][k] > 0 ? T.error : T.text }}>{data.stats.channels[c][k]}</span>
              </div>
            ))}
          </Card>
        ))}
      </div>

      {data.stats.reasons.length > 0 && (
        <Card>
          <SectionLabel>Why some were not sent</SectionLabel>
          {data.stats.reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: r.status === 'FAILED' ? T.error : T.textSec }}>{r.status === 'FAILED' ? 'Failed' : 'Skipped'}: {r.reason}</span>
              <span style={{ fontWeight: 700, color: T.text }}>{r.count}</span>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <SectionLabel>Message</SectionLabel>
        {data.emailSubject && <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>Subject: {data.emailSubject}</div>}
        <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap' }}>{data.body}</div>
      </Card>
    </div>
  );
}
