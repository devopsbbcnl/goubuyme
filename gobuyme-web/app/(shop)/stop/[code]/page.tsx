'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/services/api';

// Reached from the opt-out link in SMS/email sent to businesses we found (not GoBuyMe users).
// It asks for a click instead of opting out on page load, because link scanners open every link.
export default function StopMessagesPage() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<'idle' | 'working' | 'stopped' | 'resumed' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (resubscribe: boolean) => {
    setState('working');
    try {
      const { data } = await api.post('/marketing/lead-stop', { code, resubscribe });
      setMessage(data.message);
      setState(resubscribe ? 'resumed' : 'stopped');
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
        {state === 'stopped' ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{message}</h1>
            <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>Sorry to bother you. We won&apos;t send promotional SMS or email to this number or address again.</p>
            <button className="btn btn-ghost" onClick={() => submit(true)}>Pressed by mistake? Start messages again</button>
          </>
        ) : state === 'resumed' ? (
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>{message}</h1>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Stop messages from GoBuyMe?</h1>
            <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
              We contacted your business about selling on GoBuyMe. Confirm below and we&apos;ll stop sending SMS and email.
            </p>
            {state === 'error' && <p className="input-error" style={{ marginBottom: 12 }}>{message}</p>}
            <button className="btn btn-primary btn-block" disabled={state === 'working'} onClick={() => submit(false)}>
              {state === 'working' ? <span className="spin" /> : 'Stop messages'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
