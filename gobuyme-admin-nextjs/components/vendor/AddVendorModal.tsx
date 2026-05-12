'use client';
import { useState, useRef, CSSProperties, ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    ?? '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

type DocType = 'NIN' | 'DRIVERS_LICENSE' | 'PASSPORT';
type Tier    = 'TIER_1' | 'TIER_2';
type Step    = 1 | 2 | 3;

const CATEGORIES = [
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'GROCERY',    label: 'Grocery'    },
  { value: 'PHARMACY',   label: 'Pharmacy'   },
  { value: 'ERRAND',     label: 'Errand'     },
];

const DOC_META: Record<DocType, { label: string; numberLabel: string; placeholder: string; backRequired: boolean }> = {
  NIN:             { label: 'NIN',              numberLabel: 'NIN',             placeholder: '11-digit NIN',  backRequired: false },
  DRIVERS_LICENSE: { label: "Driver's License", numberLabel: 'License Number',  placeholder: 'e.g. ABC123XY', backRequired: true  },
  PASSPORT:        { label: 'Passport',          numberLabel: 'Passport Number', placeholder: 'e.g. A12345678', backRequired: false },
};

async function cloudinaryUpload(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return ((await res.json()) as { secure_url: string }).secure_url;
}

interface Props { open: boolean; onClose: () => void; onCreated: () => void; }

