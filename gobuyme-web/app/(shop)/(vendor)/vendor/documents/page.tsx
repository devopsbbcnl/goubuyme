'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { uploadToCloudinary } from '@/services/cloudinary';

// ── Types ──────────────────────────────────────────────────────────────────────

interface IdDocument {
  id: string;
  type: 'NIN' | 'DRIVERS_LICENSE' | 'PASSPORT';
  number: string;
  imageUrl: string;
  imageUrlBack?: string;
  bvn?: string;
  selfieUrl?: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

interface BusinessVerification {
  id: string;
  cacNumber?: string;
  cacImageUrl?: string;
  tin?: string;
  directorNin?: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

interface License {
  id: string;
  type: string;
  licenseNumber: string;
  imageUrl: string;
  expiresAt?: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  reviewNote?: string;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-warning', VERIFIED: 'badge-success',
  REJECTED: 'badge-error',  EXPIRED:  'badge-error',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: '⏳ Pending Review', VERIFIED: '✓ Verified',
  REJECTED: '✕ Rejected',      EXPIRED:  '✕ Expired',
};
const DOC_TYPE_LABEL: Record<string, string> = {
  NIN: 'National ID (NIN)', DRIVERS_LICENSE: "Driver's License", PASSPORT: 'International Passport',
  NAFDAC: 'NAFDAC Certificate', PHARMACIST: 'Pharmacist License',
  FOOD_HANDLER: 'Food Handler Certificate', BUSINESS_PERMIT: 'Business Permit', IMPORT_PERMIT: 'Import Permit',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Small inline upload field with preview thumbnail
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
    } catch { toast('Upload failed', 'error'); }
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

// ── Identity Document Section ──────────────────────────────────────────────────

function IdentitySection({ initial, onSaved }: { initial: IdDocument | null; onSaved: (d: IdDocument) => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type:     initial?.type ?? 'NIN' as string,
    number:   initial?.number ?? '',
    bvn:      initial?.bvn ?? '',
    imageUrl:     initial?.imageUrl ?? '',
    imageUrlBack: initial?.imageUrlBack ?? '',
    selfieUrl:    initial?.selfieUrl ?? '',
  });

