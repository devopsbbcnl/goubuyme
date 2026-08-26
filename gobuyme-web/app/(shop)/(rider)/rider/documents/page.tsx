'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { uploadToCloudinary } from '@/services/cloudinary';

interface RiderDoc {
  id: string;
  ninNumber: string;
  ninImageUrl?: string;
  selfieUrl?: string;
  vehicleImageUrl?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorAddress?: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewNote?: string;
  updatedAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-warning', VERIFIED: 'badge-success', REJECTED: 'badge-error',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: '⏳ Pending Review', VERIFIED: '✓ Verified', REJECTED: '✕ Rejected',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Small inline upload field with preview thumbnail — mirrors the vendor documents page pattern.
function UploadField({
  label, value, folder, onChange, required,
}: {
  label: string; value: string; folder: string; onChange: (url: string) => void; required?: boolean;
}) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadToCloudinary(file, folder);
      onChange(url);
      toast('Image uploaded', 'success');
    } catch (err: any) { toast(err?.message || 'Upload failed', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="form-group">
      <label className="label">{label}{required && ' *'}</label>
      <input ref={fileRef}   type="file" accept="image/*"                      style={{ display: 'none' }} onChange={handle} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handle} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {value ? (
          <a href={value} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
            <img src={value} alt={label} style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)', display: 'block' }} />
          </a>
        ) : (
          <div style={{ width: 64, height: 44, borderRadius: 4, border: '1.5px dashed var(--line)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, color: 'var(--muted)' }}>
            {busy ? <span className="spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--brand)', width: 16, height: 16 }} /> : '🖼️'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>📁 File</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => cameraRef.current?.click()}>📷 Camera</button>
          {value && <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => onChange('')}>✕</button>}
        </div>
      </div>
    </div>
  );
}

function ReviewNote({ note }: { note?: string }) {
  if (!note) return null;
  return <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEE', borderRadius: 4, border: '1px solid var(--error)', fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>Admin note: {note}</div>;
}

export default function RiderDocumentsPage() {
  const toast = useToast();
  const [doc, setDoc] = useState<RiderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    ninNumber: '', ninImageUrl: '', selfieUrl: '', vehicleImageUrl: '',
    guarantorName: '', guarantorPhone: '', guarantorAddress: '',
  });

  useEffect(() => {
    api.get('/riders/me/document').then(r => {
      const d: RiderDoc | null = r.data.data;
      setDoc(d);
      if (d) {
        setForm({
          ninNumber: d.ninNumber ?? '',
          ninImageUrl: d.ninImageUrl ?? '',
          selfieUrl: d.selfieUrl ?? '',
          vehicleImageUrl: d.vehicleImageUrl ?? '',
          guarantorName: d.guarantorName ?? '',
          guarantorPhone: d.guarantorPhone ?? '',
          guarantorAddress: d.guarantorAddress ?? '',
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const sf = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }));

  // Guarantor details are locked after first submission — mirrors gobuyme-mobile's
  // RiderDocumentScreen, where support has to be contacted to change them post-submit.
  const guarantorLocked = !!doc;

  const submit = async () => {
    if (!form.ninNumber.trim()) { toast('NIN is required', 'error'); return; }
    if (!doc) {
      if (!form.guarantorName.trim())    { toast("Guarantor's full name is required", 'error'); return; }
      if (!form.guarantorPhone.trim())   { toast("Guarantor's phone number is required", 'error'); return; }
      if (!form.guarantorAddress.trim()) { toast("Guarantor's address is required", 'error'); return; }
    }
    setSaving(true);
    try {
      const { data } = await api.post('/riders/me/document', {
        ninNumber: form.ninNumber.trim(),
        ninImageUrl: form.ninImageUrl || null,
        selfieUrl: form.selfieUrl || null,
        vehicleImageUrl: form.vehicleImageUrl || null,
        guarantorName: form.guarantorName.trim() || null,
        guarantorPhone: form.guarantorPhone.trim() || null,
        guarantorAddress: form.guarantorAddress.trim() || null,
      });
      setDoc(data.data ?? { ...form, id: '', status: 'PENDING', updatedAt: new Date().toISOString() });
      toast('Documents submitted — pending review', 'success');
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Submit failed', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div>
        <h1 className="t-page" style={{ marginBottom: 28 }}>Documents</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[...Array(2)].map((_, i) => <div key={i} className="sk" style={{ height: 200 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 className="t-page">Documents</h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Your NIN, a selfie, and vehicle/guarantor details are required before your account can be activated.
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800 }}>Identity &amp; Vehicle</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>National ID, selfie, and vehicle photo</p>
          </div>
          {doc && <span className={`badge ${STATUS_BADGE[doc.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[doc.status]}</span>}
        </div>

        {doc?.reviewNote && <ReviewNote note={doc.reviewNote} />}
        {doc?.status === 'PENDING' && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 4, fontSize: 13, color: 'var(--muted)' }}>
            Submitted {fmt(doc.updatedAt)} — awaiting review. You can resubmit to update.
          </div>
        )}

        <div className="form-group">
          <label className="label">NIN (National ID Number) *</label>
          <input className="input" value={form.ninNumber} onChange={e => sf('ninNumber', e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="11-digit NIN" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 4 }}>
          <UploadField label="NIN Slip / ID Card" value={form.ninImageUrl}     folder="rider-docs/id"      onChange={url => sf('ninImageUrl', url)} />
          <UploadField label="Selfie"             value={form.selfieUrl}      folder="rider-docs/selfie"  onChange={url => sf('selfieUrl', url)} />
          <UploadField label="Vehicle Photo"       value={form.vehicleImageUrl} folder="rider-docs/vehicle" onChange={url => sf('vehicleImageUrl', url)} />
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>Guarantor</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {guarantorLocked ? 'Locked after submission — contact support to request a change.' : 'Required for first-time submission'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="label">Guarantor Full Name {!guarantorLocked && '*'}</label>
            <input className="input" value={form.guarantorName} disabled={guarantorLocked} onChange={e => sf('guarantorName', e.target.value)} placeholder="Full name" />
          </div>
          <div className="form-group">
            <label className="label">Guarantor Phone {!guarantorLocked && '*'}</label>
            <input className="input" value={form.guarantorPhone} disabled={guarantorLocked} onChange={e => sf('guarantorPhone', e.target.value)} placeholder="+234..." />
          </div>
        </div>
        <div className="form-group">
          <label className="label">Guarantor Address {!guarantorLocked && '*'}</label>
          <textarea className="textarea" rows={2} value={form.guarantorAddress} disabled={guarantorLocked} onChange={e => sf('guarantorAddress', e.target.value)} placeholder="Full address" />
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        🔒 Your documents are encrypted and used only for identity verification. They are never shared with third parties.
      </p>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? <><span className="spin" />Submitting…</> : doc ? 'Update Documents' : 'Submit Documents'}
        </button>
      </div>
    </div>
  );
}
