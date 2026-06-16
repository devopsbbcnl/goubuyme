'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

const ROLE_LABELS: Record<string, string> = { customer: 'Customer', vendor: 'Vendor', rider: 'Rider' };
const ROLE_ICONS: Record<string, string> = { customer: '🛒', vendor: '🏪', rider: '🏍️' };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
const HEALTH_URL = API_BASE.replace(/\/api\/v1\/?$/, '') + '/health';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const role = searchParams.get('role') ?? 'customer';

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        await fetch(HEALTH_URL, { signal: ctrl.signal, mode: 'no-cors' });
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

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setErr('Passwords do not match.'); return; }
    if (!agreed) { setErr('You must agree to the Terms of Service and Privacy Policy.'); return; }
    setErr(''); setLoading(true);
    try {
      await api.post('/auth/register', { name: form.name, email: form.email, phone: form.phone, password: form.password, role: role.toUpperCase() });
      toast('Account created! Check your email for OTP.', 'success');
      router.push(`/verify-otp?email=${encodeURIComponent(form.email)}&role=${role}`);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Registration failed. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <Link href="/" className="logo" style={{ marginBottom: 40, fontSize: 26 }}>
          <span className="go">Go</span><span style={{ color: 'rgba(255,255,255,.8)' }}>Buy</span><span style={{ color: 'rgba(255,255,255,.8)' }}>Me</span>
        </Link>
        <div style={{ fontSize: 56, marginBottom: 24 }}>{ROLE_ICONS[role] ?? '🛒'}</div>
        <h1>Join as a<br />{ROLE_LABELS[role] ?? 'User'}</h1>
        <p style={{ marginTop: 16 }}>
          {role === 'customer' && 'Order from 500+ vendors and get delivered to your door in minutes.'}
          {role === 'vendor' && 'Reach thousands of customers and grow your business with GoBuyMe.'}
          {role === 'rider' && 'Set your own schedule and earn great money delivering in your city.'}
        </p>
      </div>

      <div className="auth-right" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 20, right: 24 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: backendOnline ? '#22C55E' : '#EF4444',
          }} />
        </div>

        <h2>Create your account</h2>
        <p className="sub">Registering as a <strong>{ROLE_LABELS[role]}</strong></p>

        <form onSubmit={submit}>
          <div className="form-group"><label className="label">Full Name</label><input className="input" type="text" value={form.name} onChange={set('name')} placeholder="John Doe" required /></div>
          <div className="form-group"><label className="label">Email Address</label><input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required /></div>
          <div className="form-group"><label className="label">Phone Number</label><input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+234 800 000 0000" required /></div>
          <div className="form-group">
            <label className="label">Password</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required minLength={8} style={{ paddingRight: 44 }} />
              <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>{show ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <div className="form-group"><label className="label">Confirm Password</label><input className="input" type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" required /></div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '4px 0 20px' }}>
            <input
              type="checkbox"
              id="agree"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 3, accentColor: 'var(--brand)', flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="agree" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, cursor: 'pointer' }}>
              I agree to the{' '}
              <Link href="/terms" target="_blank" style={{ color: 'var(--brand)', fontWeight: 700 }}>Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" target="_blank" style={{ color: 'var(--brand)', fontWeight: 700 }}>Privacy Policy</Link>
            </label>
          </div>

          {err && <div className="input-error" style={{ marginBottom: 14 }}>{err}</div>}
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading || !agreed}>
            {loading ? <><span className="spin" />Creating account…</> : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--muted)' }}>
          Already have an account? <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>Sign in</Link>
        </p>
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>
          Wrong role? <Link href="/role-select" style={{ color: 'var(--brand)', fontWeight: 700 }}>Go back</Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return <Suspense fallback={null}><RegisterContent /></Suspense>;
}
