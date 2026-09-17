'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { CATEGORY_LABEL, STATUS_BADGE, STATUS_LABEL, TicketThread, errorMessage, timeAgo } from '../helpShared';

const POLL_MS = 20_000;

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<TicketThread | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/support/tickets/${id}`);
      setTicket(data.data);
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err, 'Couldn\'t load this request.'));
    }
  }, [id]);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [user, load]);

  const messageCount = ticket?.messages.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount]);

  if (authLoading || !user) return null;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/support/tickets/${id}/messages`, { body: reply.trim() });
      setReply('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const rate = async () => {
    if (!score || rating) return;
    setRating(true);
    setError('');
    try {
      await api.post(`/support/tickets/${id}/rating`, { score, comment: comment.trim() || undefined });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRating(false);
    }
  };

  if (!ticket) {
    return (
      <div className="page-body">
        <div className="inner" style={{ maxWidth: 760, margin: '0 auto', paddingTop: 28 }}>
          {loadError
            ? <div className="empty"><div className="emoji">🎧</div><h3>{loadError}</h3><p><Link href="/help" className="brand">Back to Help & Support</Link></p></div>
            : <div className="sk" style={{ height: 400, borderRadius: 8 }} />}
        </div>
      </div>
    );
  }

  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 760, margin: '0 auto', paddingTop: 28 }}>
        <Link href="/help" className="brand" style={{ fontSize: 14, fontWeight: 700 }}>← Help & Support</Link>
        <div className="between" style={{ margin: '12px 0 6px', gap: 12, alignItems: 'flex-start' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>{ticket.subject}</h1>
          <span className={`badge ${STATUS_BADGE[ticket.status]}`} style={{ flexShrink: 0 }}>{STATUS_LABEL[ticket.status]}</span>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
          #{ticket.number} · {CATEGORY_LABEL[ticket.category]}
          {ticket.order ? <> · <Link href={`/orders/${ticket.order.id}`} className="brand">Order #{ticket.order.orderNumber}</Link></> : null}
          {' '}· opened {timeAgo(ticket.createdAt)}
        </p>

        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ticket.messages.map(m => {
            const mine = m.from === 'you';
            return (
              <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                {!mine && <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>GoBuyMe Support</div>}
                <div style={{
                  padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: mine ? 'var(--brand)' : 'var(--surface2)', color: mine ? '#fff' : 'var(--text)',
                }}>{m.body}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, textAlign: mine ? 'right' : 'left' }}>{timeAgo(m.createdAt)}</div>
              </div>
            );
          })}
          {ticket.status === 'OPEN' && ticket.messages.length === 1 && (
            <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>Thanks, we&apos;ve got your request and will reply here soon.</p>
          )}
          <div ref={endRef} />
        </div>

        {ticket.canRate && (
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>How did we do?</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }} role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={score === n}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setScore(n)}
                  style={{ fontSize: 30, lineHeight: 1, cursor: 'pointer', color: n <= score ? 'var(--warning)' : 'var(--line)' }}
                >★</button>
              ))}
            </div>
            {score > 0 && (
              <>
                <input className="input" value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} placeholder="Anything else to tell us? (optional)" style={{ marginBottom: 12 }} />
                <button type="button" className="btn btn-primary" onClick={rate} disabled={rating}>
                  {rating ? <span className="spin" /> : 'Submit rating'}
                </button>
              </>
            )}
          </div>
        )}
        {ticket.csatScore !== null && (
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 14 }}>You rated this {ticket.csatScore}/5. Thank you!</p>
        )}

        {error && <div className="input-error" style={{ marginTop: 14 }}>{error}</div>}

        {ticket.canReply ? (
          <form onSubmit={send} className="card card-pad" style={{ marginTop: 16 }}>
            <label className="label" htmlFor="ticket-reply">{ticket.status === 'RESOLVED' ? 'Still need help? Reply to reopen' : 'Reply'}</label>
            <textarea id="ticket-reply" className="textarea" rows={4} maxLength={4000} value={reply} onChange={e => setReply(e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={!reply.trim() || sending}>
                {sending ? <span className="spin" /> : 'Send reply'}
              </button>
            </div>
          </form>
        ) : (
          <div className="card card-pad between" style={{ marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
            <span className="muted">This request is closed.</span>
            <Link href="/help/new" className="btn btn-ghost btn-sm">Start a new one</Link>
          </div>
        )}
      </div>
    </div>
  );
}
