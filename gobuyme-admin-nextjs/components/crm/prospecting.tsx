'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/components/crm/shared';

export interface FitReason { label: string; points: number }

export interface ProspectSignals {
  offersDelivery: boolean | null; mentionsDelivery: boolean; competitors: string[]; ordersViaChat: boolean; websiteRead: boolean;
}

export interface Prospect {
  id: string; name: string; category: string | null; address: string | null; city: string | null; area: string | null;
  phone: string | null; email: string | null; whatsapp: string | null; website: string | null; instagram: string | null;
  facebook: string | null; mapsUrl: string | null; rating: number | null; reviewCount: number | null;
  signals: ProspectSignals | null; fitScore: number; fitReasons: FitReason[] | null; existingVendorId: string | null;
  status: 'NEW' | 'ADDED' | 'DISMISSED'; leadId: string | null; searchId: string | null; createdAt: string;
}

interface Drafts { whatsapp: string; emailSubject: string; emailBody: string; callScript: string }
interface Outreach { standard: Drafts; rewritten: (Drafts & { model: string; at: string }) | null; canRewrite: boolean }

const waNumber = (phone: string) => phone.replace(/\D/g, '').replace(/^0/, '234');

export function useFitColor() {
  const { theme: T } = useTheme();
  return (score: number) =>
    score >= 70 ? { color: T.success, bg: T.successBg } : score >= 45 ? { color: T.warning, bg: T.warningBg } : { color: T.textSec, bg: T.surface2 };
}

export function FitBadge({ score }: { score: number }) {
  const c = useFitColor()(score);
  return (
    <span title="Fit score out of 100" style={{ fontSize: 12, fontWeight: 800, color: c.color, background: c.bg, borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>
      {score}
    </span>
  );
}

/** Why a business scored what it did. Zero-point lines stay, so missing information is visible. */
export function FitReasons({ reasons }: { reasons: FitReason[] | null }) {
  const { theme: T } = useTheme();
  if (!reasons?.length) return <div style={{ fontSize: 12, color: T.textMuted }}>No score breakdown recorded.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {reasons.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
          <span style={{ color: r.points > 0 ? T.text : T.textMuted }}>{r.label}</span>
          <span style={{ color: r.points > 0 ? T.success : T.textMuted, fontWeight: 700 }}>{r.points > 0 ? `+${r.points}` : '0'}</span>
        </div>
      ))}
    </div>
  );
}

export function ProspectLinks({ p }: { p: Pick<Prospect, 'website' | 'instagram' | 'facebook' | 'mapsUrl'> }) {
  const { theme: T } = useTheme();
  const links = ([['Website', p.website], ['Instagram', p.instagram], ['Facebook', p.facebook], ['Google Maps', p.mapsUrl]] as Array<[string, string | null]>).filter(([, u]) => u);
  if (!links.length) return null;
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {links.map(([label, url]) => (
        <a key={label} href={url!} target="_blank" rel="noreferrer noopener" style={{ fontSize: 12, fontWeight: 700, color: T.primary, textDecoration: 'none' }}>{label} ↗</a>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const { theme: T } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <button onClick={copy} style={{ background: 'none', border: 'none', padding: 0, color: T.primary, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

type Channel = 'whatsapp' | 'email' | 'call';

/**
 * Suggested first-contact messages for a found business. Nothing is sent from here: the buttons
 * open WhatsApp or the mail app with the text filled in, and staff send it themselves.
 */
export function OutreachPanel({ prospectId, phone, email, canEdit }: { prospectId: string; phone: string | null; email: string | null; canEdit: boolean }) {
  const { theme: T } = useTheme();
  const [data, setData] = useState<Outreach | null>(null);
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [useRewrite, setUseRewrite] = useState(true);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() =>
    api.get<{ data: Outreach }>(`/admin/crm/prospecting/prospects/${prospectId}/outreach`).then(res => setData(res.data)).catch(err => setError(err.message)),
  [prospectId]);
  useEffect(() => { load(); }, [load]);

  const rewrite = async () => {
    setRewriting(true);
    setError('');
    try {
      await api.post(`/admin/crm/prospecting/prospects/${prospectId}/outreach/rewrite`, {});
      setUseRewrite(true);
      await load();
    } catch (err) { setError((err as Error).message); } finally { setRewriting(false); }
  };

  if (!data) return <div style={{ fontSize: 12, color: error ? T.error : T.textSec }}>{error || 'Loading messages…'}</div>;

  const d = data.rewritten && useRewrite ? data.rewritten : data.standard;
  const body = channel === 'whatsapp' ? d.whatsapp : channel === 'email' ? d.emailBody : d.callScript;
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    border: `1px solid ${active ? T.primary : T.border}`, background: active ? T.primaryTint : T.surface2, color: active ? T.primary : T.textSec,
  });
  const action: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
    cursor: 'pointer', textDecoration: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['whatsapp', 'email', 'call'] as Channel[]).map(c => (
          <button key={c} onClick={() => setChannel(c)} style={pill(channel === c)}>{c === 'whatsapp' ? 'WhatsApp' : c === 'email' ? 'Email' : 'Call script'}</button>
        ))}
        {data.rewritten && (
          <button onClick={() => setUseRewrite(v => !v)} style={{ ...pill(false), marginLeft: 'auto' }}>
            {useRewrite ? 'Show standard version' : 'Show rewritten version'}
          </button>
        )}
      </div>
      {channel === 'email' && (
        <div style={{ fontSize: 12, color: T.textSec }}>Subject: <span style={{ color: T.text, fontWeight: 700 }}>{d.emailSubject}</span></div>
      )}
      <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: 10, lineHeight: 1.5 }}>{body}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {channel === 'whatsapp' && phone && (
          <a href={`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(d.whatsapp)}`} target="_blank" rel="noreferrer noopener" style={action}>Open in WhatsApp</a>
        )}
        {channel === 'email' && email && (
          <a href={`mailto:${email}?subject=${encodeURIComponent(d.emailSubject)}&body=${encodeURIComponent(d.emailBody)}`} style={action}>Open in mail app</a>
        )}
        {channel === 'call' && phone && <a href={`tel:${phone}`} style={action}>Call {phone}</a>}
        <CopyButton text={channel === 'email' ? `${d.emailSubject}\n\n${d.emailBody}` : body} />
        {canEdit && data.canRewrite && (
          <button onClick={rewrite} disabled={rewriting} style={{ background: 'none', border: 'none', padding: 0, color: T.primary, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: rewriting ? 0.6 : 1 }}>
            {rewriting ? 'Rewriting…' : data.rewritten ? 'Rewrite again with AI' : 'Rewrite with AI'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: T.textMuted }}>
        {channel === 'whatsapp' && !phone ? 'No phone number found for this business. ' : ''}
        {channel === 'email' && !email ? 'No email found for this business. ' : ''}
        {data.rewritten && useRewrite ? `AI rewrite from ${fmtDateTime(data.rewritten.at)}. Read it before sending. ` : ''}
        Nothing is sent automatically. Edit before you send, then log the contact on the lead.
      </div>
      {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
    </div>
  );
}
