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

  const handleCredential = useCallback(async (response: { credential: string }) => {
    setErr('');
    try {
      const { data } = await api.post('/auth/google', { idToken: response.credential });
      const d = data.data;
      login({
        id: d.user.id, name: d.user.name, email: d.user.email,
        phone: d.user.phone, avatar: d.user.avatar,
        role: d.user.role?.toLowerCase() ?? null,
      });
      toast('Signed in with Google!', 'success');
      router.replace(next);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setErr(axiosErr.response?.data?.message ?? 'Google sign-in failed. Please try again.');
    }
  }, [login, next, router, toast]);

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
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />
      {err && <div className="input-error" style={{ marginTop: 10, fontSize: 13, textAlign: 'center' }}>{err}</div>}
    </div>
  );
}
