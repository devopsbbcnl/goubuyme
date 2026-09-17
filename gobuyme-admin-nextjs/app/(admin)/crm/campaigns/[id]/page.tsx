'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Card, CrmRole, RoleBadge, SectionLabel, fmtDateTime, fmtNaira } from '@/components/crm/shared';
import {
  CHANNEL_LABEL, CampaignChannel, CampaignStatus, CampaignStatusBadge, EMPTY_MESSAGE, FieldLabel, MarketingTabs,
  MessageContent, MessageEditor, toContentPayload, useFieldStyle,
} from '@/components/crm/marketing';

interface SegmentOption { id: string; name: string; role: CrmRole; cachedCount: number | null }

type ChannelCounts = Record<'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED', number>;

interface CampaignDetail {
  id: string; name: string; status: CampaignStatus; channels: CampaignChannel[]; title: string; body: string;
  emailSubject: string | null; ctaUrl: string | null; scheduledAt: string | null; startedAt: string | null;
  completedAt: string | null; audienceSize: number | null; createdAt: string;
  segment: { id: string; name: string; role: CrmRole; cachedCount: number | null } | null;
  automation: { id: string; name: string } | null;
  createdBy: { name: string };
  stats: {
    channels: Partial<Record<CampaignChannel, ChannelCounts>>;
    reachedUsers: number;
    conversions: { windowHours: number; buyers: number; orders: number; revenue: number; rate: number };
  };
  recentFailures: Array<{ channel: CampaignChannel; error: string | null; user: { id: string; name: string } }>;
}

