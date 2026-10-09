'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

type Status = 'GREEN' | 'AMBER' | 'RED';

interface Briefing {
  id: string;
  day: string;
  analyzedBy: 'llm' | 'rules';
  model: string | null;
  summary: { status: Status; headline: string; concerns: string[]; actions: string[]; highlights: string[] } | null;
  flags: Array<{ level: 'RED' | 'AMBER'; code: string; message: string }>;
  html: string;
  sentAt: string | null;
  sendError: string | null;
  updatedAt: string;
}

const STATUS_ICON: Record<Status, string> = { GREEN: '🟢', AMBER: '🟠', RED: '🔴' };

// The stored briefing is Telegram HTML built server-side from escaped text; show it as plain text.
const toPlainText = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const lagosYesterday = () =>
  new Date(Date.now() + 3_600_000 - 86_400_000).toISOString().slice(0, 10);

export default function OpsBriefingPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [briefings, setBriefings] = useState<Briefing[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [day, setDay] = useState(lagosYesterday);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: Briefing[] }>('/admin/ops-briefings');
      setBriefings(res.data);
      setOpenId(prev => prev ?? res.data[0]?.id ?? null);
    } catch (e) {
      setBriefings([]);
      setMessage({ text: e instanceof Error ? e.message : 'Failed to load briefings.', ok: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (send: boolean) => {
    setBusy(send ? 'send' : 'preview');
    setMessage(null);
    try {
      const res = await api.post<{ message: string; data: { day: string; sent: boolean } }>('/admin/ops-briefings/run', { day, send });
      setMessage({ text: res.message, ok: !send || res.data.sent });
      setOpenId(null);
      await load();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Failed to run the briefing.', ok: false });
    } finally {
      setBusy(null);
    }
  };

  const button = (label: string, onClick: () => void, primary: boolean, disabled: boolean) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '8px 14px', borderRadius: 4, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
      border: primary ? 'none' : `1px solid ${T.border}`, background: primary ? T.primary : 'none',
      color: primary ? '#fff' : T.text, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Ops Briefing</div>
        <div style={{ fontSize: 13, color: T.textSec, maxWidth: 680, lineHeight: 1.5 }}>
          Every morning at 7:00 (Lagos) the ops agent reviews the previous day and posts a briefing to the admin Telegram chat.
          Numbers come straight from the database; the agent adds what needs attention and what to do about it.
        </div>
      </div>

      {isSuperAdmin && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 12 }}>
          <span style={{ fontSize: 13, color: T.textSec }}>Day</span>
          <input type="date" value={day} max={lagosYesterday()} onChange={e => setDay(e.target.value)}
            style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '7px 10px', color: T.text, fontSize: 13, fontFamily: 'inherit' }} />
          {button(busy === 'preview' ? 'Generating…' : 'Generate preview', () => run(false), false, busy !== null || !day)}
          {button(busy === 'send' ? 'Sending…' : 'Send to Telegram', () => run(true), true, busy !== null || !day)}
        </div>
      )}

      {message && (
        <div style={{ fontSize: 13, borderRadius: 4, padding: '8px 12px', color: message.ok ? T.success : T.error, background: message.ok ? T.successBg : T.errorBg }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {briefings === null ? (
          <div style={{ fontSize: 13, color: T.textSec }}>Loading…</div>
        ) : briefings.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textSec }}>No briefings yet. The first one is written tomorrow at 7:00.</div>
        ) : briefings.map(b => {
          const open = openId === b.id;
          return (
            <div key={b.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4 }}>
              <button onClick={() => setOpenId(open ? null : b.id)} style={{
                width: '100%', display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', background: 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: T.text,
              }}>
                <span>{b.summary ? STATUS_ICON[b.summary.status] : '⚪'}</span>
                <span style={{ fontSize: 13, fontWeight: 800, minWidth: 92 }}>{b.day}</span>
                <span style={{ fontSize: 13, color: T.textSec, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.summary?.headline ?? ''}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: b.sentAt ? T.success : b.sendError ? T.error : T.textMuted, whiteSpace: 'nowrap' }}>
                  {b.sentAt ? 'Sent' : b.sendError ? 'Send failed' : 'Not sent'}
                </span>
              </button>
              {open && (
                <div style={{ borderTop: `1px solid ${T.border}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, color: T.text }}>
                    {toPlainText(b.html)}
                  </pre>
                  <div style={{ fontSize: 12, color: T.textMuted }}>
                    {b.analyzedBy === 'llm' ? `Written by ${b.model ?? 'Claude'}` : 'Rule-based (AI narrative unavailable)'}
                    {' · '}generated {new Date(b.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    {b.sentAt && ` · sent ${new Date(b.sentAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}
                  </div>
                  {b.sendError && <div style={{ fontSize: 12, color: T.error }}>{b.sendError}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
