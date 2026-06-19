'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  vendor: { businessName: string; logoUrl?: string };
}

interface Address {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  isDefault: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending', CONFIRMED: 'Confirmed', PREPARING: 'Preparing',
  PICKED_UP: 'Picked Up', EN_ROUTE: 'En Route', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'badge-warning', CONFIRMED: 'badge-info', PREPARING: 'badge-info',
  PICKED_UP: 'badge-info', EN_ROUTE: 'badge-info', DELIVERED: 'badge-success',
  CANCELLED: 'badge-error',
};

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const IconMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
const IconPhone = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.72h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.4a16 16 0 0 0 6.29 6.29l.93-.93a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IconCheck = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6l3 3 5-5" />
  </svg>
);
const IconCircle = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="6" r="5" />
  </svg>
);
const IconOrders = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" />
  </svg>
);
const IconPin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const IconLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
);
const IconLogout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);
const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconStore = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconWallet = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
  </svg>
);

export default function ProfilePage() {
  const { user, loading: authLoading, logout, updateUser } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingAddresses, setLoadingAddresses] = useState(true);

  const [centerTab, setCenterTab] = useState<'orders' | 'addresses'>('orders');

  const [showPwModal, setShowPwModal] = useState(false);
  const [pwStep, setPwStep] = useState<'send' | 'otp' | 'newpw'>('send');
  const [pwOtp, setPwOtp] = useState(['', '', '', '', '', '']);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSending, setPwSending] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    setForm({ name: user.name ?? '', phone: user.phone ?? '' });
    setIsDark(document.documentElement.getAttribute('data-mode') === 'dark');
    api.get('/orders').then(r => setOrders((r.data.data ?? []).slice(0, 6))).catch(() => {}).finally(() => setLoadingOrders(false));
    api.get('/addresses').then(r => setAddresses(r.data.data ?? [])).catch(() => {}).finally(() => setLoadingAddresses(false));
  }, [user]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-mode', next ? 'dark' : 'light');
    localStorage.setItem('gbm_theme', next ? 'dark' : 'light');
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5 MB', 'error'); return; }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
      fd.append('folder', 'avatars');
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: fd },
      );
      if (!res.ok) throw new Error('Upload failed');
      const { secure_url } = await res.json();
      await api.patch('/auth/profile', { photoUrl: secure_url });
      updateUser({ avatar: secure_url });
      toast('Avatar updated!', 'success');
    } catch { toast('Could not upload image', 'error'); }
    finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/profile', { name: form.name, phone: form.phone });
      updateUser({ name: data.data?.name, phone: data.data?.phone });
      toast('Profile updated!', 'success');
    } catch { toast('Failed to update', 'error'); }
    finally { setSaving(false); }
  };

  const closePwModal = () => {
    setShowPwModal(false);
    setPwStep('send');
    setPwOtp(['', '', '', '', '', '']);
    setPwForm({ current: '', next: '', confirm: '' });
  };

  const sendPasswordOtp = async () => {
    setPwSending(true);
    try {
      await api.post('/auth/request-password-otp');
      setPwStep('otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch { toast('Could not send code. Try again.', 'error'); }
    finally { setPwSending(false); }
  };

  const resendPasswordOtp = async () => {
    setPwSending(true);
    try {
      await api.post('/auth/request-password-otp');
      toast('New code sent!', 'success');
    } catch { toast('Could not resend code.', 'error'); }
    finally { setPwSending(false); }
  };

  const handleOtpKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pwOtp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...pwOtp]; next[i] = digit; setPwOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) { setPwOtp(paste.split('')); otpRefs.current[5]?.focus(); }
  };

  const confirmOtp = () => {
    if (pwOtp.join('').length < 6) { toast('Enter all 6 digits', 'error'); return; }
    setPwStep('newpw');
    setTimeout(() => document.getElementById('pw-current')?.focus(), 80);
  };

  const changePassword = async () => {
    if (pwForm.next !== pwForm.confirm) { toast('Passwords do not match', 'error'); return; }
    if (pwForm.next.length < 8) { toast('Minimum 8 characters required', 'error'); return; }
    setPwSaving(true);
    try {
      await api.patch('/auth/change-password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
        otp: pwOtp.join(''),
      });
      toast('Password changed successfully!', 'success');
      closePwModal();
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Could not change password', 'error');
    } finally { setPwSaving(false); }
  };

  if (authLoading || !user) return null;

  const initials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const completionChecks = [
    { label: 'Name set', done: !!user.name?.trim() },
    { label: 'Email verified', done: !!user.email },
    { label: 'Phone added', done: !!user.phone?.trim() },
    { label: 'Avatar uploaded', done: !!user.avatar },
  ];
  const completion = Math.round((completionChecks.filter(c => c.done).length / completionChecks.length) * 100);
  const deliveredOrders = orders.filter(o => o.status === 'DELIVERED');
  const totalSpent = deliveredOrders.reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 1200, paddingTop: 36, paddingBottom: 80 }}>

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 className="t-page" style={{ marginBottom: 4 }}>My Account</h1>
            <p className="muted" style={{ fontSize: 14 }}>Manage your profile, orders, and preferences</p>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={logout}
            style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--error)', borderColor: 'rgba(226,59,59,.3)' }}
          >
            <IconLogout /> Sign Out
          </button>
        </div>

        {/* ── Hero profile card ── */}
        <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ height: 5, background: 'linear-gradient(90deg, var(--brand), var(--brand-light))' }} />
          <div style={{ padding: '28px 32px', display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Avatar — click to edit */}
            <div
              className="avatar-edit-wrap"
              style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}
              onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
              title="Change profile photo"
            >
              <div className="avatar" style={{ width: 88, height: 88, fontSize: 30 }}>
                {user.avatar
                  ? <img src={user.avatar} alt={user.name ?? ''} />
                  : initials(user.name ?? 'U')}
              </div>

              {/* Hover / loading overlay */}
              <div
                className="avatar-edit-overlay"
                style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.48)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: uploadingAvatar ? 1 : 0,
                  transition: 'opacity .15s',
                  pointerEvents: 'none',
                }}
              >
                {uploadingAvatar
                  ? <span className="spin" style={{ width: 20, height: 20, borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} />
                  : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  )}
              </div>

              {/* Camera badge — always visible */}
              {!uploadingAvatar && (
                <div
                  style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--brand)', border: '2px solid var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', pointerEvents: 'none',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
              )}

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </div>

            {/* Identity + completion bar */}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.2 }}>{user.name}</span>
                <span className="badge badge-info">Customer</span>
                {completion === 100 && <span className="badge badge-success">Profile Complete</span>}
              </div>

              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
                <span className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <IconMail /> {user.email}
                </span>
                {user.phone && (
                  <span className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IconPhone /> {user.phone}
                  </span>
                )}
              </div>

              {/* Completion bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Profile completeness</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: completion === 100 ? 'var(--success)' : 'var(--brand)' }}>{completion}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{
                    height: '100%', width: `${completion}%`,
                    background: completion === 100 ? 'var(--success)' : 'linear-gradient(90deg, var(--brand), var(--brand-light))',
                    borderRadius: 3, transition: 'width .6s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {completionChecks.map(c => (
                    <span
                      key={c.label}
                      style={{ fontSize: 11, fontWeight: 600, color: c.done ? 'var(--success)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {c.done ? <IconCheck /> : <IconCircle />}
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 0, flexShrink: 0, alignSelf: 'center' }}>
              {[
                { icon: <IconOrders />, value: orders.length, sub: 'Total Orders' },
                { icon: <IconWallet />, value: `₦${totalSpent >= 1000 ? (totalSpent / 1000).toFixed(1) + 'k' : totalSpent.toLocaleString()}`, sub: 'Total Spent' },
                { icon: <IconPin />, value: addresses.length, sub: 'Addresses' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '0 28px', borderLeft: i > 0 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ color: 'var(--muted)', marginBottom: 6, display: 'flex', justifyContent: 'center' }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 3-column layout ── */}
        <div className="profile-grid">

          {/* ════ LEFT COLUMN ════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Personal information */}
            <div className="card card-pad">
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 20 }}>Personal Information</h3>
              <div className="form-group">
                <label className="label" htmlFor="pf-name">Full Name</label>
                <input
                  id="pf-name"
                  className="input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Your full name"
                />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="pf-phone">Phone Number</label>
                <input
                  id="pf-phone"
                  className="input"
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+234 800 000 0000"
                />
              </div>
              <div className="form-group">
                <label className="label">Email Address</label>
                <input
                  className="input"
                  value={user.email}
                  disabled
                  style={{ opacity: .55, cursor: 'not-allowed' }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Cannot be changed here</div>
              </div>
              <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>
                {saving ? <><span className="spin" /> Saving…</> : 'Save Changes'}
              </button>
            </div>

            {/* Preferences */}
            <div className="card card-pad">
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Preferences</h3>
              <div className="between" style={{ paddingBottom: 0 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Dark Mode</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Switch app appearance</div>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={isDark} onChange={toggleTheme} />
                  <span className="track" />
                </label>
              </div>
            </div>

            {/* Quick links */}
            <div className="card card-pad">
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Quick Links</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Link href="/orders" className="v-nav-item">
                  <IconOrders />
                  <span style={{ flex: 1 }}>My Orders</span>
                  <IconChevronRight />
                </Link>
                <Link href="/profile/addresses" className="v-nav-item">
                  <IconPin />
                  <span style={{ flex: 1 }}>Saved Addresses</span>
                  <IconChevronRight />
                </Link>
              </div>
            </div>
          </div>

          {/* ════ CENTER COLUMN ════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ overflow: 'hidden' }}>

              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
                {(['orders', 'addresses'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setCenterTab(tab)}
                    style={{
                      flex: 1, height: 50, background: 'none', fontFamily: 'var(--font)',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      color: centerTab === tab ? 'var(--brand)' : 'var(--muted)',
                      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      borderBottom: centerTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
                      transition: 'color .15s, border-color .15s',
                    }}
                  >
                    {tab === 'orders' ? 'Recent Orders' : 'Saved Addresses'}
                  </button>
                ))}
              </div>

              {/* Orders tab */}
              {centerTab === 'orders' && (
                <div style={{ padding: '0 24px' }}>
                  {loadingOrders ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {[...Array(4)].map((_, i) => (
                        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                          <div className="sk" style={{ width: 44, height: 44, borderRadius: 4, flexShrink: 0 }} />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                            <div className="sk" style={{ height: 13, width: '55%', borderRadius: 3 }} />
                            <div className="sk" style={{ height: 11, width: '35%', borderRadius: 3 }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
                            <div className="sk" style={{ height: 14, width: 60, borderRadius: 3 }} />
                            <div className="sk" style={{ height: 18, width: 70, borderRadius: 99 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="empty" style={{ padding: '48px 24px' }}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" style={{ marginBottom: 14 }}>
                        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" />
                      </svg>
                      <h3>No orders yet</h3>
                      <p>Place your first order to see it here.</p>
                      <Link href="/vendors" className="btn btn-primary btn-sm" style={{ marginTop: 18 }}>Browse Vendors</Link>
                    </div>
                  ) : (
                    <>
                      {orders.map((o, idx) => (
                        <Link
                          key={o.id}
                          href={`/orders/${o.id}`}
                          style={{
                            display: 'flex', gap: 14, alignItems: 'center',
                            padding: '15px 0',
                            borderBottom: idx < orders.length - 1 ? '1px solid var(--line)' : 'none',
                            textDecoration: 'none', cursor: 'pointer',
                          }}
                        >
                          {o.vendor.logoUrl
                            ? <img src={o.vendor.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                            : (
                              <div style={{
                                width: 44, height: 44, borderRadius: 4, flexShrink: 0,
                                background: 'var(--brand-tint)', color: 'var(--brand)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <IconStore />
                              </div>
                            )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {o.vendor.businessName}
                            </div>
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                              #{o.orderNumber} · {new Date(o.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand)', marginBottom: 5 }}>
                              ₦{o.totalAmount.toLocaleString()}
                            </div>
                            <span className={`badge ${STATUS_COLOR[o.status] ?? 'badge-neutral'}`} style={{ fontSize: 10 }}>
                              {STATUS_LABEL[o.status] ?? o.status}
                            </span>
                          </div>
                          <div style={{ color: 'var(--muted)', flexShrink: 0 }}><IconChevronRight /></div>
                        </Link>
                      ))}
                      <div style={{ padding: '16px 0', textAlign: 'center' }}>
                        <Link href="/orders" className="btn btn-ghost btn-sm">View All Orders</Link>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Addresses tab */}
              {centerTab === 'addresses' && (
                <div style={{ padding: '0 24px' }}>
                  {loadingAddresses ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {[...Array(3)].map((_, i) => (
                        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                          <div className="sk" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                            <div className="sk" style={{ height: 13, width: '40%', borderRadius: 3 }} />
                            <div className="sk" style={{ height: 11, width: '70%', borderRadius: 3 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : addresses.length === 0 ? (
                    <div className="empty" style={{ padding: '48px 24px' }}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" style={{ marginBottom: 14 }}>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                      <h3>No saved addresses</h3>
                      <p>Save delivery addresses for faster checkout.</p>
                      <Link href="/profile/addresses" className="btn btn-primary btn-sm" style={{ marginTop: 18 }}>Add Address</Link>
                    </div>
                  ) : (
                    <>
                      {addresses.map((addr, idx) => (
                        <div
                          key={addr.id}
                          style={{
                            display: 'flex', gap: 14, alignItems: 'flex-start',
                            padding: '15px 0',
                            borderBottom: idx < addresses.length - 1 ? '1px solid var(--line)' : 'none',
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                            background: addr.isDefault ? 'var(--brand)' : 'var(--surface2)',
                            color: addr.isDefault ? '#fff' : 'var(--muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background .15s',
                          }}>
                            <IconPin />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>{addr.label}</span>
                              {addr.isDefault && <span className="badge badge-success" style={{ fontSize: 10 }}>Default</span>}
                            </div>
                            <div className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{addr.address}</div>
                            {(addr.city || addr.state) && (
                              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{[addr.city, addr.state].filter(Boolean).join(', ')}</div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div style={{ padding: '16px 0', textAlign: 'center' }}>
                        <Link href="/profile/addresses" className="btn btn-ghost btn-sm">Manage Addresses</Link>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ════ RIGHT COLUMN ════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Order stats summary */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Order Summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Delivered', value: deliveredOrders.length, color: 'var(--success)' },
                  { label: 'In Progress', value: orders.filter(o => ['CONFIRMED', 'PREPARING', 'PICKED_UP', 'EN_ROUTE'].includes(o.status)).length, color: 'var(--rider)' },
                  { label: 'Pending', value: orders.filter(o => o.status === 'PENDING').length, color: 'var(--warning)' },
                  { label: 'Cancelled', value: orders.filter(o => o.status === 'CANCELLED').length, color: 'var(--error)' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{s.value}</span>
                  </div>
                ))}
                <div className="divider" style={{ margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Total spent</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand)' }}>₦{totalSpent.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Security</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  className="v-nav-item"
                  onClick={() => { setPwStep('send'); setShowPwModal(true); }}
                  style={{ width: '100%', textAlign: 'left', fontFamily: 'var(--font)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <IconLock />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Change Password</span>
                  <IconChevronRight />
                </button>
              </div>
            </div>

            {/* Help & Legal */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Help &amp; Legal</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <a href="https://app.gobuyme.shop/privacy" target="_blank" rel="noopener noreferrer" className="v-nav-item" style={{ fontSize: 13 }}>
                  <IconShield /><span style={{ flex: 1 }}>Privacy Policy</span><IconChevronRight />
                </a>
                <a href="https://app.gobuyme.shop/terms" target="_blank" rel="noopener noreferrer" className="v-nav-item" style={{ fontSize: 13 }}>
                  <IconFile /><span style={{ flex: 1 }}>Terms of Service</span><IconChevronRight />
                </a>
              </div>
            </div>

            {/* Danger zone */}
            <div className="card" style={{ padding: '20px 22px', borderColor: 'rgba(226,59,59,.25)' }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, color: 'var(--error)' }}>Danger Zone</h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.55 }}>
                Signing out ends your current session on this device.
              </p>
              <button
                className="btn btn-danger btn-block"
                style={{ height: 40, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}
                onClick={logout}
              >
                <IconLogout /> Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Change Password Modal (3-step) ── */}
      {showPwModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closePwModal(); }}>
          <div className="modal">

            {/* Header */}
            <div className="modal-head">
              <div>
                <h3>Change Password</h3>
                {/* Step indicator */}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {(['send', 'otp', 'newpw'] as const).map((s, i) => (
                    <div
                      key={s}
                      style={{
                        height: 3, width: 28, borderRadius: 2,
                        background: i <= ['send', 'otp', 'newpw'].indexOf(pwStep)
                          ? 'var(--brand)' : 'var(--line)',
                        transition: 'background .2s',
                      }}
                    />
                  ))}
                </div>
              </div>
              <button onClick={closePwModal} className="icon-btn" style={{ color: 'var(--muted)' }} aria-label="Close">
                <IconClose />
              </button>
            </div>

            {/* ── Step 1: Send code ── */}
            {pwStep === 'send' && (
              <>
                <div className="modal-body">
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'var(--brand-tint)', color: 'var(--brand)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Verify your identity</p>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 0 }}>
                    We'll send a 6-digit verification code to{' '}
                    <strong style={{ color: 'var(--text)' }}>{user.email}</strong>.
                    Enter it on the next step to proceed.
                  </p>
                </div>
                <div className="modal-foot">
                  <button className="btn btn-ghost" onClick={closePwModal}>Cancel</button>
                  <button className="btn btn-primary" onClick={sendPasswordOtp} disabled={pwSending}>
                    {pwSending ? <><span className="spin" /> Sending…</> : 'Send Code'}
                  </button>
                </div>
              </>
            )}

            {/* ── Step 2: Enter OTP ── */}
            {pwStep === 'otp' && (
              <>
                <div className="modal-body">
                  <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Enter verification code</p>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
                    Check <strong style={{ color: 'var(--text)' }}>{user.email}</strong> for a 6-digit code. It expires in 10 minutes.
                  </p>
                  <div className="otp-row" onPaste={handleOtpPaste} style={{ justifyContent: 'flex-start', margin: '0 0 8px' }}>
                    {pwOtp.map((v, i) => (
                      <input
                        key={i}
                        ref={el => { otpRefs.current[i] = el; }}
                        className="otp-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={v}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={handleOtpKey(i)}
                        style={{ width: 48, height: 54, fontSize: 22 }}
                      />
                    ))}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 16 }}>
                    Didn't receive it?{' '}
                    <button
                      onClick={resendPasswordOtp}
                      disabled={pwSending}
                      style={{ color: 'var(--brand)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}
                    >
                      {pwSending ? 'Sending…' : 'Resend code'}
                    </button>
                  </p>
                </div>
                <div className="modal-foot">
                  <button className="btn btn-ghost" onClick={() => setPwStep('send')}>Back</button>
                  <button className="btn btn-primary" onClick={confirmOtp} disabled={pwOtp.join('').length < 6}>
                    Verify Code
                  </button>
                </div>
              </>
            )}

            {/* ── Step 3: New password ── */}
            {pwStep === 'newpw' && (
              <>
                <div className="modal-body">
                  <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Set new password</p>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
                    Identity verified. Enter your current password and choose a new one.
                  </p>
                  <div className="form-group">
                    <label className="label" htmlFor="pw-current">Current Password</label>
                    <input
                      id="pw-current"
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      value={pwForm.current}
                      onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="pw-new">New Password</label>
                    <input
                      id="pw-new"
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={pwForm.next}
                      onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                    />
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Minimum 8 characters</div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label" htmlFor="pw-confirm">Confirm New Password</label>
                    <input
                      id="pw-confirm"
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={pwForm.confirm}
                      onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="modal-foot">
                  <button className="btn btn-ghost" onClick={() => setPwStep('otp')}>Back</button>
                  <button className="btn btn-primary" onClick={changePassword} disabled={pwSaving}>
                    {pwSaving ? <><span className="spin" /> Saving…</> : 'Update Password'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