interface SegmentPreview { optedIn: number; reach: { PUSH: number; EMAIL: number; SMS: number } }

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const canEdit = isSuper || user?.role === 'OPERATIONS_ADMIN';
  const field = useFieldStyle();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [segments, setSegments] = useState<SegmentOption[]>([]);
  const [name, setName] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [message, setMessage] = useState<MessageContent>(EMPTY_MESSAGE);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const res = await api.get<{ data: CampaignDetail }>(`/admin/crm/campaigns/${id}`);
      const c = res.data;
      setCampaign(c);
      setName(c.name);
      setSegmentId(c.segment?.id ?? '');
      setMessage({ channels: c.channels, title: c.title, body: c.body, emailSubject: c.emailSubject ?? '', ctaUrl: c.ctaUrl ?? '' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<{ data: SegmentOption[] }>('/admin/crm/segments').then(res => setSegments(res.data)).catch(() => {});
  }, []);

  // Live progress while scheduled/sending.
  useEffect(() => {
    if (!campaign || (campaign.status !== 'SENDING' && campaign.status !== 'SCHEDULED')) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [campaign, load]);

  const editable = canEdit && (isNew || (campaign?.status === 'DRAFT' && !campaign.automation));

  const run = async (fn: () => Promise<void>) => {
    setSaving(true); setError(''); setNotice('');
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  };

  const saveDraft = () => run(async () => {
    const payload = { name, segmentId, ...toContentPayload(message) };
    if (isNew) {
      const res = await api.post<{ data: { id: string } }>('/admin/crm/campaigns', payload);
      router.replace(`/crm/campaigns/${res.data.id}`);
    } else {
      await api.patch(`/admin/crm/campaigns/${id}`, payload);
      await load();
      setNotice('Draft saved.');
    }
  });

  const sendTest = () => run(async () => {
    await api.patch(`/admin/crm/campaigns/${id}`, { name, segmentId, ...toContentPayload(message) });
    const res = await api.post<{ data: Record<string, string> }>(`/admin/crm/campaigns/${id}/test`, {});
    setNotice(`Test: ${Object.entries(res.data).map(([ch, r]) => `${CHANNEL_LABEL[ch as CampaignChannel]} ${r}`).join(' · ')}`);
  });

  const cancel = () => run(async () => {
    const res = await api.post<{ message: string }>(`/admin/crm/campaigns/${id}/cancel`, {});
    setNotice(res.message);
    await load();
  });

  const remove = () => run(async () => {
    await api.del(`/admin/crm/campaigns/${id}`);
    router.replace('/crm/campaigns');
  });

  if (loading) return <div style={{ fontSize: 13, color: T.textSec }}>Loading campaign…</div>;
  if (!isNew && !campaign) return <div style={{ fontSize: 13, color: T.error }}>{error || 'Campaign not found.'}</div>;

  const selectedSegment = segments.find(s => s.id === segmentId);
  const btn = (primary: boolean, danger = false): React.CSSProperties => ({
    padding: '9px 16px', borderRadius: 4, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving ? 0.6 : 1,
    border: primary ? 'none' : `1px solid ${danger ? T.error : T.border}`,
    background: primary ? T.primary : danger ? 'transparent' : T.surface2,
    color: primary ? '#fff' : danger ? T.error : T.text,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <MarketingTabs />
      <Link href="/crm/campaigns" style={{ color: T.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← All campaigns</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{isNew ? 'New campaign' : campaign!.name}</span>
          {campaign && <CampaignStatusBadge status={campaign.status} />}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {editable && <button onClick={saveDraft} disabled={saving} style={btn(false)}>{isNew ? 'Save draft' : 'Save'}</button>}
          {editable && !isNew && <button onClick={sendTest} disabled={saving} style={btn(false)}>Send test to me</button>}
          {editable && !isNew && isSuper && <button onClick={() => setScheduleOpen(true)} disabled={saving} style={btn(true)}>Schedule or send…</button>}
          {editable && !isNew && <button onClick={remove} disabled={saving} style={btn(false, true)}>Delete</button>}
          {isSuper && campaign && (campaign.status === 'SCHEDULED' || campaign.status === 'SENDING') && (
            <button onClick={cancel} disabled={saving} style={btn(false, true)}>Cancel campaign</button>
          )}
        </div>
      </div>
      {editable && !isNew && !isSuper && (
        <div style={{ fontSize: 12, color: T.textSec }}>A super admin schedules the send once the draft is ready.</div>
      )}
      {notice && <div style={{ fontSize: 13, color: T.success }}>{notice}</div>}
      {error && <div style={{ fontSize: 13, color: T.error }}>{error}</div>}

      {campaign && campaign.status !== 'DRAFT' && <CampaignResults campaign={campaign} />}

      <Card>
        <SectionLabel>Audience</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <FieldLabel>Campaign name (internal)</FieldLabel>
            <input value={name} disabled={!editable} maxLength={120} onChange={e => setName(e.target.value)} placeholder="September win-back" style={field} />
          </div>
          <div>
            <FieldLabel hint={selectedSegment?.cachedCount != null ? `${selectedSegment.cachedCount.toLocaleString()} reachable` : undefined}>Segment</FieldLabel>
            {campaign?.automation ? (
              <div style={{ ...field, color: T.textSec }}>Automation: {campaign.automation.name}</div>
            ) : (
              <select value={segmentId} disabled={!editable} onChange={e => setSegmentId(e.target.value)} style={field}>
                <option value="">Choose a segment…</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role.toLowerCase()})</option>)}
              </select>
            )}
            {editable && segments.length === 0 && (
              <div style={{ fontSize: 11, color: T.textSec, marginTop: 4 }}>No segments yet. <Link href="/crm/segments" style={{ color: T.primary }}>Create one</Link>.</div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionLabel>Message</SectionLabel>
        <MessageEditor value={message} onChange={setMessage} disabled={!editable} />
      </Card>

      {campaign && scheduleOpen && (
        <ScheduleModal campaignId={campaign.id} segment={selectedSegment ?? null} channels={message.channels}
          onClose={() => setScheduleOpen(false)}
          onSave={async () => {
            await api.patch(`/admin/crm/campaigns/${id}`, { name, segmentId, ...toContentPayload(message) });
          }}
          onDone={async msg => { setScheduleOpen(false); setNotice(msg); await load(); }} />
      )}
    </div>
  );
}

function CampaignResults({ campaign }: { campaign: CampaignDetail }) {
  const { theme: T } = useTheme();
  const { stats } = campaign;
  const totals = Object.values(stats.channels).reduce(
    (acc, c) => {
      (Object.keys(acc) as Array<keyof ChannelCounts>).forEach(k => { acc[k] += c?.[k] ?? 0; });
      return acc;
    },
    { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 } as ChannelCounts,
  );
  const all = totals.PENDING + totals.SENDING + totals.SENT + totals.FAILED + totals.SKIPPED;
  const done = all - totals.PENDING - totals.SENDING;
  const isCustomer = !campaign.segment || campaign.segment.role === 'CUSTOMER';

  const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
    </Card>
  );

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Kpi label="Audience" value={campaign.audienceSize?.toLocaleString() ?? (campaign.status === 'SCHEDULED' ? 'At send time' : '—')}
          sub={campaign.scheduledAt ? `${campaign.status === 'SCHEDULED' ? 'Sends' : 'Started'} ${fmtDateTime(campaign.startedAt ?? campaign.scheduledAt)}` : undefined} />
        <Kpi label="People reached" value={stats.reachedUsers.toLocaleString()} sub={`${totals.SENT.toLocaleString()} messages delivered`} />
        {isCustomer && <Kpi label={`Ordered within ${stats.conversions.windowHours}h`} value={stats.conversions.buyers.toLocaleString()} sub={`${stats.conversions.rate}% of reached · ${stats.conversions.orders} orders`} />}
        {isCustomer && <Kpi label="Attributed order value" value={fmtNaira(stats.conversions.revenue)} />}
      </div>

      {all > 0 && (
        <Card>
          <SectionLabel>Delivery</SectionLabel>
          <div style={{ height: 8, background: T.surface3, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((done / all) * 100)}%`, height: '100%', background: T.primary, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 6 }}>{done.toLocaleString()} of {all.toLocaleString()} processed</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr>{['Channel', 'Sent', 'Failed', 'Skipped', 'Waiting'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 11, color: T.textSec, padding: '6px 8px', textTransform: 'uppercase' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {(Object.entries(stats.channels) as Array<[CampaignChannel, ChannelCounts]>).map(([ch, c]) => (
                <tr key={ch} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '8px', fontSize: 13, color: T.text, fontWeight: 700 }}>{CHANNEL_LABEL[ch]}</td>
                  <td style={{ padding: '8px', fontSize: 13, color: T.success }}>{c.SENT.toLocaleString()}</td>
                  <td style={{ padding: '8px', fontSize: 13, color: c.FAILED ? T.error : T.textSec }}>{c.FAILED.toLocaleString()}</td>
                  <td style={{ padding: '8px', fontSize: 13, color: T.textSec }}>{c.SKIPPED.toLocaleString()}</td>
                  <td style={{ padding: '8px', fontSize: 13, color: T.textSec }}>{(c.PENDING + c.SENDING).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {campaign.recentFailures.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec, marginBottom: 4 }}>Recent failures</div>
              {campaign.recentFailures.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: T.textSec }}>
                  <Link href={`/crm/profiles/${f.user.id}`} style={{ color: T.text }}>{f.user.name}</Link> · {CHANNEL_LABEL[f.channel]} · {f.error}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>
            Email and SMS count as sent once handed to the provider; bounces aren&apos;t tracked yet.
          </div>
        </Card>
      )}
    </>
  );
}

function ScheduleModal({ campaignId, segment, channels, onClose, onSave, onDone }: {
  campaignId: string; segment: SegmentOption | null; channels: CampaignChannel[];
  onClose: () => void; onSave: () => Promise<void>; onDone: (message: string) => Promise<void>;
}) {
  const { theme: T } = useTheme();
  const field = useFieldStyle();
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [when, setWhen] = useState('');
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!segment) return;
    api.get<{ data: { preview: SegmentPreview } }>(`/admin/crm/segments/${segment.id}`)
      .then(res => setPreview(res.data.preview)).catch(err => setError((err as Error).message));
  }, [segment]);

  const people = preview?.optedIn ?? 0;
  // Large sends need the number typed back, so a misclick can't message thousands of people.
  const needsTyping = people >= 500;
  const confirmed = !needsTyping || confirmText.replace(/,/g, '') === String(people);

  const submit = async () => {
    setWorking(true);
    setError('');
    try {
      await onSave();
      const scheduledAt = mode === 'later' && when ? new Date(when).toISOString() : undefined;
      const res = await api.post<{ message: string }>(`/admin/crm/campaigns/${campaignId}/schedule`, { scheduledAt });
      await onDone(res.message);
    } catch (err) {
      setError((err as Error).message);
      setWorking(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Schedule campaign" width={480}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!segment ? (
          <div style={{ fontSize: 13, color: T.error }}>Choose a segment first.</div>
        ) : !preview ? (
          <div style={{ fontSize: 13, color: T.textSec }}>Counting audience…</div>
        ) : (
          <div style={{ background: T.surface2, borderRadius: 4, padding: 14 }}>
            <div style={{ fontSize: 13, color: T.text }}>
              <strong>{people.toLocaleString()}</strong> people in <strong>{segment.name}</strong> <RoleBadge role={segment.role} /> will get:
            </div>
            {channels.map(ch => (
              <div key={ch} style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
                • {CHANNEL_LABEL[ch]}: up to {preview.reach[ch].toLocaleString()}
              </div>
            ))}
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>
              Final numbers are worked out at send time. People who opted out or already got a promotion recently are skipped.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: T.text }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={mode === 'now'} onChange={() => setMode('now')} /> Send now</label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={mode === 'later'} onChange={() => setMode('later')} /> Schedule</label>
        </div>
        {mode === 'later' && <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={field} />}

        {needsTyping && (
          <div>
            <FieldLabel>Type {people.toLocaleString()} to confirm</FieldLabel>
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} style={field} />
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
        <button
          onClick={submit}
          disabled={working || !segment || !preview || !confirmed || (mode === 'later' && !when)}
          style={{
            padding: '10px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
            opacity: working || !segment || !preview || !confirmed || (mode === 'later' && !when) ? 0.6 : 1,
          }}
        >
          {working ? 'Working…' : mode === 'now' ? `Send to ${people.toLocaleString()} people` : 'Schedule'}
        </button>
      </div>
    </Modal>
  );
}
