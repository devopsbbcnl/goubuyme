'use client';

import { Suspense, useState, useRef, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const toast = useToast();
  const email = searchParams.get('email') ?? '';
  const role = searchParams.get('role') ?? 'customer';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [err, setErr] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handleChange = (i: number, val: string) => {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...otp]; next[i] = d; setOtp(next);
    if (d && i < 5) inputs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) { setOtp(paste.split('')); inputs.current[5]?.focus(); }
  };

  const submit = async () => {
    const code = otp.join('');
    if (code.length < 6) { setErr('Enter all 6 digits.'); return; }
    setErr(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { email, otp: code });
      const d = data.data;
      if (d?.accessToken) {
        login({ id: d.user.id, name: d.user.name, email: d.user.email, phone: d.user.phone, role: role as any, token: d.accessToken }, d.refreshToken);
        toast('Email verified! Welcome to GoBuyMe.', 'success');
        if (role === 'vendor') router.replace('/vendor');
        else if (role === 'rider') router.replace('/rider');
        else router.replace('/home');
      } else {
        toast('Email verified!', 'success');
        router.replace('/login');
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Invalid or expired OTP.');
    } finally { setLoading(false); }
  };

  const resend = async () => {
    setResending(true);
    try { await api.post('/auth/resend-otp', { email }); toast('New OTP sent!', 'success'); }
    catch { toast('Failed to resend. Try again.', 'error'); }
    finally { setResending(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <Link href="/" className="logo" style={{ justifyContent: 'center', fontSize: 26, marginBottom: 40, display: 'flex' }}>
          <span className="go">Go</span><span className="buy">Buy</span><span className="me">Me</span>
        </Link>
        <div style={{ fontSize: 56, marginBottom: 20 }}>📧</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Check your email</h2>
        <p className="muted" style={{ fontSize: 14, marginBottom: 4 }}>We sent a 6-digit code to</p>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 32 }}>{email}</p>

        <div className="otp-row" onPaste={handlePaste}>
          {otp.map((v, i) => (
            <input key={i} ref={el => { inputs.current[i] = el; }} className="otp-input" type="text" inputMode="numeric" maxLength={1} value={v} onChange={e => handleChange(i, e.target.value)} onKeyDown={handleKey(i)} />
          ))}
        </div>

        {err && <div className="input-error" style={{ marginBottom: 16 }}>{err}</div>}

        <button className="btn btn-primary btn-block btn-lg" onClick={submit} disabled={loading}>
          {loading ? <><span className="spin" />Verifying…</> : 'Verify Email'}
        </button>

        <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
          Didn't get the code?{' '}
          <button onClick={resend} disabled={resending} style={{ color: 'var(--brand)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
            {resending ? 'Sending…' : 'Resend'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return <Suspense fallback={null}><VerifyOtpContent /></Suspense>;
}