  const sf = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.imageUrl) { toast('Front image is required', 'error'); return; }
    if (!form.number)   { toast('Document number is required', 'error'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/vendors/me/document', form);
      onSaved(data.data ?? { ...form, id: '', status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      toast('Document submitted — pending review', 'success');
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Submit failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>Identity Document</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>NIN, Driver's License, or Passport</p>
        </div>
        {initial && <span className={`badge ${STATUS_BADGE[initial.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[initial.status]}</span>}
      </div>

      {initial?.reviewNote && <ReviewNote note={initial.reviewNote} />}
      {initial?.status === 'PENDING' && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 4, fontSize: 13, color: 'var(--muted)' }}>
          Submitted {fmt(initial.updatedAt)} — awaiting review. You can resubmit to update.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="label">Document Type *</label>
          <select className="select" value={form.type} onChange={e => sf('type', e.target.value)}>
            <option value="NIN">National ID (NIN)</option>
            <option value="DRIVERS_LICENSE">Driver's License</option>
            <option value="PASSPORT">International Passport</option>
          </select>
        </div>
        <div className="form-group">
          <label className="label">Document Number *</label>
          <input className="input" value={form.number} onChange={e => sf('number', e.target.value)} placeholder="e.g. 12345678901" />
        </div>
        <div className="form-group">
          <label className="label">BVN</label>
          <input className="input" value={form.bvn} onChange={e => sf('bvn', e.target.value)} placeholder="11-digit BVN" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 4 }}>
        <UploadField label="Front of Document" value={form.imageUrl}     folder="vendor-docs/id" onChange={url => sf('imageUrl', url)}     required />
        <UploadField label="Back of Document"  value={form.imageUrlBack} folder="vendor-docs/id" onChange={url => sf('imageUrlBack', url)} />
        <UploadField label="Selfie with ID"    value={form.selfieUrl}    folder="vendor-docs/id" onChange={url => sf('selfieUrl', url)}    />
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? <><span className="spin" />Submitting…</> : initial ? 'Resubmit Document' : 'Submit Document'}
        </button>
      </div>
    </div>
  );
}

// ── Business Verification Section ─────────────────────────────────────────────

function BusinessSection({ initial, onSaved }: { initial: BusinessVerification | null; onSaved: (d: BusinessVerification) => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cacNumber:   initial?.cacNumber ?? '',
    tin:         initial?.tin ?? '',
    directorNin: initial?.directorNin ?? '',
    cacImageUrl: initial?.cacImageUrl ?? '',
  });

  const sf = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const { data } = await api.post('/vendors/me/business-verification', form);
      onSaved(data.data ?? { ...form, id: '', status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      toast('Business verification submitted — pending review', 'success');
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Submit failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>Business Verification</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>CAC registration and tax information</p>
        </div>
        {initial && <span className={`badge ${STATUS_BADGE[initial.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[initial.status]}</span>}
      </div>

      {initial?.reviewNote && <ReviewNote note={initial.reviewNote} />}
      {initial?.status === 'PENDING' && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 4, fontSize: 13, color: 'var(--muted)' }}>
          Submitted {fmt(initial.updatedAt)} — awaiting review. You can resubmit to update.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="label">CAC Number</label>
          <input className="input" value={form.cacNumber} onChange={e => sf('cacNumber', e.target.value)} placeholder="e.g. RC1234567" />
        </div>
        <div className="form-group">
          <label className="label">TIN</label>
          <input className="input" value={form.tin} onChange={e => sf('tin', e.target.value)} placeholder="Tax Identification Number" />
        </div>
        <div className="form-group">
          <label className="label">Director NIN</label>
          <input className="input" value={form.directorNin} onChange={e => sf('directorNin', e.target.value)} placeholder="Director's NIN" />
        </div>
      </div>

      <div style={{ marginTop: 4 }}>
        <UploadField label="CAC Document / Certificate of Incorporation" value={form.cacImageUrl} folder="vendor-docs/business" onChange={url => sf('cacImageUrl', url)} />
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? <><span className="spin" />Submitting…</> : initial ? 'Resubmit Verification' : 'Submit Verification'}
        </button>
      </div>
    </div>
  );
}

// ── Licenses Section ──────────────────────────────────────────────────────────

const LICENSE_TYPES = ['NAFDAC', 'PHARMACIST', 'FOOD_HANDLER', 'BUSINESS_PERMIT', 'IMPORT_PERMIT'];

function LicenseCard({ lic }: { lic: License }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <a href={lic.imageUrl} target="_blank" rel="noopener noreferrer">
        <img src={lic.imageUrl} alt="" style={{ width: 72, height: 50, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)', display: 'block', flexShrink: 0 }} />
      </a>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{DOC_TYPE_LABEL[lic.type] ?? lic.type}</span>
          <span className={`badge ${STATUS_BADGE[lic.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[lic.status]}</span>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          #{lic.licenseNumber}
          {lic.expiresAt && ` · Expires ${fmt(lic.expiresAt)}`}
          {' · '}Submitted {fmt(lic.createdAt)}
        </div>
        {lic.reviewNote && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--error)', fontWeight: 600 }}>Note: {lic.reviewNote}</div>}
      </div>
    </div>
  );
}

function AddLicenseForm({ onAdded }: { onAdded: (lic: License) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: 'NAFDAC', licenseNumber: '', imageUrl: '', expiresAt: '' });
  const sf = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.licenseNumber) { toast('License number is required', 'error'); return; }
    if (!form.imageUrl)      { toast('License image is required', 'error'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/vendors/me/licenses', form);
      onAdded(data.data ?? { ...form, id: Date.now().toString(), status: 'PENDING', createdAt: new Date().toISOString() });
      setForm({ type: 'NAFDAC', licenseNumber: '', imageUrl: '', expiresAt: '' });
      setOpen(false);
      toast('License submitted — pending review', 'success');
    } catch (e: any) { toast(e?.response?.data?.message ?? 'Submit failed', 'error'); }
    finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>+ Add License</button>
    );
  }

  return (
    <div style={{ marginTop: 16, padding: 16, background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--line)' }}>
      <h4 style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>New License / Permit</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="label">License Type *</label>
          <select className="select" value={form.type} onChange={e => sf('type', e.target.value)}>
            {LICENSE_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABEL[t] ?? t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">License Number *</label>
          <input className="input" value={form.licenseNumber} onChange={e => sf('licenseNumber', e.target.value)} placeholder="e.g. NAFDAC/FBR/01/1234" />
        </div>
        <div className="form-group">
          <label className="label">Expiry Date</label>
          <input className="input" type="date" value={form.expiresAt} onChange={e => sf('expiresAt', e.target.value)} />
        </div>
      </div>
      <UploadField label="License Image *" value={form.imageUrl} folder="vendor-docs/licenses" onChange={url => sf('imageUrl', url)} required />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? <><span className="spin" />Submitting…</> : 'Submit License'}
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VendorDocumentsPage() {
  const [idDoc, setIdDoc]       = useState<IdDocument | null>(null);
  const [bizVerif, setBizVerif] = useState<BusinessVerification | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get('/vendors/me/document'),
      api.get('/vendors/me/business-verification'),
      api.get('/vendors/me/licenses'),
    ]).then(([docRes, bizRes, licRes]) => {
      if (docRes.status === 'fulfilled') setIdDoc(docRes.value.data.data ?? null);
      if (bizRes.status === 'fulfilled') setBizVerif(bizRes.value.data.data ?? null);
      if (licRes.status === 'fulfilled') setLicenses(licRes.value.data.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="t-page" style={{ marginBottom: 28 }}>Documents</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 200 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 className="t-page">Documents</h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Submit your KYC and compliance documents. All changes trigger a new review.
        </p>
      </div>

      <IdentitySection initial={idDoc} onSaved={d => setIdDoc({ ...d, status: 'PENDING' } as IdDocument)} />

      <BusinessSection initial={bizVerif} onSaved={d => setBizVerif({ ...d, status: 'PENDING' } as BusinessVerification)} />

      <div className="card card-pad">
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>Licenses & Permits</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Operational licenses required for your business category</p>
        </div>

        {licenses.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, padding: '8px 0' }}>No licenses submitted yet.</p>
        ) : (
          <div>
            {licenses.map(lic => <LicenseCard key={lic.id} lic={lic} />)}
          </div>
        )}

        <AddLicenseForm onAdded={lic => setLicenses(prev => [...prev, { ...lic, status: 'PENDING' } as License])} />
      </div>
    </div>
  );
}
