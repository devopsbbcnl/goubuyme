'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/services/api';

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <Unsubscribe />
    </Suspense>
  );
}

// Reached from the footer of marketing emails. It asks for a click instead of unsubscribing on
// page load, because some email security scanners open every link in a message.
function Unsubscribe() {
  const token = useSearchParams().get('t') ?? '';
  const [state, setState] = useState<'idle' | 'working' | 'unsubscribed' | 'resubscribed' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (subscribe: boolean) => {
    setState('working');
    try {
      const { data } = await api.post('/marketing/unsubscribe', { token, subscribe });
      setMessage(data.message);
      setState(subscribe ? 'resubscribed' : 'unsubscribed');
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setMessage(e.response?.data?.message ?? 'Something went wrong. Please try again.');
      setState('error');
    }
  };

  return (
    <div className="page-body center" style={{ minHeight: '100vh', padding: 24 }}>
      <div className="card card-pad" style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)', marginBottom: 18 }}>GoBuyMe</div>
        {!token ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Link incomplete</h1>
            <p className="muted" style={{ fontSize: 14 }}>Open the unsubscribe link straight from the email, or turn off Deals & Offers in your profile.</p>
          </>
        ) : state === 'unsubscribed' ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{message}</h1>
            <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>You&apos;ll still get messages about your orders and account.</p>
            <button className="btn btn-ghost" onClick={() => submit(true)}>Changed your mind? Resubscribe</button>
          </>
        ) : state === 'resubscribed' ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{message}</h1>
            <Link href="/home" className="btn btn-primary" style={{ marginTop: 10 }}>Browse GoBuyMe</Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Unsubscribe from promotions?</h1>
            <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
              You&apos;ll stop getting deals and offers by email, push and SMS. Order and account updates will still reach you.
            </p>
            {state === 'error' && <p className="input-error" style={{ marginBottom: 12 }}>{message}</p>}
            <button className="btn btn-primary btn-block" disabled={state === 'working'} onClick={() => submit(false)}>
              {state === 'working' ? <span className="spin" /> : 'Unsubscribe'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
