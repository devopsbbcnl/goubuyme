'use client';

import { Suspense, useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface Address { id: string; label: string; street: string; city: string; }

// ── Password rules ────────────────────────────────────────────────────────────
const PW_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { key: 'upper',  label: 'One uppercase letter',  test: (v: string) => /[A-Z]/.test(v) },
  { key: 'lower',  label: 'One lowercase letter',  test: (v: string) => /[a-z]/.test(v) },
  { key: 'number', label: 'One number',            test: (v: string) => /[0-9]/.test(v) },
  { key: 'symbol', label: 'One symbol',            test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];
const isStrongPw = (v: string) => PW_RULES.every(r => r.test(v));

function formatPhone(s: string): string {
  const d = s.replace(/\D/g, '');
  if (!d) return '';
  return `+234${d.startsWith('0') ? d.slice(1) : d}`;
}

// ── Inline Auth Panel ─────────────────────────────────────────────────────────
type AuthStage = 'login' | 'signup' | 'otp';

function GuestAuthPanel() {
  const { login } = useAuth();
  const toast = useToast();
  const [stage, setStage] = useState<AuthStage>('login');

  // Login
  const [lEmail, setLEmail] = useState('');
  const [lPw, setLPw] = useState('');
  const [lShowPw, setLShowPw] = useState(false);
  const [lLoading, setLLoading] = useState(false);
  const [lErr, setLErr] = useState('');

  // Signup
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sPw, setSPw] = useState('');
  const [sCPw, setSCPw] = useState('');
  const [sShowPw, setSShowPw] = useState(false);
  const [sLoading, setSLoading] = useState(false);
  const [sErr, setSErr] = useState('');

  // OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [otpErr, setOtpErr] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(60);
  const otpInputs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingEmail = useRef('');
  const pendingPw    = useRef('');

  useEffect(() => {
    if (stage !== 'otp' || otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, otpCooldown]);

  // ── Login ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLErr('');
    setLLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email: lEmail.trim().toLowerCase(), password: lPw });
      const d = data.data;
      login({ id: d.user.id, name: d.user.name, email: d.user.email, phone: d.user.phone, avatar: d.user.avatar, role: d.user.role?.toLowerCase() ?? null, token: d.accessToken }, d.refreshToken);
      toast('Welcome back!', 'success');
    } catch (err: any) {
      const status = err?.response?.status;
      const msg    = err?.response?.data?.message;
      if (status === 404) setLErr('No account found with this email.');
      else if (status === 401) setLErr('Incorrect password. Please try again.');
      else setLErr(msg ?? 'Login failed. Please check your credentials.');
    } finally { setLLoading(false); }
  };

  // ── Signup ──
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sPw !== sCPw) { setSErr('Passwords do not match.'); return; }
    if (!isStrongPw(sPw)) { setSErr('Password must meet all strength requirements.'); return; }
    setSErr('');
    setSLoading(true);
    try {
      const phone = formatPhone(sPhone);
      await api.post('/auth/register', {
        name: sName.trim(), email: sEmail.trim().toLowerCase(), password: sPw,
        role: 'CUSTOMER',
        ...(phone ? { phone } : {}),
      });
      pendingEmail.current = sEmail.trim().toLowerCase();
      pendingPw.current    = sPw;
      setOtp(['', '', '', '', '', '']);
      setOtpCooldown(60);
      setOtpErr('');
      setStage('otp');
      toast('Account created! Check your email for the code.', 'success');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? '';
      if (msg.toLowerCase().includes('email already') || err?.response?.status === 409) {
        setSErr('An account with this email already exists. Sign in instead.');
      } else {
        setSErr(msg || 'Registration failed. Please try again.');
      }
    } finally { setSLoading(false); }
  };

  // ── OTP helpers ──
  const handleOtpChange = (i: number, val: string) => {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...otp]; next[i] = d; setOtp(next);
    if (d && i < 5) otpInputs.current[i + 1]?.focus();
  };

  const handleOtpKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpInputs.current[i - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) { setOtp(paste.split('')); otpInputs.current[5]?.focus(); }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) { setOtpErr('Enter all 6 digits.'); return; }
    setOtpErr('');
    setOtpLoading(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { email: pendingEmail.current, otp: code });
      const d = data.data;
      if (d?.accessToken) {
        login({ id: d.user.id, name: d.user.name, email: d.user.email, phone: d.user.phone, role: 'customer', token: d.accessToken }, d.refreshToken);
        toast('Email verified! You\'re now signed in.', 'success');
      } else {
        // Fallback: auto-login with known credentials
        const res = await api.post('/auth/login', { email: pendingEmail.current, password: pendingPw.current });
        const r = res.data.data;
        login({ id: r.user.id, name: r.user.name, email: r.user.email, phone: r.user.phone, role: 'customer', token: r.accessToken }, r.refreshToken);
        toast('Email verified! You\'re now signed in.', 'success');
      }
    } catch (err: any) {
      setOtpErr(err?.response?.data?.message ?? 'Invalid or expired code. Please try again.');
    } finally { setOtpLoading(false); }
  };

  const handleResendOtp = async () => {
    setOtpResending(true);
    try {
      await api.post('/auth/resend-otp', { email: pendingEmail.current });
      setOtp(['', '', '', '', '', '']);
      setOtpCooldown(60);
      toast('New code sent!', 'success');
    } catch { toast('Failed to resend. Try again.', 'error'); }
    finally { setOtpResending(false); }
  };

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Your Account</h3>

      {stage !== 'otp' ? (
        <>
          {/* Tab switcher */}
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 3, gap: 3, marginBottom: 24 }}>
            {(['login', 'signup'] as AuthStage[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => { setStage(s); setLErr(''); setSErr(''); }}
                style={{
                  flex: 1, height: 38, borderRadius: 'calc(var(--r) - 1px)',
                  fontWeight: stage === s ? 700 : 500,
                  fontSize: 14,
                  background: stage === s ? 'var(--surface)' : 'transparent',
                  color: stage === s ? 'var(--text)' : 'var(--muted)',
                  boxShadow: stage === s ? 'var(--shadow-sm)' : 'none',
                  transition: 'all .15s',
                }}
              >
                {s === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Login form */}
          {stage === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="label">Email address</label>
                <input className="input" type="email" value={lEmail} onChange={e => { setLEmail(e.target.value); setLErr(''); }} placeholder="you@example.com" required />
              </div>
              <div className="form-group">
                <label className="label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={lShowPw ? 'text' : 'password'} value={lPw} onChange={e => { setLPw(e.target.value); setLErr(''); }} placeholder="••••••••" required style={{ paddingRight: 52 }} />
                  <button type="button" onClick={() => setLShowPw(s => !s)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>
                    {lShowPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {lErr && <div className="input-error" style={{ marginBottom: 14 }}>{lErr}</div>}
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={lLoading}>
                {lLoading ? <><span className="spin" />Signing in…</> : 'Sign In & Continue'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
                Don't have an account?{' '}
                <button type="button" onClick={() => { setStage('signup'); setLErr(''); }} style={{ color: 'var(--brand)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                  Create one
                </button>
              </p>
            </form>
          )}

          {/* Signup form */}
          {stage === 'signup' && (
            <form onSubmit={handleSignup}>
              <div className="form-group">
                <label className="label">Full name</label>
                <input className="input" type="text" value={sName} onChange={e => { setSName(e.target.value); setSErr(''); }} placeholder="Chioma Adaeze" required />
              </div>
              <div className="form-group">
                <label className="label">Email address</label>
                <input className="input" type="email" value={sEmail} onChange={e => { setSEmail(e.target.value); setSErr(''); }} placeholder="you@example.com" required />
              </div>
              <div className="form-group">
                <label className="label">Phone number <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                <input className="input" type="tel" value={sPhone} onChange={e => setSPhone(e.target.value)} placeholder="+234 800 000 0000" />
              </div>
              <div className="form-group">
                <label className="label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={sShowPw ? 'text' : 'password'} value={sPw} onChange={e => { setSPw(e.target.value); setSErr(''); }} placeholder="Create a strong password" required style={{ paddingRight: 52 }} />
                  <button type="button" onClick={() => setSShowPw(s => !s)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>
                    {sShowPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                {/* Password strength indicator */}
                {sPw.length > 0 && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {PW_RULES.map(r => {
                      const ok = r.test(sPw);
                      return (
                        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                          <span style={{ color: ok ? 'var(--success)' : 'var(--muted)', fontSize: 14, lineHeight: 1 }}>{ok ? '✓' : '○'}</span>
                          <span style={{ color: ok ? 'var(--success)' : 'var(--muted)', fontWeight: ok ? 600 : 400 }}>{r.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="label">Confirm password</label>
                <input className="input" type="password" value={sCPw} onChange={e => { setSCPw(e.target.value); setSErr(''); }} placeholder="Repeat password" required />
              </div>
              {sErr && <div className="input-error" style={{ marginBottom: 14 }}>{sErr}</div>}
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={sLoading}>
                {sLoading ? <><span className="spin" />Creating account…</> : 'Create Account & Continue'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
                Already have an account?{' '}
                <button type="button" onClick={() => { setStage('login'); setSErr(''); }} style={{ color: 'var(--brand)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                  Sign in
                </button>
              </p>
            </form>
          )}
        </>
      ) : (
        /* OTP step */
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
          <h4 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Check your email</h4>
          <p className="muted" style={{ fontSize: 13, marginBottom: 4 }}>We sent a 6-digit code to</p>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 24 }}>{pendingEmail.current}</p>

          <div className="otp-row" onPaste={handleOtpPaste}>
            {otp.map((v, i) => (
              <input
                key={i}
                ref={el => { otpInputs.current[i] = el; }}
                className="otp-input"
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={v}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={handleOtpKey(i)}
                style={{ borderColor: otpErr ? 'var(--error)' : undefined }}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {otpErr && <div className="input-error" style={{ marginBottom: 16, textAlign: 'center' }}>{otpErr}</div>}

          <button className="btn btn-primary btn-block btn-lg" onClick={handleVerifyOtp} disabled={otpLoading} style={{ marginBottom: 16 }}>
            {otpLoading ? <><span className="spin" />Verifying…</> : 'Verify & Continue'}
          </button>

          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            Didn't get the code?{' '}
            {otpCooldown > 0 ? (
              <span>Resend in {otpCooldown}s</span>
            ) : (
              <button onClick={handleResendOtp} disabled={otpResending} style={{ color: 'var(--brand)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                {otpResending ? 'Sending…' : 'Resend'}
              </button>
            )}
          </p>
          <button type="button" onClick={() => setStage('login')} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
            ← Back to Sign In
          </button>
        </div>
      )}
    </div>
  );
}

// ── CheckoutContent ───────────────────────────────────────────────────────────
function CheckoutContent() {
  const { user, loading: authLoading } = useAuth();
  const { items, totalAmount, clearCart } = useCart();
  const router = useRouter();
  const toast = useToast();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddr, setSelectedAddr] = useState('');
  const payMethod = 'PAYSTACK';
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  useEffect(() => {
    if (user) {
      api.get('/addresses').then(r => {
        const list = r.data.data ?? [];
        setAddresses(list);
        if (list.length) setSelectedAddr(list[0].id);
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user || !selectedAddr || !items.length) { setDeliveryFee(null); return; }
    setFeeLoading(true);
    api.get('/orders/estimate-fee', { params: { addressId: selectedAddr, vendorId: items[0].vendorId } })
      .then(r => setDeliveryFee(r.data.data.deliveryFee))
      .catch(() => setDeliveryFee(null))
      .finally(() => setFeeLoading(false));
  }, [selectedAddr, user, items]);

  const place = async () => {
    if (!selectedAddr) { toast('Select a delivery address', 'error'); return; }
    if (!items.length) { toast('Your cart is empty', 'error'); return; }
    setPlacing(true);
    try {
      const { data } = await api.post('/orders', {
        deliveryAddressId: selectedAddr, paymentMethod: payMethod, note,
      });
      if (data.data?.paystackUrl) {
        window.location.href = data.data.paystackUrl;
      } else {
        clearCart();
        toast('Order placed!', 'success');
        router.replace(`/orders/${data.data.order?.id ?? ''}`);
      }
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Failed to place order.', 'error');
    } finally { setPlacing(false); }
  };

  if (authLoading) return null;

  return (
    <div className="page-body">
      <div className="inner">
        <h1 className="t-page" style={{ marginBottom: 28 }}>Checkout</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28, alignItems: 'start' }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!user ? (
              /* Guest: show inline auth panel */
              <GuestAuthPanel />
            ) : (
              /* Logged-in: show normal checkout sections */
              <>
                <div className="card card-pad">
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>📍 Delivery Address</h3>
                  {addresses.length === 0 ? (
                    <p className="muted" style={{ fontSize: 14 }}>No saved addresses. <a href="/profile/addresses" style={{ color: 'var(--brand)' }}>Add one →</a></p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {addresses.map(a => (
                        <label key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: 14, borderRadius: 'var(--r)', border: `1.5px solid ${selectedAddr === a.id ? 'var(--brand)' : 'var(--line)'}`, background: selectedAddr === a.id ? 'var(--brand-tint)' : 'var(--surface)' }}>
                          <input type="radio" name="addr" value={a.id} checked={selectedAddr === a.id} onChange={() => setSelectedAddr(a.id)} style={{ marginTop: 2 }} />
                          <div><div style={{ fontWeight: 700, fontSize: 14 }}>{a.label}</div><div className="muted" style={{ fontSize: 13 }}>{a.street}, {a.city}</div></div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

<div className="card card-pad">
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>📝 Order Note (Optional)</h3>
                  <textarea className="textarea" placeholder="Any special instructions?" value={note} onChange={e => setNote(e.target.value)} style={{ minHeight: 80 }} />
                </div>
              </>
            )}
          </div>

          {/* Right column — always visible */}
          <div style={{ position: 'sticky', top: 'calc(var(--total-nav-h) + 20px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card card-pad">
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>Order Summary</h3>
              {items.length === 0 ? (
                <p className="muted" style={{ fontSize: 14 }}>Your cart is empty.</p>
              ) : (
                <>
                  {items.map(i => (
                    <div key={i.menuItemId} className="between" style={{ fontSize: 13, marginBottom: 10 }}>
                      <span>{i.name} × {i.qty}</span>
                      <span style={{ fontWeight: 700 }}>₦{(i.price * i.qty).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="divider" />
                  <div className="between" style={{ marginBottom: 8 }}><span className="muted">Subtotal</span><span style={{ fontWeight: 700 }}>₦{totalAmount.toLocaleString()}</span></div>
                  <div className="between" style={{ marginBottom: 8 }}>
                    <span className="muted">Delivery</span>
                    <span style={{ fontWeight: 700 }}>
                      {feeLoading ? '…' : deliveryFee !== null ? `₦${deliveryFee.toLocaleString()}` : '—'}
                    </span>
                  </div>
                  <div className="divider" />
                  <div className="between" style={{ marginBottom: 24 }}>
                    <span style={{ fontWeight: 700 }}>Total</span>
                    <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--brand)' }}>
                      {deliveryFee !== null ? `₦${(totalAmount + deliveryFee).toLocaleString()}` : `₦${totalAmount.toLocaleString()}`}
                    </span>
                  </div>
                </>
              )}
              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={place}
                disabled={placing || !user || items.length === 0}
              >
                {placing ? <><span className="spin" />Placing order…</> : !user ? 'Sign in to continue' : 'Place Order →'}
              </button>
            </div>

            {!user && (
              <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
                Sign in or create an account on the left to place your order. Already have an account?{' '}
                <Link href="/login?next=/checkout" style={{ color: 'var(--brand)', fontWeight: 600 }}>Full login page →</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={null}><CheckoutContent /></Suspense>;
}
