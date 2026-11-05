'use client';

import { Suspense, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';

const ROLE_LABELS: Record<string, string> = { customer: 'Customer', vendor: 'Vendor', rider: 'Rider', logistics_company: 'Logistics Company' };
const ROLE_ICONS: Record<string, string> = { customer: '🛒', vendor: '🏪', rider: '🏍️', logistics_company: '🚚' };

const MAX_SIGNUP_BRANCHES = 10;
interface BranchDraft { name: string; address: string; city: string; phone: string }

const VENDOR_CATEGORIES = [
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'EMART', label: 'EMart' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'DRINKS', label: 'Drinks' },
  { value: 'BUTCHER', label: 'Butcher / Meat & Fish' },
  { value: 'GAS', label: 'Gas' },
];

const STEP_LABELS: Record<string, string> = {
  details: 'Business Details',
  riderDetails: 'Rider Details',
  companyDetails: 'Company Details',
  account: 'Account Info',
  security: 'Security',
};

const PING_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1') + '/settings/public';

function PasswordRules({ password }: { password: string }) {
  if (!password) return null;
  const rules = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
    { label: 'Symbol', met: /[^A-Za-z0-9]/.test(password) },
  ];
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rules.map(({ label, met }) => (
        <div
          key={label}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: met ? '#22C55E' : 'var(--muted)',
            transition: 'color 0.15s',
          }}
        >
          <span style={{ width: 14, flexShrink: 0 }}>{met ? '✓' : '○'}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const role = searchParams.get('role') ?? 'customer';

  const steps = role === 'vendor' ? ['details', 'account', 'security']
    : role === 'rider' ? ['riderDetails', 'account', 'security']
    : role === 'logistics_company' ? ['companyDetails', 'account', 'security']
    : ['account', 'security'];
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [vendorForm, setVendorForm] = useState({ businessName: '', category: 'RESTAURANT', address: '', city: '', state: '' });
  const [riderForm, setRiderForm] = useState({ vehicleType: '', plateNumber: '', address: '', city: '', state: '' });
  const [companyForm, setCompanyForm] = useState({ companyName: '', registrationNumber: '', address: '', city: '', state: '' });
  const [branches, setBranches] = useState<BranchDraft[]>([]);
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Once the backend is confirmed online there's nothing left to watch for —
    // re-polling every 5s for the lifetime of an open tab was hitting the API's
    // rate limiter and flooding the error log. Only keep retrying while offline.
    const check = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(PING_URL, { signal: ctrl.signal });
        clearTimeout(timer);
        if (cancelled) return;
        if (!res.ok) throw new Error('offline');
        setBackendOnline(true);
      } catch {
        if (cancelled) return;
        setBackendOnline(false);
        retryTimer = setTimeout(check, 5000);
      }
    };
    check();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVendor = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setVendorForm(f => ({ ...f, [k]: e.target.value }));
  const setRider = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setRiderForm(f => ({ ...f, [k]: e.target.value }));
  const setCompany = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setCompanyForm(f => ({ ...f, [k]: e.target.value }));
  const addBranch = () => setBranches(b => (b.length >= MAX_SIGNUP_BRANCHES ? b : [...b, { name: '', address: '', city: vendorForm.city.trim(), phone: '' }]));
  const updateBranch = (i: number, patch: Partial<BranchDraft>) => setBranches(b => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeBranch = (i: number) => setBranches(b => b.filter((_, idx) => idx !== i));

  const validateStep = (step: string): string | null => {
    if (step === 'details') {
      if (!vendorForm.businessName.trim() || !vendorForm.address.trim() || !vendorForm.city.trim() || !vendorForm.state.trim()) {
        return 'Please fill in your business details.';
      }
      if (branches.some(b => b.name.trim().length < 2 || b.address.trim().length < 3 || b.city.trim().length < 2)) {
        return 'Each branch needs a name, address and city. Remove any branch you do not need.';
      }
      if (branches.some(b => b.phone.trim() && !/^[+]?[0-9]{10,15}$/.test(b.phone.trim()))) {
        return 'Enter valid branch phone numbers (digits only, e.g. 08031234567) or leave them blank.';
      }
    }
    if (step === 'companyDetails') {
      if (companyForm.companyName.trim().length < 2 || !companyForm.address.trim() || !companyForm.city.trim() || !companyForm.state.trim()) {
        return 'Please fill in your company details.';
      }
    }
    if (step === 'riderDetails') {
      if (!riderForm.vehicleType.trim() || !riderForm.address.trim() || !riderForm.city.trim() || !riderForm.state.trim()) {
        return 'Please fill in your rider details.';
      }
    }
    if (step === 'account') {
      if (!form.name.trim()) return 'Enter your full name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.';
      if (!form.phone.trim()) return 'Enter your phone number.';
    }
    return null;
  };

  const goNext = () => {
    const validationError = validateStep(currentStep);
    if (validationError) { setErr(validationError); return; }
    setErr('');
    setStepIndex(i => i + 1);
  };

  const goBack = () => {
    setErr('');
    setStepIndex(i => i - 1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep !== 'security') { goNext(); return; }

    if (form.password !== form.confirm) { setErr('Passwords do not match.'); return; }
    if (!agreed) { setErr('You must agree to the Terms of Service and Privacy Policy.'); return; }
    setErr(''); setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name, email: form.email, phone: form.phone, password: form.password, role: role.toUpperCase(),
      };
      if (role === 'vendor') {
        payload.businessName = vendorForm.businessName.trim();
        payload.category = vendorForm.category;
        payload.address = vendorForm.address.trim();
        payload.city = vendorForm.city.trim();
        payload.state = vendorForm.state.trim();
        payload.commissionTier = 'TIER_2';
        if (branches.length > 0) {
          payload.branches = branches.map(b => ({
            name: b.name.trim(), address: b.address.trim(), city: b.city.trim(), state: vendorForm.state.trim(),
            ...(b.phone.trim() ? { phone: b.phone.trim() } : {}),
          }));
        }
      }
      if (role === 'logistics_company') {
        payload.companyName = companyForm.companyName.trim();
        if (companyForm.registrationNumber.trim()) payload.registrationNumber = companyForm.registrationNumber.trim();
        payload.address = companyForm.address.trim();
        payload.city = companyForm.city.trim();
        payload.state = companyForm.state.trim();
      }
      if (role === 'rider') {
        payload.vehicleType = riderForm.vehicleType.trim();
        if (riderForm.plateNumber.trim()) payload.plateNumber = riderForm.plateNumber.trim().toUpperCase();
        payload.address = riderForm.address.trim();
        payload.city = riderForm.city.trim();
        payload.state = riderForm.state.trim();
      }
      const { data } = await api.post('/auth/register', payload);
      const userId = data.data.userId;
      toast('Account created! Check your email for OTP.', 'success');
      router.push(`/verify-otp?userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(form.email)}&role=${role}`);
    } catch (e: any) {
      const fieldError = e?.response?.data?.errors?.[0]?.message;
      setErr(fieldError ?? e?.response?.data?.message ?? 'Registration failed. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <Link href="/" className="footer-logo" style={{ marginBottom: 40 }}>
          <Image src="/images/logo.png" alt="GoBuyMe" width={140} height={46} style={{ objectFit: 'contain', display: 'block' }} />
        </Link>
        <div style={{ fontSize: 56, marginBottom: 24 }}>{ROLE_ICONS[role] ?? '🛒'}</div>
        <h1>Join as a<br />{ROLE_LABELS[role] ?? 'User'}</h1>
        <p style={{ marginTop: 16 }}>
          {role === 'customer' && 'Order from local Owerri vendors and get delivered to your door in minutes.'}
          {role === 'vendor' && 'Reach thousands of customers and grow your business with GoBuyMe.'}
          {role === 'rider' && 'Set your own schedule and earn great money delivering in your city.'}
          {role === 'logistics_company' && 'Register your company, invite your riders and manage your whole fleet from one dashboard.'}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 24px' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1 }}>
              <div style={{
                height: 4, borderRadius: 999,
                background: i <= stepIndex ? 'var(--brand)' : 'var(--line)',
              }} />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 20 }}>
          Step {stepIndex + 1} of {steps.length} · {STEP_LABELS[currentStep]}
        </p>

        {role === 'customer' && currentStep === 'account' && (
          <>
            <GoogleSignInButton next="/" label="signup_with" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>OR SIGN UP WITH EMAIL</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
          </>
        )}

        <form onSubmit={submit}>
          {currentStep === 'details' && (
            <>
              <div className="form-group"><label className="label">Business Name</label><input className="input" type="text" value={vendorForm.businessName} onChange={setVendor('businessName')} placeholder="Mama Put Kitchen" required /></div>
              <div className="form-group">
                <label className="label">Business Category</label>
                <select className="input" value={vendorForm.category} onChange={setVendor('category')} required>
                  {VENDOR_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="label">Street Address</label><input className="input" type="text" value={vendorForm.address} onChange={setVendor('address')} placeholder="12 Wetheral Road" required /></div>
              <div className="form-group"><label className="label">City</label><input className="input" type="text" value={vendorForm.city} onChange={setVendor('city')} placeholder="Owerri" required /></div>
              <div className="form-group"><label className="label">State</label><input className="input" type="text" value={vendorForm.state} onChange={setVendor('state')} placeholder="Imo" required /></div>
            </>
          )}
          {currentStep === 'details' && (
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <label className="label">Branches (optional)</label>
              <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                The address above is your main location. Add other branches now, or manage them later from your dashboard.
              </p>
              {branches.map((b, i) => (
                <div key={i} className="card card-pad" style={{ marginBottom: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <strong style={{ fontSize: 14 }}>Branch {i + 1}</strong>
                    <button type="button" onClick={() => removeBranch(i)} style={{ color: 'var(--error)', fontSize: 13, fontWeight: 600 }}>Remove</button>
                  </div>
                  <div className="form-group"><label className="label">Branch Name</label><input className="input" type="text" value={b.name} onChange={e => updateBranch(i, { name: e.target.value })} placeholder="e.g. Rumuola branch" /></div>
                  <div className="form-group"><label className="label">Street Address</label><input className="input" type="text" value={b.address} onChange={e => updateBranch(i, { address: e.target.value })} placeholder="5 Rumuola Road" /></div>
                  <div className="form-group"><label className="label">City</label><input className="input" type="text" value={b.city} onChange={e => updateBranch(i, { city: e.target.value })} placeholder="Port Harcourt" /></div>
                  <div className="form-group"><label className="label">Phone (optional)</label><input className="input" type="tel" value={b.phone} onChange={e => updateBranch(i, { phone: e.target.value })} placeholder="08031234567" /></div>
                </div>
              ))}
              {branches.length < MAX_SIGNUP_BRANCHES && (
                <button type="button" className="btn btn-ghost" onClick={addBranch} style={{ width: '100%' }}>+ Add a branch</button>
              )}
            </div>
          )}
          {currentStep === 'companyDetails' && (
            <>
              <div className="form-group"><label className="label">Company Name</label><input className="input" type="text" value={companyForm.companyName} onChange={setCompany('companyName')} placeholder="Swift Riders Logistics" required /></div>
              <div className="form-group"><label className="label">CAC Registration Number (optional)</label><input className="input" type="text" value={companyForm.registrationNumber} onChange={setCompany('registrationNumber')} placeholder="RC 1234567" /></div>
              <div className="form-group"><label className="label">Office Address</label><input className="input" type="text" value={companyForm.address} onChange={setCompany('address')} placeholder="12 Aba Road" required /></div>
              <div className="form-group"><label className="label">City</label><input className="input" type="text" value={companyForm.city} onChange={setCompany('city')} placeholder="Port Harcourt" required /></div>
              <div className="form-group"><label className="label">State</label><input className="input" type="text" value={companyForm.state} onChange={setCompany('state')} placeholder="Rivers" required /></div>
            </>
          )}
          {currentStep === 'riderDetails' && (
            <>
              <div className="form-group"><label className="label">Vehicle Type</label><input className="input" type="text" value={riderForm.vehicleType} onChange={setRider('vehicleType')} placeholder="Motorcycle" required /></div>
              <div className="form-group"><label className="label">Plate Number (optional)</label><input className="input" type="text" value={riderForm.plateNumber} onChange={setRider('plateNumber')} placeholder="ABC-123-XY" /></div>
              <div className="form-group"><label className="label">Street Address</label><input className="input" type="text" value={riderForm.address} onChange={setRider('address')} placeholder="12 Wetheral Road" required /></div>
              <div className="form-group"><label className="label">City</label><input className="input" type="text" value={riderForm.city} onChange={setRider('city')} placeholder="Owerri" required /></div>
              <div className="form-group"><label className="label">State</label><input className="input" type="text" value={riderForm.state} onChange={setRider('state')} placeholder="Imo" required /></div>
            </>
          )}

          {currentStep === 'account' && (
            <>
              <div className="form-group"><label className="label">Full Name</label><input className="input" type="text" value={form.name} onChange={set('name')} placeholder="John Doe" required /></div>
              <div className="form-group"><label className="label">Email Address</label><input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required /></div>
              <div className="form-group"><label className="label">Phone Number</label><input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+234 800 000 0000" required /></div>
            </>
          )}

          {currentStep === 'security' && (
            <>
              <div className="form-group">
                <label className="label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required minLength={8} style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>{show ? 'Hide' : 'Show'}</button>
                </div>
                <PasswordRules password={form.password} />
              </div>
              <div className="form-group">
                <label className="label">Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showConfirm ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" required style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowConfirm(s => !s)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>{showConfirm ? 'Hide' : 'Show'}</button>
                </div>
              </div>

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
            </>
          )}

          {err && <div className="input-error" style={{ marginBottom: 14 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 12 }}>
            {stepIndex > 0 && (
              <button type="button" onClick={goBack} className="btn btn-ghost btn-lg" style={{ flex: 1 }}>
                Back
              </button>
            )}
            {currentStep !== 'security' ? (
              <button type="submit" className="btn btn-primary btn-lg" style={{ flex: 2 }}>
                Next
              </button>
            ) : (
              <button type="submit" className="btn btn-primary btn-lg" style={{ flex: 2 }} disabled={loading || !agreed}>
                {loading ? <><span className="spin" />Creating account…</> : 'Create Account'}
              </button>
            )}
          </div>
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
