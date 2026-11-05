'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

type Audience = 'ALL' | 'CUSTOMERS' | 'VENDORS' | 'RIDERS' | 'USER';

interface Broadcast {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  targetUserName: string | null;
  targetUserEmail: string | null;
  recipientCount: number;
  pushCount: number;
  authorName: string;
  createdAt: string;
}

interface Reach { recipients: number; pushReachable: number }

interface Recipient { id: string; name: string; email: string; phone: string | null; role: string }

const AUDIENCES: Array<{ value: Audience; label: string }> = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'CUSTOMERS', label: 'Customers' },
  { value: 'VENDORS', label: 'Vendors' },
  { value: 'RIDERS', label: 'Riders' },
  { value: 'USER', label: 'One user' },
];
const AUDIENCE_LABEL = Object.fromEntries(AUDIENCES.map(a => [a.value, a.label])) as Record<Audience, string>;

const TITLE_MAX = 80;
const BODY_MAX = 500;

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export default function BroadcastsPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const canSend = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('ALL');
  const [target, setTarget] = useState<Recipient | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recipient[] | null>(null);
  const [reach, setReach] = useState<Reach | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [rows, setRows] = useState<Broadcast[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async (p: number, append: boolean) => {
    try {
      const res = await api.get<{ data: Broadcast[]; pagination: { totalPages: number } }>(`/admin/broadcasts?page=${p}&limit=20`);
      setRows(prev => (append && prev ? [...prev, ...res.data] : res.data));
      setPage(p);
      setTotalPages(res.pagination.totalPages);
    } catch (e) {
      setRows(prev => prev ?? []);
      setMessage({ text: e instanceof Error ? e.message : 'Failed to load broadcasts.', ok: false });
    }
  }, []);

  useEffect(() => { void load(1, false); }, [load]);

  // How many people the chosen audience reaches, shown before anything is sent.
  useEffect(() => {
    setReach(null);
    setConfirming(false);
    if (audience === 'USER' && !target) return;
    let live = true;
    const qs = audience === 'USER' ? `audience=USER&targetUserId=${target!.id}` : `audience=${audience}`;
    api.get<{ data: Reach }>(`/admin/broadcasts/preview?${qs}`)
      .then(res => { if (live) setReach(res.data); })
      .catch(() => {});
    return () => { live = false; };
  }, [audience, target]);

  // Look up the one account to message as the admin types.
  useEffect(() => {
    if (audience !== 'USER' || target || query.trim().length < 2) { setResults(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api.get<{ data: Recipient[] }>(`/admin/broadcasts/recipients?q=${encodeURIComponent(query.trim())}`)
        .then(res => { if (live) setResults(res.data); })
        .catch(() => { if (live) setResults([]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [audience, target, query]);

  const valid = title.trim().length >= 3 && body.trim().length >= 3 && (audience !== 'USER' || !!target);
  const audienceName = audience === 'USER' && target ? target.name : AUDIENCE_LABEL[audience];

  const send = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post<{ message: string }>('/admin/broadcasts', {
        title: title.trim(), body: body.trim(), audience, ...(audience === 'USER' && target ? { targetUserId: target.id } : {}),
      });
      setMessage({ text: res.message, ok: true });
      setTitle('');
      setBody('');
      setTarget(null);
      setQuery('');
      setConfirming(false);
      await load(1, false);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Failed to send the broadcast.', ok: false });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const input = {
    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '9px 12px',
    color: T.text, fontSize: 13, fontFamily: 'inherit', width: '100%', outline: 'none', boxSizing: 'border-box' as const,
  };
  const label = { fontSize: 12, fontWeight: 700, color: T.textSec, marginBottom: 6, display: 'block' };
  const button = (text: string, onClick: () => void, primary: boolean, disabled: boolean) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '9px 16px', borderRadius: 4, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
      border: primary ? 'none' : `1px solid ${T.border}`, background: primary ? T.primary : 'none',
      color: primary ? '#fff' : T.text, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{text}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Broadcasts</div>
        <div style={{ fontSize: 13, color: T.textSec, maxWidth: 680, lineHeight: 1.5 }}>
          Send a message from GoBuyMe to everyone, to every customer, vendor or rider, or to one specific user. It arrives as a
          push notification and is kept in their notifications. This is for operational news (an outage, a policy change); use Marketing for promotions.
          A sent broadcast cannot be edited or taken back.
        </div>
      </div>

      {message && (
        <div style={{ fontSize: 13, borderRadius: 4, padding: '8px 12px', color: message.ok ? T.success : T.error, background: message.ok ? T.successBg : T.errorBg }}>
          {message.text}
        </div>
      )}

      {canSend ? (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span style={label}>Audience</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {AUDIENCES.map(a => (
                <button key={a.value} onClick={() => setAudience(a.value)} style={{
                  padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  border: `1px solid ${audience === a.value ? T.primary : T.border}`,
                  background: audience === a.value ? T.primary : 'none',
                  color: audience === a.value ? '#fff' : T.text,
                }}>{a.label}</button>
              ))}
            </div>
            {audience === 'USER' && (
              <div style={{ marginTop: 10 }}>
                {target ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{target.name} <span style={{ fontSize: 11, fontWeight: 700, color: T.primary }}>{target.role}</span></div>
                      <div style={{ fontSize: 12, color: T.textSec }}>{target.email}{target.phone ? ` · ${target.phone}` : ''}</div>
                    </div>
                    {button('Change', () => { setTarget(null); setQuery(''); }, false, false)}
                  </div>
                ) : (
                  <div>
                    <input style={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, email or phone" aria-label="Find a user" />
                    {results !== null && (
                      <div style={{ marginTop: 6, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
                        {results.length === 0 ? (
                          <div style={{ fontSize: 12, color: T.textMuted, padding: '8px 12px' }}>No active customer, vendor or rider matches.</div>
                        ) : results.map(r => (
                          <button key={r.id} onClick={() => { setTarget(r); setResults(null); }} style={{
                            display: 'block', width: '100%', textAlign: 'left', background: T.surface, border: 'none',
                            borderBottom: `1px solid ${T.border}`, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.name}</span>{' '}
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.primary }}>{r.role}</span>
                            <div style={{ fontSize: 12, color: T.textSec }}>{r.email}{r.phone ? ` · ${r.phone}` : ''}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>
              {audience === 'USER' && !target
                ? 'Find the person you want to message.'
                : reach === null
                  ? 'Counting…'
                  : audience === 'USER'
                    ? (reach.pushReachable > 0 ? 'They can be notified on a device, and will also see it in their notifications.' : 'They have no device registered for push, so they will see it only in their notifications.')
                    : `${reach.recipients.toLocaleString()} active account${reach.recipients === 1 ? '' : 's'}; ${reach.pushReachable.toLocaleString()} can be notified on a device. The rest will see it only in their notifications.`}
            </div>
          </div>

          <div>
            <label style={label} htmlFor="bc-title">Title</label>
            <input id="bc-title" style={input} value={title} maxLength={TITLE_MAX} onChange={e => { setTitle(e.target.value); setConfirming(false); }} placeholder="e.g. Scheduled maintenance tonight" />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, textAlign: 'right' }}>{title.length}/{TITLE_MAX}</div>
          </div>

          <div>
            <label style={label} htmlFor="bc-body">Message</label>
            <textarea id="bc-body" style={{ ...input, minHeight: 96, resize: 'vertical' }} value={body} maxLength={BODY_MAX} onChange={e => { setBody(e.target.value); setConfirming(false); }} placeholder="Keep it short and clear. Phones show only the first lines." />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, textAlign: 'right' }}>{body.length}/{BODY_MAX}</div>
          </div>

          {confirming ? (
            <div style={{ border: `1px solid ${T.primary}`, borderRadius: 4, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                Send to {audience === 'USER'
                  ? `${audienceName} (${target?.email})`
                  : reach ? `${reach.recipients.toLocaleString()} ${AUDIENCE_LABEL[audience].toLowerCase()} account${reach.recipients === 1 ? '' : 's'}` : AUDIENCE_LABEL[audience]}? This cannot be undone.
              </div>
              <div style={{ background: T.surface2, borderRadius: 4, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{title.trim()}</div>
                <div style={{ fontSize: 13, color: T.textSec, marginTop: 4, whiteSpace: 'pre-wrap' }}>{body.trim()}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {button(busy ? 'Sending…' : 'Send now', send, true, busy)}
                {button('Back to editing', () => setConfirming(false), false, busy)}
              </div>
            </div>
          ) : (
            <div>{button('Review and send', () => setConfirming(true), true, !valid || !reach || reach.recipients === 0)}</div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: T.textSec }}>Only Operations and Super Admins can send broadcasts.</div>
      )}

      <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Sent</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows === null ? (
          <div style={{ fontSize: 13, color: T.textSec }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textSec }}>Nothing has been broadcast yet.</div>
        ) : rows.map(b => (
          <div key={b.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{b.title}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.primary }}>
                {b.audience === 'USER' ? `To ${b.targetUserName ?? 'a deleted user'}${b.targetUserEmail ? ` (${b.targetUserEmail})` : ''}` : AUDIENCE_LABEL[b.audience]}
              </span>
            </div>
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 4, whiteSpace: 'pre-wrap' }}>{b.body}</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>
              {fmt(b.createdAt)} · by {b.authorName} · {b.recipientCount.toLocaleString()} recipients, {b.pushCount.toLocaleString()} notified on a device
            </div>
          </div>
        ))}
        {rows && page < totalPages && (
          <div>{button('Load more', () => { void load(page + 1, true); }, false, false)}</div>
        )}
      </div>
    </div>
  );
}
