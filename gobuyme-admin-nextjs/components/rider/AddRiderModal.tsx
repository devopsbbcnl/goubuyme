'use client';
import { useState, useRef, CSSProperties, ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    ?? '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

type Step = 1 | 2;

async function cloudinaryUpload(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return ((await res.json()) as { secure_url: string }).secure_url;
}

interface Props { open: boolean; onClose: () => void; onCreated: () => void; }

export function AddRiderModal({ open, onClose, onCreated }: Props) {
  const { theme: T } = useTheme();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Account
  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [password,    setPassword]    = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');

  // Step 2 — Documents
  const [ninNumber,         setNinNumber]         = useState('');
  const [ninImgUrl,         setNinImgUrl]         = useState('');
  const [ninImgPreview,     setNinImgPreview]     = useState('');
  const [selfieUrl,         setSelfieUrl]         = useState('');
  const [selfiePreview,     setSelfiePreview]     = useState('');
  const [vehicleImgUrl,     setVehicleImgUrl]     = useState('');
  const [vehicleImgPreview, setVehicleImgPreview] = useState('');
  const [guarantorName,     setGuarantorName]     = useState('');
  const [guarantorPhone,    setGuarantorPhone]    = useState('');
  const [guarantorAddress,  setGuarantorAddress]  = useState('');
  const [uploadingNin,     setUploadingNin]     = useState(false);
  const [uploadingSelfie,  setUploadingSelfie]  = useState(false);
  const [uploadingVehicle, setUploadingVehicle] = useState(false);

  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  const ninRef     = useRef<HTMLInputElement>(null);
  const selfieRef  = useRef<HTMLInputElement>(null);
  const vehicleRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep(1);
    setName(''); setEmail(''); setPhone(''); setPassword('');
    setVehicleType(''); setPlateNumber('');
    setNinNumber('');
    setNinImgUrl(''); setNinImgPreview('');
    setSelfieUrl(''); setSelfiePreview('');
    setVehicleImgUrl(''); setVehicleImgPreview('');
    setGuarantorName(''); setGuarantorPhone(''); setGuarantorAddress('');
    setError(''); setSaving(false);
  }

  function handleClose() { reset(); onClose(); }

  async function handleFileUpload(
    file: File,
    setPreview: (v: string) => void,
    setUrl: (v: string) => void,
    setUploading: (v: boolean) => void,
  ) {
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      setUrl(await cloudinaryUpload(file));
    } catch {
      setPreview('');
      setError('Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function validateStep1(): string | null {
    if (!name.trim())         return 'Full name is required.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
                              return 'Valid email address is required.';
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    if (!vehicleType.trim())  return 'Vehicle type is required.';
    return null;
  }

  function nextStep() {
    setError('');
    const err = validateStep1();
    if (err) { setError(err); return; }
    setStep(2);
  }

  async function handleSubmit() {
    setError('');
    setSaving(true);
    try {
      await api.post('/admin/riders/create', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        ...(phone.trim()       ? { phone: phone.trim() }                       : {}),
        password,
        vehicleType: vehicleType.trim(),
        ...(plateNumber.trim() ? { plateNumber: plateNumber.trim().toUpperCase() } : {}),
        ...(ninNumber.trim()   ? { ninNumber: ninNumber.trim() }                : {}),
        ...(ninImgUrl          ? { ninImageUrl: ninImgUrl }                     : {}),
        ...(selfieUrl          ? { selfieUrl }                                  : {}),
        ...(vehicleImgUrl      ? { vehicleImageUrl: vehicleImgUrl }             : {}),
        ...(guarantorName.trim()    ? { guarantorName: guarantorName.trim() }        : {}),
        ...(guarantorPhone.trim()   ? { guarantorPhone: guarantorPhone.trim() }      : {}),
        ...(guarantorAddress.trim() ? { guarantorAddress: guarantorAddress.trim() }  : {}),
      });
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rider.');
    } finally {
      setSaving(false);
    }
  }

  const anyUploading = uploadingNin || uploadingSelfie || uploadingVehicle;
  const stepLabels   = ['Account', 'Documents'];

  return (
    <Modal open={open} onClose={handleClose} title="Add New Rider" width={560}>
      <div style={{ padding: '20px 24px 24px' }}>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
          {stepLabels.map((label, i) => {
            const idx    = i + 1;
            const active = step === idx;
            const done   = step > idx;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < 2 ? 1 : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? T.success : active ? T.primary : T.surface2,
                    border: `2px solid ${done ? T.success : active ? T.primary : T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    color: done || active ? '#fff' : T.textSec, flexShrink: 0,
                  }}>
                    {done ? '✓' : idx}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? T.text : T.textSec }}>
                    {label}
                  </span>
                </div>
                {idx < 2 && (
                  <div style={{ flex: 1, height: 1, background: done ? T.success : T.border, margin: '0 12px' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── STEP 1: ACCOUNT ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Row>
              <Field label="Full Name *" T={T}>
                <FInput value={name} onChange={setName} placeholder="Emeka Okafor" T={T} />
              </Field>
              <Field label="Email Address *" T={T}>
                <FInput type="email" value={email} onChange={setEmail} placeholder="rider@email.com" T={T} />
              </Field>
            </Row>
            <Row>
              <Field label="Phone Number" T={T}>
                <FInput type="tel" value={phone} onChange={setPhone} placeholder="+2348012345678" T={T} />
              </Field>
              <Field label="Password *" T={T}>
                <FInput type="password" value={password} onChange={setPassword} placeholder="Min 8 characters" T={T} />
              </Field>
            </Row>
            <Row>
              <Field label="Vehicle Type *" T={T}>
                <FInput value={vehicleType} onChange={setVehicleType} placeholder="e.g. Honda CB150, Tricycle" T={T} />
              </Field>
              <Field label="Plate Number" T={T}>
                <FInput value={plateNumber} onChange={v => setPlateNumber(v.toUpperCase())} placeholder="e.g. ABC 123 DE" T={T} />
              </Field>
            </Row>
          </div>
        )}

        {/* ── STEP 2: DOCUMENTS ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6 }}>
              All fields below are optional but required before the rider can be activated.
            </div>

            {/* NIN */}
            <Field label="NIN (National ID Number)" T={T}>
              <FInput
                value={ninNumber}
                onChange={v => setNinNumber(v.replace(/\D/g, '').slice(0, 11))}
                placeholder="11-digit NIN" T={T}
              />
            </Field>

            {/* Photo uploads */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="NIN Slip / ID Card" T={T}>
                <ImgBox preview={ninImgPreview} uploading={uploadingNin}
                  hint="Click to upload" onClick={() => ninRef.current?.click()} T={T} />
                <input ref={ninRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setNinImgPreview, setNinImgUrl, setUploadingNin); e.target.value = ''; }} />
              </Field>
              <Field label="Selfie / Liveness" T={T}>
                <ImgBox preview={selfiePreview} uploading={uploadingSelfie}
                  hint="Click to upload" onClick={() => selfieRef.current?.click()} T={T} />
                <input ref={selfieRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setSelfiePreview, setSelfieUrl, setUploadingSelfie); e.target.value = ''; }} />
              </Field>
              <Field label="Vehicle Photo" T={T}>
                <ImgBox preview={vehicleImgPreview} uploading={uploadingVehicle}
                  hint="Click to upload" onClick={() => vehicleRef.current?.click()} T={T} />
                <input ref={vehicleRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setVehicleImgPreview, setVehicleImgUrl, setUploadingVehicle); e.target.value = ''; }} />
              </Field>
            </div>

            {/* Guarantor */}
            <div style={{ paddingTop: 4, borderTop: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, letterSpacing: '0.4px', marginBottom: 12 }}>
                GUARANTOR (optional)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Row>
                  <Field label="Full Name" T={T}>
                    <FInput value={guarantorName} onChange={setGuarantorName} placeholder="e.g. Chukwudi Okafor" T={T} />
                  </Field>
                  <Field label="Phone Number" T={T}>
                    <FInput type="tel" value={guarantorPhone} onChange={setGuarantorPhone} placeholder="e.g. 08012345678" T={T} />
                  </Field>
                </Row>
                <Field label="Address" T={T}>
                  <FInput value={guarantorAddress} onChange={setGuarantorAddress} placeholder="Street address" T={T} />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: `${T.error}12`,
            border: `1px solid ${T.error}40`, borderRadius: 4, fontSize: 13, color: T.error }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
          <button
            onClick={step === 1 ? handleClose : () => { setError(''); setStep(1); }}
            style={{ padding: '9px 20px', borderRadius: 4, border: `1px solid ${T.border}`,
              background: 'none', color: T.textSec, fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer' }}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {step === 1 ? (
            <button onClick={nextStep}
              style={{ padding: '9px 24px', borderRadius: 4, border: 'none',
                background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer' }}>
              Next →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving || anyUploading}
              style={{ padding: '9px 24px', borderRadius: 4, border: 'none',
                background: saving || anyUploading ? T.surface3 : T.primary,
                color: saving || anyUploading ? T.textSec : '#fff',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: saving || anyUploading ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Creating…' : anyUploading ? 'Uploading…' : 'Create Rider'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
}

function Field({ label, children, T }: { label: string; children: ReactNode; T: Record<string, string> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: T.textSec, letterSpacing: '0.4px' } as CSSProperties}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FInput({ type = 'text', value, onChange, placeholder, T }: {
  type?: string; value: string; onChange: (v: string) => void; placeholder?: string; T: Record<string, string>;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', boxSizing: 'border-box', background: T.surface2,
        border: `1px solid ${T.border}`, borderRadius: 4, padding: '9px 12px',
        color: T.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' } as CSSProperties} />
  );
}

function ImgBox({ preview, uploading, hint, onClick, T }: {
  preview: string; uploading: boolean; hint: string; onClick: () => void; T: Record<string, string>;
}) {
  return (
    <div onClick={onClick} style={{ height: 90, borderRadius: 4, border: `1px dashed ${T.border}`,
      background: T.surface2, cursor: 'pointer', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {preview
        ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ textAlign: 'center', color: T.textMuted }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>📷</div>
            <div style={{ fontSize: 10 }}>{hint}</div>
          </div>
      }
      {uploading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>Uploading…</span>
        </div>
      )}
      {preview && !uploading && (
        <div style={{ position: 'absolute', bottom: 5, right: 5, background: '#FF521B',
          borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, color: '#fff' }}>
          Change
        </div>
      )}
    </div>
  );
}
