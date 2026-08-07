'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import api from '@/services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      // Backend always returns success regardless of whether the email exists,
      // so it can't be used to enumerate registered accounts.
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Something went wrong. Please try again.');
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

        {sent ? (
          <>
            <h2>Check your email</h2>
            <p className="sub">
              If an account exists for <strong>{email}</strong>, we've sent a link to reset your password. It expires in 1 hour.
            </p>
            <Link href="/login" className="btn btn-primary btn-block btn-lg" style={{ marginTop: 24, textAlign: 'center' }}>
              Back to Sign In
            </Link>
          </>
        ) : (
          <>
            <h2>Forgot your password?</h2>
            <p className="sub">Enter your email and we'll send you a reset link.</p>

            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label">Email address</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              {err && <div className="input-error" style={{ marginBottom: 14, fontSize: 13 }}>{err}</div>}

              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
                {loading ? <><span className="spin" />Sending…</> : 'Send Reset Link'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--muted)' }}>
              Remembered your password?{' '}
              <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>Sign In</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
