'use client';

import { useEffect, useState } from 'react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import DeleteAccountModal from '@/components/ui/DeleteAccountModal';

const EMPTY = { companyName: '', registrationNumber: '', address: '', city: '', state: '' };

export default function CompanyAccountPage() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    api.get('/company/me')
      .then(r => {
        const c = r.data.data;
        setForm({
          companyName: c.companyName ?? '', registrationNumber: c.registrationNumber ?? '',
          address: c.address ?? '', city: c.city ?? '', state: c.state ?? '',
        });
      })
      .catch(() => setError('Could not load your company details.'))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setError('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.companyName.trim().length < 2 || !form.address.trim() || !form.city.trim() || !form.state.trim()) {
      setError('Company name, address, city and state are required.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/company/me', {
        companyName: form.companyName.trim(), registrationNumber: form.registrationNumber.trim(),
        address: form.address.trim(), city: form.city.trim(), state: form.state.trim(),
      });
      toast('Saved.', 'success');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not save your changes. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="t-page" style={{ marginBottom: 24 }}>Company</h1>
      {loading ? <div className="sk" style={{ height: 240 }} /> : (
        <form onSubmit={save} className="card card-pad">
          <div className="form-group"><label className="label" htmlFor="co-name">Company name</label><input id="co-name" className="input" value={form.companyName} onChange={set('companyName')} /></div>
          <div className="form-group"><label className="label" htmlFor="co-reg">CAC registration number (optional)</label><input id="co-reg" className="input" value={form.registrationNumber} onChange={set('registrationNumber')} /></div>
          <div className="form-group"><label className="label" htmlFor="co-addr">Office address</label><input id="co-addr" className="input" value={form.address} onChange={set('address')} /></div>
          <div className="form-group"><label className="label" htmlFor="co-city">City</label><input id="co-city" className="input" value={form.city} onChange={set('city')} /></div>
          <div className="form-group"><label className="label" htmlFor="co-state">State</label><input id="co-state" className="input" value={form.state} onChange={set('state')} /></div>
          {error && <div className="input-error" style={{ marginBottom: 12 }}>{error}</div>}
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </form>
      )}

      <div className="card card-pad" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Delete account</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          This removes your company access. Your riders will no longer be able to take deliveries through your fleet.
        </p>
        <button className="btn btn-ghost" style={{ color: 'var(--error)' }} onClick={() => setDeleteOpen(true)}>Delete my account</button>
      </div>
      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}
