'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';

export type CampaignChannel = 'PUSH' | 'EMAIL' | 'SMS';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED';

export interface MessageContent {
  channels: CampaignChannel[];
  title: string;
  body: string;
  emailSubject: string;
  ctaUrl: string;
}

export const EMPTY_MESSAGE: MessageContent = { channels: ['PUSH'], title: '', body: '', emailSubject: '', ctaUrl: '' };

export const LIMITS = { title: 80, body: 1000, smsBody: 320 };

export const CHANNEL_LABEL: Record<CampaignChannel, string> = { PUSH: 'Push + in-app', EMAIL: 'Email', SMS: 'SMS' };

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Draft', SCHEDULED: 'Scheduled', SENDING: 'Sending', SENT: 'Sent', CANCELLED: 'Cancelled',
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const { theme: T } = useTheme();
  const cfg = {
    DRAFT: { color: T.textSec, bg: T.surface3 },
    SCHEDULED: { color: T.info, bg: T.infoBg },
    SENDING: { color: T.primary, bg: T.primaryTint },
    SENT: { color: T.success, bg: T.successBg },
    CANCELLED: { color: T.error, bg: T.errorBg },
  }[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 4, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  );
}

const TABS = [
  { href: '/crm/campaigns', label: 'Campaigns' },
  { href: '/crm/segments', label: 'Segments' },
  { href: '/crm/automations', label: 'Automations' },
];

export function MarketingTabs() {
  const { theme: T } = useTheme();
  const pathname = usePathname();
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}` }}>
      {TABS.map(t => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link key={t.href} href={t.href} style={{
            padding: '10px 14px', fontSize: 13, fontWeight: 700, textDecoration: 'none', marginBottom: -1,
            color: active ? T.primary : T.textSec, borderBottom: `2px solid ${active ? T.primary : 'transparent'}`,
          }}>{t.label}</Link>
        );
      })}
    </div>
  );
}

export function useFieldStyle(): React.CSSProperties {
  const { theme: T } = useTheme();
  return {
    width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '10px 12px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.textSec }}>{children}</span>
      {hint && <span style={{ fontSize: 11, color: T.textMuted }}>{hint}</span>}
    </div>
  );
}

/** Channel picker, message fields and live previews, shared by campaigns and automations. */
export function MessageEditor({ value, onChange, disabled }: {
  value: MessageContent; onChange: (next: MessageContent) => void; disabled?: boolean;
}) {
  const { theme: T } = useTheme();
  const field = useFieldStyle();
  const set = <K extends keyof MessageContent>(k: K, v: MessageContent[K]) => onChange({ ...value, [k]: v });
  const toggleChannel = (c: CampaignChannel) =>
    set('channels', value.channels.includes(c) ? value.channels.filter(x => x !== c) : [...value.channels, c]);

  const hasSms = value.channels.includes('SMS');
  const bodyLimit = hasSms ? LIMITS.smsBody : LIMITS.body;
  const sample = (s: string) => s.replace(/\{\{\s*name\s*\}\}/gi, 'Ada');
  const smsText = `GoBuyMe: ${sample(value.body)}`;
  const smsPages = smsText.length <= 160 ? 1 : Math.ceil(smsText.length / 153);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <FieldLabel>Channels</FieldLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['PUSH', 'EMAIL', 'SMS'] as CampaignChannel[]).map(c => {
              const on = value.channels.includes(c);
              return (
                <button key={c} type="button" disabled={disabled} onClick={() => toggleChannel(c)} aria-pressed={on} style={{
                  padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
                  border: `1px solid ${on ? T.primary : T.border}`, background: on ? T.primaryTint : T.surface2, color: on ? T.primary : T.textSec,
                }}>{on ? '✓ ' : ''}{CHANNEL_LABEL[c]}</button>
              );
            })}
          </div>
          {hasSms && <div style={{ fontSize: 11, color: T.warning, marginTop: 6 }}>SMS costs money per page and only reaches users with a phone number.</div>}
        </div>

        <div>
          <FieldLabel hint={`${value.title.length}/${LIMITS.title}`}>Title</FieldLabel>
          <input value={value.title} disabled={disabled} maxLength={LIMITS.title} onChange={e => set('title', e.target.value)} placeholder="Free delivery this weekend, {{name}} 🎉" style={field} />
        </div>

        <div>
          <FieldLabel hint={`${value.body.length}/${bodyLimit}`}>Message</FieldLabel>
          <textarea value={value.body} disabled={disabled} maxLength={bodyLimit} rows={5} onChange={e => set('body', e.target.value)}
            placeholder="Order from any restaurant before Sunday and delivery is on us." style={{ ...field, resize: 'vertical' }} />
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Use {'{{name}}'} for the person&apos;s first name.</div>
        </div>

        {value.channels.includes('EMAIL') && (
          <div>
            <FieldLabel hint="Defaults to the title">Email subject</FieldLabel>
            <input value={value.emailSubject} disabled={disabled} maxLength={120} onChange={e => set('emailSubject', e.target.value)} style={field} />
          </div>
        )}

        <div>
          <FieldLabel hint="Optional">Button link (https://)</FieldLabel>
          <input value={value.ctaUrl} disabled={disabled} onChange={e => set('ctaUrl', e.target.value)} placeholder="https://gobuyme.shop/deals" style={field} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FieldLabel>Preview</FieldLabel>
        {value.channels.includes('PUSH') && (
          <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, display: 'flex', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: T.primary, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>GBM</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{sample(value.title) || 'Title'}</div>
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {sample(value.body) || 'Your message'}
              </div>
            </div>
          </div>
        )}
        {value.channels.includes('EMAIL') && (
          <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: 16, color: '#1A1410' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>Subject: {sample(value.emailSubject || value.title) || '—'}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FF521B', marginBottom: 10 }}>GoBuyMe</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{sample(value.title) || 'Title'}</div>
            <div style={{ fontSize: 13, color: '#444', whiteSpace: 'pre-wrap' }}>{sample(value.body) || 'Your message'}</div>
            {value.ctaUrl && <div style={{ display: 'inline-block', marginTop: 12, background: '#FF521B', color: '#fff', fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 4 }}>Open GoBuyMe</div>}
            <div style={{ fontSize: 10, color: '#999', marginTop: 14 }}>Unsubscribe from promotions</div>
          </div>
        )}
        {hasSms && (
          <div>
            <div style={{ alignSelf: 'flex-start', background: T.surface3, color: T.text, fontSize: 13, borderRadius: 14, padding: '10px 12px', whiteSpace: 'pre-wrap', maxWidth: 300 }}>{smsText}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{smsText.length} characters · {smsPages} SMS page{smsPages > 1 ? 's' : ''} per person</div>
          </div>
        )}
        {value.channels.length === 0 && <div style={{ fontSize: 12, color: T.textSec }}>Choose a channel to see a preview.</div>}
      </div>
    </div>
  );
}

export const toContentPayload = (m: MessageContent) => ({
  channels: m.channels, title: m.title, body: m.body,
  emailSubject: m.emailSubject.trim() || null, ctaUrl: m.ctaUrl.trim() || null,
});
