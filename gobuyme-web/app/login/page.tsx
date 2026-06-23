'use client';

import { Suspense, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

const PING_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1') + '/settings/public';

function LoginContent() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(PING_URL, { signal: ctrl.signal });
        if (!res.ok) throw new Error('offline');
        clearTimeout(timer);
        if (!cancelled) setBackendOnline(true);
      } catch {
        if (!cancelled) setBackendOnline(false);
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const d = data.data;
      login({
        id: d.user.id, name: d.user.name, email: d.user.email,
        phone: d.user.phone, avatar: d.user.avatar,
        role: d.user.role?.toLowerCase() ?? null,
        token: d.accessToken,
      }, d.refreshToken);
      toast('Welcome back!', 'success');
      const role = d.user.role?.toLowerCase();
      if (role === 'vendor') router.replace('/vendor');
      else if (role === 'rider') router.replace('/rider');
      else router.replace(next === '/' ? '/home' : next);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Login failed. Check your credentials.');
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
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {['⚡ 25-minute guaranteed delivery', '🛒 500+ vendors across Nigeria', '🔒 Secure payments via Paystack'].map(t => (
            <div key={t} style={{ fontSize: 14, opacity: .85 }}>{t}</div>
          ))}
        </div>
      </div>

      <div className="auth-right" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 20, right: 24 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: backendOnline ? '#22C55E' : '#EF4444',
          }} />
        </div>

        <Link href="/" style={{ marginBottom: 36, display: 'inline-block' }}>
          <Image src="/images/logo.png" alt="GoBuyMe" width={140} height={46} style={{ objectFit: 'contain', display: 'block' }} />
        </Link>
        <h2>Welcome back</h2>
        <p className="sub">Sign in to your account</p>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="label">Email address</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="form-group">
            <div className="between" style={{ marginBottom: 6 }}>
              <label className="label" style={{ margin: 0 }}>Password</label>
              <Link href="/forgot-password" style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>Forgot password?</Link>
            </div>
            <div style={{ position: 'relative' }}>
              <input className="input" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ paddingRight: 44 }} />
              <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {err && <div className="input-error" style={{ marginBottom: 14, fontSize: 13 }}>{err}</div>}

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            {loading ? <><span className="spin" />Signing in…</> : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--muted)' }}>
          Don't have an account?{' '}
          <Link href="/onboarding" style={{ color: 'var(--brand)', fontWeight: 700 }}>Register</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginContent /></Suspense>;
}
