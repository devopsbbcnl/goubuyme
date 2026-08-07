'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import api from '@/services/api';

type VerifyState = 'checking' | 'success' | 'failed';

function PaymentVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: authLoading } = useAuth();
  const { clearCart } = useCart();
  // Paystack's hosted checkout appends the transaction reference as either
  // `reference` or `trxref` depending on flow — accept both.
  const reference = searchParams.get('reference') ?? searchParams.get('trxref') ?? '';

  const [state, setState] = useState<VerifyState>('checking');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!reference) { setState('failed'); setErrorMsg('No payment reference found.'); return; }

    api.post('/payments/verify', { reference })
      .then(r => {
        const d = r.data.data;
        if (d?.status === 'success') {
          clearCart();
          setOrderId(d.orderId ?? null);
          setState('success');
        } else {
          setState('failed');
          setErrorMsg('Payment could not be confirmed.');
        }
      })
      .catch(e => {
        setState('failed');
        setErrorMsg(e?.response?.data?.message ?? 'Payment verification failed.');
      });
  }, [authLoading, reference]);

  useEffect(() => {
    if (state === 'success') {
      const t = setTimeout(() => router.replace(orderId ? `/orders/${orderId}` : '/orders'), 1800);
      return () => clearTimeout(t);
    }
  }, [state, orderId, router]);

  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 480, margin: '0 auto', paddingTop: 60 }}>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          {state === 'checking' && (
            <>
              <div style={{ fontSize: 44, marginBottom: 12 }}>⏳</div>
              <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Confirming your payment…</h1>
              <p className="muted" style={{ fontSize: 13 }}>Please don't close this page.</p>
            </>
          )}
          {state === 'success' && (
            <>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
              <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: 'var(--success)' }}>Payment successful!</h1>
              <p className="muted" style={{ fontSize: 13 }}>Redirecting to your order…</p>
            </>
          )}
          {state === 'failed' && (
            <>
              <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
              <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: 'var(--error)' }}>Payment not confirmed</h1>
              <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>{errorMsg}</p>
              <button className="btn btn-primary" onClick={() => router.replace('/orders')}>View my orders</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentVerifyPage() {
  return <Suspense fallback={null}><PaymentVerifyContent /></Suspense>;
}
