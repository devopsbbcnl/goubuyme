'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

function ResetPasswordContent() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      toast('Password reset — sign in with your new password.', 'success');
      router.replace('/login');
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Could not reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="footer-logo" style={{ marginBottom: 32 }}>
          <Image src="/images/logo.png" alt="GoBuyMe" width={140} height={46} style={{ objectFit: 'contain', display: 'block' }} />
        </div>
        <h1>Hungry?<br />GoBuyMe.</h1>
        <p style={{ marginTop: 16 }}>Order food, groceries, and more from 500+ vendors across Nigeria — delivered to your door in 25 minutes or less.</p>
      </div>

      <div className="auth-right">
        <Link href="/" style={{ marginBottom: 36, display: 'inline-block' }}>
          <Image src="/images/logo.png" alt="GoBuyMe" width={140} height={46} style={{ objectFit: 'contain', display: 'block' }} />
        </Link>

        {!token ? (
          <>
            <h2>Invalid reset link</h2>
            <p className="sub">This link is missing its reset token. Request a new one below.</p>
            <Link href="/forgot-password" className="btn btn-primary btn-block btn-lg" style={{ marginTop: 24, textAlign: 'center' }}>
              Request New Link
            </Link>
          </>
        ) : (
          <>
            <h2>Set a new password</h2>
            <p className="sub">Choose a new password for your account.</p>

            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label">New password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                    style={{ paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Confirm new password</label>
                <input
                  className="input"
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {err && <div className="input-error" style={{ marginBottom: 14, fontSize: 13 }}>{err}</div>}

              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
                {loading ? <><span className="spin" />Resetting…</> : 'Reset Password'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--muted)' }}>
              <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>Back to Sign In</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordContent /></Suspense>;
}
