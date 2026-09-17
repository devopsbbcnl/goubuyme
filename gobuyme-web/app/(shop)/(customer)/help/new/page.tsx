'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { CATEGORY_LABEL, CUSTOMER_CATEGORIES, TicketCategory, errorMessage } from '../helpShared';

export default function NewTicketPage() {
  return (
    <Suspense fallback={null}>
      <NewTicketForm />
    </Suspense>
  );
}

function NewTicketForm() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('orderId');
  const orderNumber = params.get('orderNumber');

  const [category, setCategory] = useState<TicketCategory | null>(orderId ? 'ORDER_ISSUE' : null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  const canSend = !!category && body.trim().length >= 10 && !sending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      const { data } = await api.post('/support/tickets', {
        category, body: body.trim(), orderId: orderId || undefined, channel: 'WEB',
      });
      router.replace(`/help/${data.data.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  };

  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 680, margin: '0 auto', paddingTop: 28 }}>
        <Link href="/help" className="brand" style={{ fontSize: 14, fontWeight: 700 }}>← Help & Support</Link>
        <h1 className="t-page" style={{ margin: '12px 0 24px' }}>Contact support</h1>

        <form onSubmit={submit} className="card card-pad">
          {orderId && (
            <div className="badge badge-info" style={{ marginBottom: 18 }}>
              About order {orderNumber ? `#${orderNumber.replace(/^#/, '')}` : ''}
            </div>
          )}

          <div className="form-group">
            <span className="label">What do you need help with?</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CUSTOMER_CATEGORIES.map(c => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`chip${category === c ? ' active' : ''}`}
                  aria-pressed={category === c}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="label" htmlFor="ticket-body">Tell us what happened</label>
            <textarea
              id="ticket-body"
              className="textarea"
              rows={6}
              maxLength={4000}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Include as much detail as you can, e.g. which item was missing."
            />
            {body.trim().length > 0 && body.trim().length < 10 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>A little more detail helps us sort it faster.</div>
            )}
          </div>

          {error && <div className="input-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={!canSend}>
            {sending ? <span className="spin" /> : 'Send to support'}
          </button>
          <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>
            We&apos;ll notify you and email you when we reply.
          </p>
        </form>
      </div>
    </div>
  );
}
