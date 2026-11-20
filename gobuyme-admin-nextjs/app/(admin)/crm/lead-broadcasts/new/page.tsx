'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { api } from '@/lib/api';
import { Card, SectionLabel, fmtNaira } from '@/components/crm/shared';
import { LeadSource, LeadStage, LeadType, SOURCE_LABEL, STAGE_LABEL, VENDOR_CATEGORIES, humanize } from '@/components/crm/leads';

type Channel = 'SMS' | 'EMAIL';

interface Settings {
  limits: { smsBody: number; emailBody: number; emailSubject: number; maxSmsPages: number };
  frequencyCapHours: number;
  dailyCaps: { SMS: number; EMAIL: number };
  smsConfigured: boolean;
  smsCostPerPageNgn: number | null;
}

interface ChannelPreview {
  willSend: number; skipped: Record<string, number>; pages?: number; estimatedCostNgn?: number | null; dailyCap: number; dailyRemaining: number;
}
interface Preview {
  matched: number; capped: boolean; channels: Partial<Record<Channel, ChannelPreview>>; sample: Array<{ id: string; name: string; sms?: string }>;
}

const OPEN_STAGES: LeadStage[] = ['NEW', 'CONTACTED', 'INTERESTED', 'ONBOARDING'];

export default function NewLeadBroadcastPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();
  const isSuper = user?.role === 'SUPER_ADMIN';

  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<LeadType>('VENDOR');
  const [stages, setStages] = useState<LeadStage[]>(['NEW', 'CONTACTED']);
  const [source, setSource] = useState<'' | LeadSource>('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [minFit, setMinFit] = useState('');
  const [channels, setChannels] = useState<Channel[]>(['SMS']);
  const [body, setBody] = useState('Hi {{name}}, we help restaurants and shops in your area get more orders on GoBuyMe. Sign up free: gobuyme.shop/downloads');
  const [emailSubject, setEmailSubject] = useState('Get more orders with GoBuyMe');
  const [ctaUrl, setCtaUrl] = useState('https://gobuyme.shop/downloads');

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data: Settings }>('/admin/crm/lead-broadcasts/settings').then(r => setSettings(r.data)).catch(e => setError((e as Error).message));
  }, []);

  const payload = useMemo(() => ({
    name,
    channels,
    body,
    emailSubject: channels.includes('EMAIL') ? emailSubject : null,
    ctaUrl: channels.includes('EMAIL') && ctaUrl.trim() ? ctaUrl.trim() : null,
    filters: {
      type, stages,
      ...(source ? { sources: [source] } : {}),
      ...(category ? { categories: [category] } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(Number(minFit) > 0 ? { minFitScore: Number(minFit) } : {}),
    },
  }), [name, channels, body, emailSubject, ctaUrl, type, stages, source, category, city, minFit]);

  // Any change to what would be sent invalidates the preview: staff only ever confirm what they have just seen.
  useEffect(() => { setPreview(null); setConfirming(false); }, [payload]);

  const toggle = <V,>(list: V[], v: V, set: (l: V[]) => void) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const runPreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      const res = await api.post<{ data: Preview }>('/admin/crm/lead-broadcasts/preview', payload);
      setPreview(res.data);
    } catch (err) { setError((err as Error).message); setPreview(null); } finally { setPreviewing(false); }
  };

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await api.post<{ data: { id: string } }>('/admin/crm/lead-broadcasts', payload);
      router.push(`/crm/lead-broadcasts/${res.data.id}`);
    } catch (err) { setError((err as Error).message); setSending(false); setConfirming(false); }
  };

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '9px 11px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: T.textSec, display: 'flex', flexDirection: 'column', gap: 5 };
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    border: `1px solid ${active ? T.primary : T.border}`, background: active ? T.primaryTint : T.surface2, color: active ? T.primary : T.textSec,
  });

  const smsLimit = settings?.limits.smsBody ?? 240;
  const queued = (preview?.channels.SMS?.willSend ?? 0) + (preview?.channels.EMAIL?.willSend ?? 0);
  const canPreview = channels.length > 0 && body.trim().length > 0 && stages.length > 0 && !previewing;
  const smsDown = channels.includes('SMS') && settings && !settings.smsConfigured;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/crm/lead-broadcasts" style={{ color: T.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← Lead broadcasts</Link>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>New lead broadcast</div>
        <div style={{ fontSize: 13, color: T.textSec }}>
          Send an SMS or email to leads in the pipeline. Instagram, TikTok and other social profiles can&apos;t be messaged in bulk: open them from the lead page and message by hand.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <SectionLabel>Who</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={label}>Broadcast name (for your records)
                <input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="PH restaurants — November" style={field} />
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['VENDOR', 'RIDER'] as LeadType[]).map(t => <button key={t} onClick={() => setType(t)} style={chip(type === t)}>{t === 'VENDOR' ? 'Vendor leads' : 'Rider leads'}</button>)}
              </div>
              <div>
                <div style={{ ...label, marginBottom: 6 }}>Stage</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {OPEN_STAGES.map(s => <button key={s} onClick={() => toggle(stages, s, setStages)} style={chip(stages.includes(s))}>{STAGE_LABEL[s]}</button>)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={label}>Source
                  <select value={source} onChange={e => setSource(e.target.value as '' | LeadSource)} style={field}>
                    <option value="">Any</option>
                    {(Object.keys(SOURCE_LABEL) as LeadSource[]).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
                  </select>
                </label>
                {type === 'VENDOR' && (
                  <label style={label}>Category
                    <select value={category} onChange={e => setCategory(e.target.value)} style={field}>
                      <option value="">Any</option>
                      {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{humanize(c)}</option>)}
                    </select>
                  </label>
                )}
                <label style={label}>City
                  <input value={city} onChange={e => setCity(e.target.value)} placeholder="Port Harcourt" style={field} />
                </label>
                <label style={label}>Min. fit score
                  <input type="number" min={0} max={100} value={minFit} onChange={e => setMinFit(e.target.value)} placeholder="Any" style={field} />
                </label>
              </div>
              <div style={{ fontSize: 11, color: T.textMuted }}>
                Leads who opted out, already have an account, or were messaged in the last {settings?.frequencyCapHours ?? 72} hours are skipped automatically.
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel>Message</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['SMS', 'EMAIL'] as Channel[]).map(c => <button key={c} onClick={() => toggle(channels, c, setChannels)} style={chip(channels.includes(c))}>{c === 'SMS' ? 'SMS' : 'Email'}</button>)}
              </div>
              {smsDown && <div style={{ fontSize: 12, color: T.error }}>Termii isn&apos;t configured on the server (TERMII_API_KEY / TERMII_SENDER_ID), so SMS messages will fail.</div>}
              <label style={label}>Message
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={channels.includes('SMS') ? smsLimit : settings?.limits.emailBody ?? 1500} style={{ ...field, resize: 'vertical' }} />
                <span style={{ fontWeight: 500, color: T.textMuted }}>
                  {body.length}/{channels.includes('SMS') ? smsLimit : settings?.limits.emailBody ?? 1500} · use {'{{name}}'} for the contact&apos;s first name (or the business name) and {'{{business}}'} for the business.
                  {channels.includes('SMS') && ' We add “GoBuyMe:” at the start and an opt-out link at the end.'}
                </span>
              </label>
              {channels.includes('EMAIL') && (
                <>
                  <label style={label}>Email subject<input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} maxLength={settings?.limits.emailSubject ?? 120} style={field} /></label>
                  <label style={label}>Email button link (optional)<input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="https://…" style={field} /></label>
                </>
              )}
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <SectionLabel>Preview</SectionLabel>
            <button onClick={runPreview} disabled={!canPreview} style={{
              padding: '9px 16px', borderRadius: 4, border: `1px solid ${T.primary}`, background: 'transparent', color: T.primary,
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: canPreview ? 'pointer' : 'default', opacity: canPreview ? 1 : 0.5,
            }}>{previewing ? 'Checking…' : preview ? 'Refresh preview' : 'Preview who would get this'}</button>
            {error && <div style={{ fontSize: 12, color: T.error, marginTop: 10 }}>{error}</div>}

            {preview && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, color: T.text }}>
                  <strong>{preview.matched}</strong> leads match{preview.capped ? ' (showing the first group; narrow the filters)' : ''}.
                </div>
                {(['SMS', 'EMAIL'] as Channel[]).map(c => {
                  const p = preview.channels[c];
                  if (!p) return null;
                  const skipped = Object.entries(p.skipped);
                  const overCap = p.willSend > p.dailyRemaining;
                  return (
                    <div key={c} style={{ background: T.surface2, borderRadius: 4, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{c === 'SMS' ? 'SMS' : 'Email'}: {p.willSend} will be sent</div>
                      {c === 'SMS' && p.willSend > 0 && (
                        <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>
                          {p.pages} SMS pages
                          {p.estimatedCostNgn != null ? ` · about ${fmtNaira(p.estimatedCostNgn)}` : ' · cost not shown (set SMS_COST_PER_PAGE_NGN to see an estimate)'}
                        </div>
                      )}
                      {skipped.length > 0 && (
                        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                          Skipped: {skipped.map(([reason, n]) => `${n} ${reason.toLowerCase()}`).join(', ')}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: overCap ? T.error : T.textMuted, marginTop: 4 }}>
                        Daily limit: {p.dailyRemaining} of {p.dailyCap} left{overCap ? ': this is over the limit, narrow the audience' : ''}
                      </div>
                    </div>
                  );
                })}
                {preview.sample.some(s => s.sms) && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>How the SMS will read</div>
                    {preview.sample.filter(s => s.sms).slice(0, 2).map(s => (
                      <div key={s.id} style={{ fontSize: 12, color: T.text, background: T.surface2, borderRadius: 4, padding: 10, marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                        <div style={{ color: T.textMuted, marginBottom: 2 }}>To {s.name}</div>{s.sms}
                      </div>
                    ))}
                  </div>
                )}

                {queued === 0 ? (
                  <div style={{ fontSize: 12, color: T.warning }}>Nobody can be messaged with these settings.</div>
                ) : !isSuper ? (
                  <div style={{ fontSize: 12, color: T.textSec }}>Only a super admin can send. Ask one to open this page and send it.</div>
                ) : !confirming ? (
                  <button onClick={() => setConfirming(true)} disabled={!name.trim()} style={{
                    padding: '10px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit', cursor: name.trim() ? 'pointer' : 'default', opacity: name.trim() ? 1 : 0.5,
                  }}>{name.trim() ? `Send ${queued} ${queued === 1 ? 'message' : 'messages'}…` : 'Name the broadcast to send'}</button>
                ) : (
                  <div style={{ border: `1px solid ${T.primary}`, borderRadius: 4, padding: 12 }}>
                    <div style={{ fontSize: 13, color: T.text, marginBottom: 10 }}>
                      Send {queued} {queued === 1 ? 'message' : 'messages'} to people who haven&apos;t signed up yet? Messages go out within a minute and can&apos;t be recalled.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={send} disabled={sending} style={{ padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
                        {sending ? 'Sending…' : 'Yes, send now'}
                      </button>
                      <button onClick={() => setConfirming(false)} disabled={sending} style={{ padding: '9px 16px', borderRadius: 4, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSec, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
