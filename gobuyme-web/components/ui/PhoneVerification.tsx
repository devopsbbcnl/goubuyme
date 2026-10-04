'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

const errorMessage = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/** "+2348031234567" → "8031234567" for the local-number input. */
const localDigits = (phone?: string | null) => {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('234')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
};

const RESEND_COOLDOWN = 60;

/** Two-step SMS verification (Termii) of the signed-in user's phone number. */
export function PhoneVerifyModal({ open, onClose, onVerified, initialPhone }: {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
  initialPhone?: string | null;
}) {
  const toast = useToast();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (open) { setStep('phone'); setPhone(localDigits(initialPhone)); setCode(''); setError(''); }
  }, [open, initialPhone]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  if (!open) return null;

  const close = () => { if (!loading) onClose(); };

  const sendCode = async () => {
    const local = localDigits(phone);
    if (!/^[789]\d{9}$/.test(local)) { setError('Enter a valid Nigerian mobile number, e.g. 8031234567.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/phone/send-otp', { phone: `+234${local}` });
      setSentTo(data.data?.phone ?? `+234${local}`);
      setCode('');
      setStep('code');
      setCountdown(RESEND_COOLDOWN);
    } catch (e: any) {
      setError(errorMessage(e, 'Could not send the code. Please try again.'));
    } finally { setLoading(false); }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/auth/phone/verify', { code });
      toast('Phone number verified', 'success');
      onVerified();
      onClose();
    } catch (e: any) {
      setError(errorMessage(e, 'Verification failed. Please try again.'));
    } finally { setLoading(false); }
  };

  const maskedTo = sentTo.replace(/^(\+234)(\d{3})\d{4}(\d{3})$/, '$1 $2 **** $3');

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>Verify your phone</h3>
          <button onClick={close} className="icon-btn" style={{ color: 'var(--muted)' }} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {step === 'phone' ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.6 }}>
                We&apos;ll text a 6-digit code to this number. Standard SMS rates may apply.
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label" htmlFor="pv-phone">Mobile number</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="input" style={{ width: 'auto', flex: '0 0 auto', fontWeight: 600 }}>+234</span>
                  <input
                    id="pv-phone"
                    className="input"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="8031234567"
                    value={phone}
                    onChange={e => { setError(''); setPhone(e.target.value.replace(/\D/g, '').slice(0, 11)); }}
                    onKeyDown={e => { if (e.key === 'Enter') sendCode(); }}
                    autoFocus
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.6 }}>
                We sent a 6-digit code by SMS to <strong style={{ color: 'var(--text)' }}>{maskedTo}</strong>.
              </p>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="label" htmlFor="pv-code">Verification code</label>
                <input
                  id="pv-code"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={e => { setError(''); setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); }}
                  onKeyDown={e => { if (e.key === 'Enter') verify(); }}
                  style={{ letterSpacing: 6, fontSize: 18, fontWeight: 700 }}
                  autoFocus
                />
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Didn&apos;t get it?{' '}
                {countdown > 0 ? (
                  <span>Resend in {countdown}s</span>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={sendCode} disabled={loading}>Resend code</button>
                )}
                {' · '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep('phone'); setError(''); }}>Change number</button>
              </div>
            </>
          )}
          {error && <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          {step === 'phone' ? (
            <button className="btn btn-primary" onClick={sendCode} disabled={loading}>
              {loading ? <><span className="spin" />Sending…</> : 'Send code'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={verify} disabled={loading}>
              {loading ? <><span className="spin" />Verifying…</> : 'Verify phone'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const BANNER_COPY: Record<'vendor' | 'rider', string> = {
  vendor: 'Verify your phone number so customers and our team can reach you, and earn a Phone Verified badge.',
  rider: 'Verify your phone number so customers and our team can reach you during deliveries.',
};

/** Soft prompt shown on vendor/rider dashboards until the phone is SMS-verified. */
export function PhoneVerifyBanner({ role, onVerified }: { role: 'vendor' | 'rider'; onVerified?: () => void }) {
  const [me, setMe] = useState<{ phone: string | null; isPhoneVerified: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api.get('/auth/me').then(r => setMe(r.data.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!me) return null;
  // Verified vendors see the same badge customers see on their store page.
  if (me.isPhoneVerified) {
    return role === 'vendor' ? <div style={{ marginBottom: 16 }}><PhoneVerifiedBadge /></div> : null;
  }

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '12px 16px', marginBottom: 20, borderRadius: 4,
          background: 'rgba(245,166,35,0.12)', border: '1px solid var(--warning)',
          fontSize: 13, fontWeight: 500, color: 'var(--text)',
        }}
      >
        <span aria-hidden="true">📱</span>
        <span style={{ flex: 1, minWidth: 200 }}>{BANNER_COPY[role]}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Verify phone</button>
      </div>
      <PhoneVerifyModal
        open={open}
        onClose={() => setOpen(false)}
        initialPhone={me.phone}
        onVerified={() => { load(); onVerified?.(); }}
      />
    </>
  );
}

/** Shown on vendors whose owner phone number has been confirmed by SMS OTP. */
export function PhoneVerifiedBadge() {
  return (
    <span className="badge badge-success" title="Owner phone number verified by SMS">📞 Phone Verified</span>
  );
}
