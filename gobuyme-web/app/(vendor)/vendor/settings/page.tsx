'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

// ── Nigerian bank list ─────────────────────────────────────────────────────────

const BANKS = [
  { name: 'Access Bank',       code: '044' },
  { name: 'Ecobank Nigeria',   code: '050' },
  { name: 'FCMB',              code: '214' },
  { name: 'Fidelity Bank',     code: '070' },
  { name: 'First Bank',        code: '011' },
  { name: 'GTBank',            code: '058' },
  { name: 'Heritage Bank',     code: '030' },
  { name: 'Keystone Bank',     code: '082' },
  { name: 'Kuda Bank',         code: '90267' },
  { name: 'Moniepoint MFB',    code: '50515' },
  { name: 'OPay',              code: '100004' },
  { name: 'PalmPay',           code: '100033' },
  { name: 'Polaris Bank',      code: '076' },
  { name: 'Stanbic IBTC',      code: '221' },
  { name: 'Sterling Bank',     code: '232' },
  { name: 'UBA',               code: '033' },
  { name: 'Union Bank',        code: '032' },
  { name: 'Unity Bank',        code: '215' },
  { name: 'Wema Bank',         code: '035' },
  { name: 'Zenith Bank',       code: '057' },
];

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>{title}</h2>
        {sub && <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Appearance ─────────────────────────────────────────────────────────────────

function AppearanceSection() {
  const toast = useToast();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-mode') === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-mode', next ? 'dark' : 'light');
    localStorage.setItem('gbm_theme', next ? 'dark' : 'light');
    toast(`Switched to ${next ? 'dark' : 'light'} mode`, 'info');
  };

  return (
    <Section title="Appearance">
      <div className="between">
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Dark Mode</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Toggle dark/light appearance</div>
        </div>
        <label className="switch"><input type="checkbox" checked={isDark} onChange={toggleTheme} /><span className="track" /></label>
      </div>
    </Section>
  );
}

// ── Notification Toggles ───────────────────────────────────────────────────────

const NOTIF_KEYS = [
  { key: 'gbm_notif_orders',  label: 'New order alerts',         desc: 'Get notified when a customer places an order' },
  { key: 'gbm_notif_promos',  label: 'Promotion performance',    desc: 'Updates when your promotions go live or expire' },
  { key: 'gbm_notif_payouts', label: 'Payout notifications',     desc: 'Daily payout processing results' },
  { key: 'gbm_notif_system',  label: 'Platform announcements',   desc: 'GoBuyMe news, maintenance, and policy updates' },
];

function NotificationsSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loaded: Record<string, boolean> = {};
    NOTIF_KEYS.forEach(n => {
      loaded[n.key] = localStorage.getItem(n.key) !== 'false';
    });
    setPrefs(loaded);
  }, []);

  const toggle = (key: string) => {
    const next = !prefs[key];
    setPrefs(p => ({ ...p, [key]: next }));
    localStorage.setItem(key, String(next));
  };

  return (
    <Section title="Notifications" sub="In-app notification preferences">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {NOTIF_KEYS.map(n => (
          <div key={n.key} className="between">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{n.label}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{n.desc}</div>
            </div>
            <label className="switch"><input type="checkbox" checked={!!prefs[n.key]} onChange={() => toggle(n.key)} /><span className="track" /></label>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Change Password ────────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '', otp: '', mfaCode: '' });
  const sf = <K extends keyof typeof form>(k: K, v: string) => setForm(f => ({ ...f, [k]: v }));

  const reset = () => {
    setOpen(false);
    setOtpSent(false);
    setForm({ currentPassword: '', newPassword: '', confirm: '', otp: '', mfaCode: '' });
  };

  const requestOtp = async () => {
    if (!form.currentPassword || !form.newPassword) {
      toast('Fill in current and new password first', 'error'); return;
    }
    if (form.newPassword.length < 8) { toast('New password must be at least 8 characters', 'error'); return; }
    if (form.newPassword !== form.confirm) { toast('Passwords do not match', 'error'); return; }
    setRequesting(true);
    try {
      await api.post('/auth/request-password-otp');
      setOtpSent(true);
      toast('Verification code sent to your email', 'success');
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Failed to send code', 'error'); }
    finally { setRequesting(false); }
  };

  const changePassword = async () => {
    if (!form.otp || form.otp.length !== 6) { toast('Enter the 6-digit code from your email', 'error'); return; }
    setSaving(true);
    try {
      const headers: Record<string, string> = {};
      if (form.mfaCode) headers['x-mfa-code'] = form.mfaCode;
      await api.patch('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        otp: form.otp,
      }, { headers });
      toast('Password changed successfully', 'success');
      reset();
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Change failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Section title="Security" sub="Manage your password and account access">
      {!open ? (
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>🔒 Change Password</button>
      ) : (
        <div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="label">Current Password *</label>
              <input className="input" type="password" value={form.currentPassword} onChange={e => sf('currentPassword', e.target.value)} autoComplete="current-password" />
            </div>
            <div />
            <div className="form-group">
              <label className="label">New Password *</label>
              <input className="input" type="password" value={form.newPassword} onChange={e => sf('newPassword', e.target.value)} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label className="label">Confirm New Password *</label>
              <input className="input" type="password" value={form.confirm} onChange={e => sf('confirm', e.target.value)} autoComplete="new-password" />
            </div>
          </div>

          {!otpSent ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-ghost" onClick={reset}>Cancel</button>
              <button className="btn btn-primary" onClick={requestOtp} disabled={requesting}>
                {requesting ? <><span className="spin" />Sending…</> : 'Send Verification Code'}
              </button>
            </div>
          ) : (
            <>
              <div style={{ margin: '12px 0', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 4, fontSize: 13 }}>
                A 6-digit code was sent to your email. Enter it below to confirm the password change.
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="label">Email OTP *</label>
                  <input className="input" type="text" inputMode="numeric" maxLength={6} placeholder="123456" value={form.otp} onChange={e => sf('otp', e.target.value.replace(/\D/g, ''))} />
                </div>
                <div className="form-group">
                  <label className="label">Authenticator Code <span className="muted" style={{ fontSize: 11 }}>(if 2FA enabled)</span></label>
                  <input className="input" type="text" inputMode="numeric" maxLength={6} placeholder="Optional" value={form.mfaCode} onChange={e => sf('mfaCode', e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" onClick={reset}>Cancel</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setOtpSent(false)}>← Back</button>
                <button className="btn btn-primary" onClick={changePassword} disabled={saving}>
                  {saving ? <><span className="spin" />Saving…</> : 'Change Password'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Section>
  );
}

// ── Commission Tier ────────────────────────────────────────────────────────────

function CommissionTierSection() {
  const toast = useToast();
  const [tier, setTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [confirm, setConfirm] = useState<'TIER_1' | 'TIER_2' | null>(null);

  useEffect(() => {
    api.get('/vendors/me').then(r => setTier(r.data.data?.commissionTier ?? null)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const switchTier = async (target: 'TIER_1' | 'TIER_2') => {
    setSwitching(true);
    try {
      const { data } = await api.patch('/vendors/me/tier', { tier: target });
      setTier(target);
      setConfirm(null);
      toast(data.message ?? 'Tier updated', 'success');
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Tier switch failed', 'error'); }
    finally { setSwitching(false); }
  };

  if (loading) return <Section title="Commission Tier"><div className="sk" style={{ height: 60 }} /></Section>;

  return (
    <Section title="Commission Tier" sub="Your current tier affects your commission rate and available features">
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {(['TIER_1', 'TIER_2'] as const).map(t => (
          <div key={t} style={{
            flex: 1, minWidth: 200, padding: 16, borderRadius: 4,
            border: `2px solid ${tier === t ? 'var(--brand)' : 'var(--line)'}`,
            background: tier === t ? 'var(--brand-tint,#fff4f0)' : 'var(--surface2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{t === 'TIER_1' ? 'Tier 1' : 'Tier 2'}</span>
              {tier === t && <span className="badge badge-success" style={{ fontSize: 11 }}>Current</span>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)', marginBottom: 6 }}>
              {t === 'TIER_1' ? '3%' : '7.5%'} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>commission</span>
            </div>
            <ul className="muted" style={{ fontSize: 12, paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
              {t === 'TIER_1' ? (
                <>
                  <li>Lower commission rate</li>
                  <li>No promotional cards</li>
                  <li>Basic listing</li>
                </>
              ) : (
                <>
                  <li>Promotional cards unlocked</li>
                  <li>Priority listing</li>
                  <li>Higher visibility</li>
                </>
              )}
            </ul>
          </div>
        ))}
      </div>

      {confirm === null && tier && (
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(tier === 'TIER_1' ? 'TIER_2' : 'TIER_1')}>
          {tier === 'TIER_1' ? '⬆ Upgrade to Tier 2' : '⬇ Downgrade to Tier 1'}
        </button>
      )}

      {confirm && (
        <div style={{ padding: '14px 16px', background: 'var(--surface2)', borderRadius: 4, border: '1px solid var(--line)' }}>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            {confirm === 'TIER_2'
              ? 'Upgrading to Tier 2 increases your commission to 7.5% and unlocks promotional cards. A 14-day cooldown applies after switching.'
              : 'Downgrading to Tier 1 reduces your commission to 3% but deactivates all your promotional cards. A 14-day cooldown applies after switching.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={switching} onClick={() => switchTier(confirm)}>
              {switching ? <><span className="spin" />Switching…</> : `Confirm Switch to ${confirm === 'TIER_1' ? 'Tier 1' : 'Tier 2'}`}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Payout Account ─────────────────────────────────────────────────────────────

function PayoutAccountSection() {
  const toast = useToast();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [existing, setExisting] = useState<{ bankName: string; accountNumber: string; accountName: string } | null>(null);
  const [open, setOpen]         = useState(false);
  const [form, setForm] = useState({ bankName: '', bankCode: '', accountNumber: '', accountName: '', mfaCode: '' });
  const sf = <K extends keyof typeof form>(k: K, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/vendors/me/payout-account')
      .then(r => setExisting(r.data.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!form.bankName || !form.bankCode || !form.accountNumber || !form.accountName) {
      toast('All bank fields are required', 'error'); return;
    }
    if (form.accountNumber.length < 10) { toast('Account number must be at least 10 digits', 'error'); return; }
    setSaving(true);
    try {
      const headers: Record<string, string> = {};
      if (form.mfaCode) headers['x-mfa-code'] = form.mfaCode;
      const { data } = await api.post('/vendors/me/payout-account', {
        bankName: form.bankName,
        bankCode: form.bankCode,
        accountNumber: form.accountNumber,
        accountName: form.accountName,
      }, { headers });
      setExisting({ bankName: form.bankName, accountNumber: `****${form.accountNumber.slice(-4)}`, accountName: form.accountName });
      setOpen(false);
      toast(data.message ?? 'Payout account saved', 'success');
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <Section title="Payout Account"><div className="sk" style={{ height: 60 }} /></Section>;

  return (
    <Section title="Payout Account" sub="Bank account where your daily payouts are sent">
      {existing && !open && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--surface2)', borderRadius: 4, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{existing.accountName}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{existing.bankName} · {existing.accountNumber}</div>
          </div>
          <span className="badge badge-success" style={{ fontSize: 11 }}>Registered</span>
        </div>
      )}

      {!open ? (
        <button className="btn btn-ghost btn-sm" onClick={() => {
          setForm({ bankName: '', bankCode: '', accountNumber: '', accountName: '', mfaCode: '' });
          setOpen(true);
        }}>
          {existing ? '✏️ Update Bank Details' : '+ Add Payout Account'}
        </button>
      ) : (
        <div>
          <div className="form-grid-2">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Bank *</label>
              <select className="select" value={form.bankCode} onChange={e => {
                const bank = BANKS.find(b => b.code === e.target.value);
                setForm(f => ({ ...f, bankCode: e.target.value, bankName: bank?.name ?? '' }));
              }}>
                <option value="">Select bank…</option>
                {BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Account Number *</label>
              <input className="input" type="text" inputMode="numeric" maxLength={10} value={form.accountNumber} onChange={e => sf('accountNumber', e.target.value.replace(/\D/g, ''))} placeholder="10-digit NUBAN" />
            </div>
            <div className="form-group">
              <label className="label">Account Name *</label>
              <input className="input" value={form.accountName} onChange={e => sf('accountName', e.target.value)} placeholder="As on your bank records" />
            </div>
            <div className="form-group">
              <label className="label">Authenticator Code <span className="muted" style={{ fontSize: 11 }}>(if 2FA enabled)</span></label>
              <input className="input" type="text" inputMode="numeric" maxLength={6} placeholder="Optional" value={form.mfaCode} onChange={e => sf('mfaCode', e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? <><span className="spin" />Saving…</> : 'Save Payout Account'}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Danger Zone ────────────────────────────────────────────────────────────────

function DangerZone() {
  const { logout } = useAuth();
  const [confirming, setConfirming] = useState(false);

  return (
    <Section title="Danger Zone">
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Signing out will clear your session. You will need to log in again to access your store.
      </p>
      {!confirming ? (
        <button className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>Sign Out</button>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Are you sure?</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>No, stay</button>
          <button className="btn btn-danger btn-sm" onClick={logout}>Yes, sign out</button>
        </div>
      )}
    </Section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VendorSettingsPage() {
  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 28 }}>Settings</h1>
      <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AppearanceSection />
        <NotificationsSection />
        <ChangePasswordSection />
        <CommissionTierSection />
        <PayoutAccountSection />
        <DangerZone />
      </div>
    </div>
  );
}