export function AddVendorModal({ open, onClose, onCreated }: Props) {
  const { theme: T } = useTheme();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Account
  const [name,         setName]         = useState('');
  const [email,        setEmail]        = useState('');
  const [phone,        setPhone]        = useState('');
  const [password,     setPassword]     = useState('');
  const [bizName,      setBizName]      = useState('');
  const [category,     setCategory]     = useState('RESTAURANT');
  const [address,      setAddress]      = useState('');
  const [city,         setCity]         = useState('');
  const [stateVal,     setStateVal]     = useState('');

  // Step 2 — Profile
  const [description,  setDescription]  = useState('');
  const [openingTime,  setOpeningTime]  = useState('');
  const [closingTime,  setClosingTime]  = useState('');
  const [tier,         setTier]         = useState<Tier>('TIER_2');
  const [logoUrl,      setLogoUrl]      = useState('');
  const [logoPreview,  setLogoPreview]  = useState('');
  const [coverUrl,     setCoverUrl]     = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [uploadingLogo,  setUploadingLogo]  = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Step 3 — Identity
  const [docType,         setDocType]         = useState<DocType | null>(null);
  const [docNumber,       setDocNumber]       = useState('');
  const [docFrontUrl,     setDocFrontUrl]     = useState('');
  const [docFrontPreview, setDocFrontPreview] = useState('');
  const [docBackUrl,      setDocBackUrl]      = useState('');
  const [docBackPreview,  setDocBackPreview]  = useState('');
  const [bvn,             setBvn]             = useState('');
  const [selfieUrl,       setSelfieUrl]       = useState('');
  const [selfiePreview,   setSelfiePreview]   = useState('');
  const [uploadingFront,  setUploadingFront]  = useState(false);
  const [uploadingBack,   setUploadingBack]   = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);

  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  const logoRef    = useRef<HTMLInputElement>(null);
  const coverRef   = useRef<HTMLInputElement>(null);
  const frontRef   = useRef<HTMLInputElement>(null);
  const backRef    = useRef<HTMLInputElement>(null);
  const selfieRef  = useRef<HTMLInputElement>(null);

  function reset() {
    setStep(1);
    setName(''); setEmail(''); setPhone(''); setPassword('');
    setBizName(''); setCategory('RESTAURANT'); setAddress(''); setCity(''); setStateVal('');
    setDescription(''); setOpeningTime(''); setClosingTime(''); setTier('TIER_2');
    setLogoUrl(''); setLogoPreview(''); setCoverUrl(''); setCoverPreview('');
    setDocType(null); setDocNumber('');
    setDocFrontUrl(''); setDocFrontPreview(''); setDocBackUrl(''); setDocBackPreview('');
    setBvn(''); setSelfieUrl(''); setSelfiePreview('');
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
    if (!name.trim())    return 'Owner full name is required.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Valid email address is required.';
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    if (!bizName.trim()) return 'Business name is required.';
    if (!address.trim()) return 'Street address is required.';
    if (!city.trim())    return 'City is required.';
    return null;
  }

  function validateStep2(): string | null {
    if (!description.trim()) return 'Store description is required.';
    if (!openingTime.trim()) return 'Opening time is required.';
    if (!closingTime.trim()) return 'Closing time is required.';
    return null;
  }

  function validateStep3(): string | null {
    if (docType && (!docNumber.trim() || !docFrontUrl)) {
      return 'Document number and front image are required when a document type is selected.';
    }
    return null;
  }

  function nextStep() {
    setError('');
    if (step === 1) {
      const err = validateStep1(); if (err) { setError(err); return; }
      setStep(2);
    } else if (step === 2) {
      const err = validateStep2(); if (err) { setError(err); return; }
      setStep(3);
    }
  }

  async function handleSubmit() {
    setError('');
    const err = validateStep3(); if (err) { setError(err); return; }
    setSaving(true);
    try {
      await api.post('/admin/vendors/create', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        password,
        businessName: bizName.trim(),
        category,
        address: address.trim(),
        city: city.trim(),
        ...(stateVal.trim() ? { state: stateVal.trim() } : {}),
        description: description.trim(),
        openingTime: openingTime.trim(),
        closingTime: closingTime.trim(),
        tier,
        ...(logoUrl    ? { logo: logoUrl }           : {}),
        ...(coverUrl   ? { coverImage: coverUrl }     : {}),
        ...(docType && docNumber.trim() && docFrontUrl ? {
          docType,
          docNumber: docNumber.trim(),
          docImageUrl: docFrontUrl,
          ...(docBackUrl  ? { docImageUrlBack: docBackUrl } : {}),
          ...(bvn.trim()  ? { bvn: bvn.trim() }             : {}),
          ...(selfieUrl   ? { selfieUrl }                    : {}),
        } : {}),
      });
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor.');
    } finally {
      setSaving(false);
    }
  }

  const anyUploading = uploadingLogo || uploadingCover || uploadingFront || uploadingBack || uploadingSelfie;

  const stepLabels = ['Account', 'Profile', 'Identity'];

  return (
    <Modal open={open} onClose={handleClose} title="Add New Vendor" width={620}>
      <div style={{ padding: '20px 24px 24px' }}>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
          {stepLabels.map((label, i) => {
            const idx = i + 1;
            const active  = step === idx;
            const done    = step > idx;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < 3 ? 1 : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? T.success : active ? T.primary : T.surface2,
                    border: `2px solid ${done ? T.success : active ? T.primary : T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    color: done || active ? '#fff' : T.textSec,
                    flexShrink: 0,
                  }}>
                    {done ? '✓' : idx}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? T.text : T.textSec }}>
                    {label}
                  </span>
                </div>
                {idx < 3 && (
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
              <Field label="Owner Full Name *" T={T}>
                <FInput value={name} onChange={setName} placeholder="Chioma Adaeze" T={T} />
              </Field>
              <Field label="Email Address *" T={T}>
                <FInput type="email" value={email} onChange={setEmail} placeholder="vendor@email.com" T={T} />
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
            <Field label="Business Name *" T={T}>
              <FInput value={bizName} onChange={setBizName} placeholder="Mama Titi Kitchen" T={T} />
            </Field>
            <Field label="Category *" T={T}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CATEGORIES.map(c => (
                  <button key={c.value} onClick={() => setCategory(c.value)}
                    style={{ padding: '7px 14px', borderRadius: 4, fontFamily: 'inherit', cursor: 'pointer',
                      border: `1px solid ${category === c.value ? T.primary : T.border}`,
                      background: category === c.value ? T.primaryTint : T.surface2,
                      color: category === c.value ? T.primary : T.textSec,
                      fontSize: 12, fontWeight: 600 }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Street Address *" T={T}>
              <FInput value={address} onChange={setAddress} placeholder="12 Wetheral Road" T={T} />
            </Field>
            <Row>
              <Field label="City *" T={T}>
                <FInput value={city} onChange={setCity} placeholder="Owerri" T={T} />
              </Field>
              <Field label="State" T={T}>
                <FInput value={stateVal} onChange={setStateVal} placeholder="Imo" T={T} />
              </Field>
            </Row>
          </div>
        )}

        {/* ── STEP 2: PROFILE ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Store Description *" T={T}>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Tell customers what makes this store special…" rows={3}
                style={{ width: '100%', boxSizing: 'border-box', background: T.surface2,
                  border: `1px solid ${T.border}`, borderRadius: 4, padding: '10px 12px',
                  color: T.text, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            </Field>
            <Row>
              <Field label="Opens At *" T={T}>
                <FInput type="time" value={openingTime} onChange={setOpeningTime} T={T} />
              </Field>
              <Field label="Closes At *" T={T}>
                <FInput type="time" value={closingTime} onChange={setClosingTime} T={T} />
              </Field>
            </Row>

            {/* Tier cards */}
            <Field label="Commission Plan *" T={T}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['TIER_2', 'TIER_1'] as Tier[]).map(t => {
                  const isGrowth = t === 'TIER_2';
                  const sel = tier === t;
                  return (
                    <div key={t} onClick={() => setTier(t)}
                      style={{ padding: 14, borderRadius: 4, cursor: 'pointer',
                        border: `${sel ? 2 : 1}px solid ${sel ? T.primary : T.border}`,
                        background: T.surface2 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{isGrowth ? 'Growth Plan' : 'Starter Plan'}</div>
                          {isGrowth && <span style={{ fontSize: 10, fontWeight: 700, color: T.primary, background: `${T.primary}18`, padding: '1px 6px', borderRadius: 4 }}>RECOMMENDED</span>}
                        </div>
                        <RadioDot selected={sel} primary={T.primary} />
                      </div>
                      <div style={{ fontSize: 12, color: T.textSec }}>{isGrowth ? '7.5% commission per order' : '3% commission per order'}</div>
                    </div>
                  );
                })}
              </div>
            </Field>

            {/* Logo + Cover uploads */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Store Logo (optional)" T={T}>
                <ImgBox preview={logoPreview} uploading={uploadingLogo}
                  hint="Click to upload" aspect="square"
                  onClick={() => logoRef.current?.click()} T={T} />
                <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setLogoPreview, setLogoUrl, setUploadingLogo); e.target.value = ''; }} />
              </Field>
              <Field label="Cover Photo (optional)" T={T}>
                <ImgBox preview={coverPreview} uploading={uploadingCover}
                  hint="Click to upload" aspect="wide"
                  onClick={() => coverRef.current?.click()} T={T} />
                <input ref={coverRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setCoverPreview, setCoverUrl, setUploadingCover); e.target.value = ''; }} />
              </Field>
            </div>
          </div>
        )}

        {/* ── STEP 3: IDENTITY ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6 }}>
              Identity documents are optional at this stage but required before account activation.
            </div>

            <Field label="Document Type" T={T}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(Object.keys(DOC_META) as DocType[]).map(dt => (
                  <button key={dt}
                    onClick={() => { setDocType(docType === dt ? null : dt); setDocNumber(''); setDocFrontUrl(''); setDocFrontPreview(''); setDocBackUrl(''); setDocBackPreview(''); }}
                    style={{ padding: '7px 14px', borderRadius: 4, fontFamily: 'inherit', cursor: 'pointer',
                      border: `1px solid ${docType === dt ? T.primary : T.border}`,
                      background: docType === dt ? T.primaryTint : T.surface2,
                      color: docType === dt ? T.primary : T.textSec,
                      fontSize: 12, fontWeight: 600 }}>
                    {DOC_META[dt].label}
                  </button>
                ))}
              </div>
            </Field>

            {docType && (
              <>
                <Field label={`${DOC_META[docType].numberLabel} *`} T={T}>
                  <FInput value={docNumber} onChange={v => setDocNumber(v.toUpperCase())}
                    placeholder={DOC_META[docType].placeholder} T={T} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: DOC_META[docType].backRequired ? '1fr 1fr' : '1fr', gap: 10 }}>
                  <Field label={DOC_META[docType].backRequired ? 'Front Image *' : 'Document Image *'} T={T}>
                    <ImgBox preview={docFrontPreview} uploading={uploadingFront}
                      hint="Click to upload" aspect="doc"
                      onClick={() => frontRef.current?.click()} T={T} />
                    <input ref={frontRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setDocFrontPreview, setDocFrontUrl, setUploadingFront); e.target.value = ''; }} />
                  </Field>
                  {DOC_META[docType].backRequired && (
                    <Field label="Back Image" T={T}>
                      <ImgBox preview={docBackPreview} uploading={uploadingBack}
                        hint="Click to upload" aspect="doc"
                        onClick={() => backRef.current?.click()} T={T} />
                      <input ref={backRef} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setDocBackPreview, setDocBackUrl, setUploadingBack); e.target.value = ''; }} />
                    </Field>
                  )}
                </div>
                <Row>
                  <Field label="BVN (optional)" T={T}>
                    <FInput value={bvn} onChange={v => setBvn(v.replace(/\D/g, '').slice(0, 11))} placeholder="11-digit BVN" T={T} />
                  </Field>
                  <Field label="Selfie (optional)" T={T}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <ImgBox preview={selfiePreview} uploading={uploadingSelfie}
                        hint="Click to upload" aspect="selfie"
                        onClick={() => selfieRef.current?.click()} T={T} />
                      <input ref={selfieRef} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setSelfiePreview, setSelfieUrl, setUploadingSelfie); e.target.value = ''; }} />
                    </div>
                  </Field>
                </Row>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: `${T.error}12`,
            border: `1px solid ${T.error}40`, borderRadius: 4, fontSize: 13, color: T.error }}>
            {error}
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
          <button onClick={step === 1 ? handleClose : () => { setError(''); setStep((step - 1) as Step); }}
            style={{ padding: '9px 20px', borderRadius: 4, border: `1px solid ${T.border}`,
              background: 'none', color: T.textSec, fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer' }}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {step < 3 ? (
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
              {saving ? 'Creating…' : anyUploading ? 'Uploading…' : 'Create Vendor'}
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

function ImgBox({ preview, uploading, hint, aspect, onClick, T }: {
  preview: string; uploading: boolean; hint: string;
  aspect: 'square' | 'wide' | 'doc' | 'selfie';
  onClick: () => void; T: Record<string, string>;
}) {
  const height = aspect === 'wide' ? 100 : aspect === 'selfie' ? 90 : 100;
  return (
    <div onClick={onClick} style={{ height, borderRadius: 4, border: `1px dashed ${T.border}`,
      background: T.surface2, cursor: 'pointer', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {preview
        ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ textAlign: 'center', color: T.textMuted }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
            <div style={{ fontSize: 11 }}>{hint}</div>
          </div>
      }
      {uploading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>Uploading…</span>
        </div>
      )}
      {preview && !uploading && (
        <div style={{ position: 'absolute', bottom: 6, right: 6, background: '#FF521B',
          borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700, color: '#fff' }}>
          Change
        </div>
      )}
    </div>
  );
}

function RadioDot({ selected, primary }: { selected: boolean; primary: string }) {
  return (
    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${selected ? primary : '#888'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: primary }} />}
    </div>
  );
}
