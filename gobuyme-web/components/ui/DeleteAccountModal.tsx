'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DeleteAccountModal({ open, onClose }: Props) {
  const { logout } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const close = () => {
    if (loading) return;
    setPassword('');
    setMfaCode('');
    onClose();
  };

  const handleDelete = async () => {
    if (!password) { toast('Enter your password to confirm', 'error'); return; }
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (mfaCode) headers['x-mfa-code'] = mfaCode;
      await api.delete('/auth/me', { data: { password }, headers });
      logout();
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Could not delete account', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3 style={{ color: 'var(--error)' }}>Delete Account</h3>
          <button onClick={close} className="icon-btn" style={{ color: 'var(--muted)' }} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.6 }}>
            This will deactivate your account and remove your access immediately. Enter your password
            to confirm. This cannot be undone from the app — contact support to restore your account.
          </p>
          <div className="form-group">
            <label className="label" htmlFor="del-password">Password</label>
            <input
              id="del-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="del-mfa">
              Authenticator Code <span className="muted" style={{ fontSize: 11 }}>(if 2FA enabled)</span>
            </label>
            <input
              id="del-mfa"
              className="input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Optional"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={loading}>
            {loading ? <><span className="spin" />Deleting…</> : 'Delete My Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
