'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

type Theme = { text: string; textSec: string; border: string; surface2?: string; primary?: string; bg?: string };

/**
 * Identity numbers are shown masked. Staff who genuinely need the full number give a reason,
 * which is written to the audit log (the number itself is not logged).
 */
export default function RevealIdButton({ kind, id, T }: { kind: 'RIDER_NIN' | 'VENDOR_ID'; id: string; T: Theme }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function reveal() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ data: { value: string } }>('/admin/kyc/reveal', { kind, id, reason });
      setValue(r.data.value);
      setOpen(false);
      setReason('');
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  const btn = { fontSize: 12, fontWeight: 700, borderRadius: 4, padding: '5px 10px', cursor: 'pointer', border: `1px solid ${T.border}`, background: 'transparent', color: T.text } as const;

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.text }}>
        <span style={{ fontWeight: 700 }}>Full number:</span>
        <code>{value}</code>
        <button type="button" style={btn} onClick={() => setValue('')}>Hide</button>
      </div>
    );
  }
  if (!open) {
    return <div><button type="button" style={btn} onClick={() => setOpen(true)}>Reveal full number (logged)</button></div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
      <label style={{ fontSize: 12, color: T.textSec }}>Why do you need the full number? This is recorded.</label>
      <input
        value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
        placeholder="e.g. Checking the number against the ID card for approval"
        style={{ fontSize: 13, padding: '7px 9px', borderRadius: 4, border: `1px solid ${T.border}`, background: 'transparent', color: T.text }}
      />
      {err && <span style={{ fontSize: 12, color: '#E23B3B' }}>{err}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={btn} disabled={busy || reason.trim().length < 10} onClick={reveal}>{busy ? 'Revealing…' : 'Reveal'}</button>
        <button type="button" style={btn} onClick={() => { setOpen(false); setReason(''); setErr(''); }}>Cancel</button>
      </div>
    </div>
  );
}
