'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface Props {
  next?: string;
  label?: 'signin_with' | 'signup_with' | 'continue_with';
}

export default function GoogleSignInButton({ next = '/', label = 'continue_with' }: Props) {
  const { login } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [err, setErr] = useState('');

  // A first-time Google sign-up must declare age and accept the terms before the account is created.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [adult, setAdult] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const signIn = useCallback(async (idToken: string, declared: boolean) => {
    setErr('');
    try {
      const { data } = await api.post('/auth/google', {
        idToken,
        ...(declared ? { confirmedAdult: true, acceptedTerms: true } : {}),
      });
      setPendingToken(null);
      const d = data.data;
      login({
        id: d.user.id, name: d.user.name, email: d.user.email,
        phone: d.user.phone, avatar: d.user.avatar,
        role: d.user.role?.toLowerCase() ?? null,
      });
      toast('Signed in with Google!', 'success');
      router.replace(next);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string; errors?: { code?: string }[] } } };
      if (axiosErr.response?.data?.errors?.some(x => x.code === 'AGE_CONFIRMATION_REQUIRED')) {
        setPendingToken(idToken);
        return;
      }
      setErr(axiosErr.response?.data?.message ?? 'Google sign-in failed. Please try again.');
    }
  }, [login, next, router, toast]);

  const handleCredential = useCallback(
    (response: { credential: string }) => signIn(response.credential, false),
    [signIn],
  );

  useEffect(() => {
    if (!scriptReady || !GOOGLE_CLIENT_ID || !containerRef.current || !window.google) return;

    // React 18 Strict Mode (dev) mounts, cleans up, then re-mounts every component once.
    // Without clearing the container first, renderButton() appends a second <div> button
    // into the same node on the re-mount, so two independent GSI click handlers end up
    // stacked in one spot — clicking triggers two popup opens and the browser blocks the
    // second one ("Opening multiple popups was blocked due to lack of user activation").
    containerRef.current.innerHTML = '';

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredential,
    });

    window.google.accounts.id.renderButton(containerRef.current, {
      theme: 'outline',
      size: 'large',
      width: 360,
      text: label,
      shape: 'rectangular',
    });
  }, [scriptReady, handleCredential, label]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} style={{ display: pendingToken ? 'none' : 'flex', justifyContent: 'center' }} />
      {pendingToken && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>One last step to create your account:</div>
          <label style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)}
              style={{ marginTop: 3, accentColor: 'var(--brand)', width: 16, height: 16, flexShrink: 0 }} />
            I confirm that I am 18 years of age or older.
          </label>
          <label style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 3, accentColor: 'var(--brand)', width: 16, height: 16, flexShrink: 0 }} />
            <span>
              I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 700 }}>Terms of Service</a>{' '}
              and <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 700 }}>Privacy Policy</a>.
            </span>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" disabled={!adult || !agreed}
              onClick={() => void signIn(pendingToken, true)}>Create account</button>
            <button type="button" className="btn" onClick={() => { setPendingToken(null); setAdult(false); setAgreed(false); }}>Cancel</button>
          </div>
        </div>
      )}
      {err && <div className="input-error" style={{ marginTop: 10, fontSize: 13, textAlign: 'center' }}>{err}</div>}
    </div>
  );
}
