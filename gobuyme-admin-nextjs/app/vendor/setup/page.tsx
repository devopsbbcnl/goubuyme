'use client';
import { useState, useRef, CSSProperties, FormEvent, ChangeEvent, ReactNode } from 'react';
import Image from 'next/image';
import { useTheme } from '@/context/ThemeContext';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

type DocType = 'NIN' | 'DRIVERS_LICENSE' | 'PASSPORT';
type Tier = 'TIER_1' | 'TIER_2';
type Step = 'login' | 'form' | 'done';

const DOC_META: Record<DocType, { label: string; numberLabel: string; placeholder: string; backRequired: boolean }> = {
  NIN:             { label: 'NIN',               numberLabel: 'NIN',             placeholder: '11-digit NIN (e.g. 12345678901)', backRequired: false },
  DRIVERS_LICENSE: { label: "Driver's License",  numberLabel: 'License Number',  placeholder: 'e.g. ABC123456XY',               backRequired: true  },
  PASSPORT:        { label: 'Passport',           numberLabel: 'Passport Number', placeholder: 'e.g. A12345678',                 backRequired: false },
};

const PLAN_DETAILS: Record<Tier, { title: string; bestFor: string; features: string[]; example: string }> = {
  TIER_2: {
    title: 'Growth Plan',
    bestFor: 'Vendors starting out or scaling up on GoBuyMe.',
    features: [
      '7.5% commission deducted from each order subtotal',
      'Promotions / Adverts & Analytics',
      'Priority listing in search results',
      'Full platform access',
      'Secure payment processing via Paystack',
      'Daily payouts processed at 11:30 AM',
      'Dedicated vendor support',
    ],
    example: 'On a ₦10,000 order: GoBuyMe earns ₦750 · You receive ₦9,250',
  },
  TIER_1: {
    title: 'Starter Plan',
    bestFor: 'Established vendors with consistent, high order volumes.',
    features: [
      '3% commission deducted from each order subtotal',
      'Full platform access',
      'Secure payment processing via Paystack',
      'Daily payouts processed at 11:30 AM',
      'Dedicated vendor support',
    ],
    example: 'On a ₦10,000 order: GoBuyMe earns ₦300 · You receive ₦9,700',
  },
};

type MenuItem = { id: string; name: string; price: string };

async function cloudinaryUpload(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return ((await res.json()) as { secure_url: string }).secure_url;
}

async function apiCall(path: string, method: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { message?: string }).message ?? 'Request failed');
  return json;
}

export default function VendorSetupPage() {
  const { theme: T } = useTheme();

  const [step, setStep] = useState<Step>('login');
  const [token, setToken] = useState('');

  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Images
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Store info
  const [description, setDescription] = useState('');
  const [openingTime, setOpeningTime] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [tier, setTier] = useState<Tier>('TIER_2');

  // Identity document
  const [docType, setDocType] = useState<DocType | null>(null);
  const [docNumber, setDocNumber] = useState('');
  const [docFrontUrl, setDocFrontUrl] = useState('');
  const [docFrontPreview, setDocFrontPreview] = useState('');
  const [docBackUrl, setDocBackUrl] = useState('');
  const [docBackPreview, setDocBackPreview] = useState('');
  const [bvn, setBvn] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [selfiePreview, setSelfiePreview] = useState('');
  const [uploadingDocFront, setUploadingDocFront] = useState(false);
  const [uploadingDocBack, setUploadingDocBack] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);

  // Menu
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Modals
  const [planModal, setPlanModal] = useState<Tier | null>(null);
  const [coverHint, setCoverHint] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // File input refs
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const docFrontRef = useRef<HTMLInputElement>(null);
  const docBackRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { message?: string }).message ?? 'Login failed');
      const { accessToken, user } = (json as { data: { accessToken: string; user: { role: string } } }).data;
      if (user.role !== 'VENDOR') throw new Error('This page is only for vendor accounts.');
      sessionStorage.setItem('vendor_setup_token', accessToken);
      setToken(accessToken);
      setStep('form');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleFileUpload = async (
    file: File,
    setPreview: (url: string) => void,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
  ) => {
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await cloudinaryUpload(file);
      setUrl(url);
    } catch {
      setPreview('');
      alert('Image upload failed. Please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!description.trim()) { setSaveError('Please add a description for your store.'); return; }
    if (!openingTime.trim() || !closingTime.trim()) { setSaveError('Please enter opening and closing times.'); return; }
    if (!docType) { setSaveError('Please select an identity document type.'); return; }
    if (!docNumber.trim()) { setSaveError(`Please enter your ${DOC_META[docType].numberLabel}.`); return; }
    if (!docFrontUrl) { setSaveError('Please upload your document image.'); return; }
    setSaveError('');
    setSaving(true);
    try {
      await apiCall('/vendors/me', 'PATCH', token, {
        description: description.trim(),
        logo: logoUrl || null,
        coverImage: coverUrl || null,
        openingTime: openingTime.trim(),
        closingTime: closingTime.trim(),
      });
      if (tier === 'TIER_1') {
        await apiCall('/vendors/me/tier', 'PATCH', token, { tier: 'TIER_1' });
      }
      await apiCall('/vendors/me/document', 'POST', token, {
        type: docType,
        number: docNumber.trim(),
        imageUrl: docFrontUrl,
        imageUrlBack: docBackUrl || null,
        bvn: bvn.trim() || null,
        selfieUrl: selfieUrl || null,
      });
      const validItems = menuItems.filter(i => i.name.trim() && i.price.trim() && !isNaN(parseFloat(i.price)));
      await Promise.all(
        validItems.map(i =>
          apiCall('/vendors/me/menu', 'POST', token, {
            name: i.name.trim(),
            price: parseFloat(i.price),
            optionGroups: [],
          }),
        ),
      );
      setStep('done');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addMenuItem = () =>
    setMenuItems(prev => [...prev, { id: Date.now().toString(), name: '', price: '' }]);
  const updateItem = (id: string, field: keyof MenuItem, value: string) =>
    setMenuItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  const removeItem = (id: string) => setMenuItems(prev => prev.filter(i => i.id !== id));

  const resetDocType = (dt: DocType) => {
    setDocType(dt);
    setDocNumber('');
    setDocFrontUrl(''); setDocFrontPreview('');
    setDocBackUrl('');  setDocBackPreview('');
  };

  const anyUploading = uploadingLogo || uploadingCover || uploadingDocFront || uploadingDocBack || uploadingSelfie;

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (step === 'login') {
    return (
      <PageShell T={T}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Image src="/icon.png" alt="GoBuyMe" width={200} height={200} style={{ objectFit: 'contain', marginBottom: 12 }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>Set up your store</div>
            <div style={{ fontSize: 14, color: '#444', marginTop: 4 }}>Sign in to your GoBuyMe vendor account</div>
          </div>
          <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: 28 }}>
            <form onSubmit={handleLogin}>
              <Field label="Email" T={T}>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required T={T} />
              </Field>
              <Field label="Password" T={T} style={{ marginBottom: 20 }}>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required T={T} />
              </Field>
              {loginError && <ErrorBanner msg={loginError} />}
              <PrimaryBtn loading={loginLoading} label="Continue" loadingLabel="Signing in…" T={T} />
            </form>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <PageShell T={T}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <Image src="/icon.png" alt="GoBuyMe" width={160} height={160} style={{ objectFit: 'contain', marginBottom: 20 }} />
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1A9E5F20', border: '2px solid #1A9E5F40', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28, color: '#1A9E5F' }}>
            &#10003;
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 10 }}>You&apos;re all set!</div>
          <div style={{ fontSize: 15, color: '#444', lineHeight: 1.7, marginBottom: 24 }}>
            Your profile has been submitted for review. Our team will activate your account within 1–2 business days and send you an email once approved.
          </div>
          <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: 16, fontSize: 13, color: '#444' }}>
            In the meantime, visit our <a href="/vendor/how-to" style={{ color: '#FF521B', fontWeight: 600, textDecoration: 'none' }}>How To</a> pages and learn how to manage your store on the go.
          </div>
        </div>
      </PageShell>
    );
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#fbfbf2', fontFamily: 'var(--font-jakarta), sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 100px' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Image src="/icon.png" alt="GoBuyMe" width={64} height={64} style={{ objectFit: 'contain' }} />
            <span style={{ fontSize: 13, color: '#444' }}>GoBuyMe Vendor Setup</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#111', letterSpacing: '-0.5px', marginBottom: 6 }}>
            Set up your store
          </div>
          <div style={{ fontSize: 14, color: '#444', lineHeight: 1.6 }}>
            Complete your profile and choose a commission plan so we can activate your account.
          </div>
        </div>

        {/* ── COVER PHOTO ── */}
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#444', letterSpacing: '0.5px' }}>COVER PHOTO</span>
          <button onClick={() => setCoverHint(true)}
            style={{ background: 'none', border: 'none', color: '#FF521B', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0 }}>
            Hint
          </button>
        </div>
        <div
          onClick={() => coverRef.current?.click()}
          style={{ height: 160, borderRadius: 4, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}
        >
          {coverPreview
            ? <img src={coverPreview} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <div style={{ textAlign: 'center', color: '#888' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>[ + ]</div>
                <div style={{ fontSize: 13 }}>Click to add cover photo</div>
              </div>
          }
          {uploadingCover && <UploadOverlay />}
          {coverPreview && !uploadingCover && <ChangeChip />}
        </div>
        <input ref={coverRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setCoverPreview, setCoverUrl, setUploadingCover); e.target.value = ''; }} />

        {/* ── STORE LOGO ── */}
        <SectionLabel label="STORE LOGO" T={T} mt={4} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div
            onClick={() => logoRef.current?.click()}
            style={{ width: 80, height: 80, borderRadius: '50%', border: `2px solid ${T.border}`, background: '#fff', cursor: 'pointer', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            {logoPreview
              ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 26, color: '#888' }}>&#127860;</span>
            }
            {uploadingLogo && <UploadOverlay />}
          </div>
          <div>
            <button onClick={() => logoRef.current?.click()}
              style={{ padding: '8px 16px', borderRadius: 4, border: `1px solid ${T.border}`, background: '#f0ede6', color: '#111', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
              {logoPreview ? 'Change Logo' : 'Upload Logo'}
            </button>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Square image, at least 200×200 px</div>
          </div>
        </div>
        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setLogoPreview, setLogoUrl, setUploadingLogo); e.target.value = ''; }} />

        {/* ── DESCRIPTION ── */}
        <SectionLabel label="ABOUT YOUR STORE *" T={T} />
        <textarea
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Tell customers what makes your store special…"
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: '12px 14px', color: '#111', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, marginBottom: 24 }}
        />

        {/* ── OPENING HOURS ── */}
        <SectionLabel label="OPENING HOURS *" T={T} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
          <div>
            <label style={labelStyle(T)}>Opens at</label>
            <Input type="time" value={openingTime} onChange={e => setOpeningTime(e.target.value)} placeholder="08:00" T={T} />
          </div>
          <div>
            <label style={labelStyle(T)}>Closes at</label>
            <Input type="time" value={closingTime} onChange={e => setClosingTime(e.target.value)} placeholder="22:00" T={T} />
          </div>
        </div>

        {/* ── COMMISSION PLAN ── */}
        <SectionLabel label="COMMISSION PLAN *" T={T} />
        <div style={{ fontSize: 13, color: '#444', marginBottom: 14 }}>
          You can switch plans later from your profile (14-day cooldown applies).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
          {(['TIER_2', 'TIER_1'] as Tier[]).map(t => {
            const isGrowth = t === 'TIER_2';
            const selected = tier === t;
            return (
              <div key={t} onClick={() => setTier(t)}
                style={{ padding: 16, borderRadius: 4, cursor: 'pointer', border: `${selected ? 2 : 1}px solid ${selected ? '#FF521B' : T.border}`, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: isGrowth ? 4 : 0 }}>
                      {isGrowth ? 'Growth Plan' : 'Starter Plan'}
                    </div>
                    {isGrowth && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#FF521B', background: 'rgba(255,82,27,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <RadioDot selected={selected} />
                </div>
                <div style={{ fontSize: 13, color: '#444', marginBottom: 4 }}>
                  {isGrowth ? '✓ 7.5% commission per order' : '✓ 3% commission per order'}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
                  {isGrowth ? 'e.g. ₦10k order → you get ₦9,250' : 'e.g. ₦10k order → you get ₦9,700'}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setPlanModal(t); }}
                  style={{ background: 'none', border: 'none', color: '#FF521B', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0 }}>
                  Plan details
                </button>
              </div>
            );
          })}
        </div>

        {/* ── IDENTITY VERIFICATION ── */}
        <SectionLabel label="IDENTITY VERIFICATION *" T={T} />
        <div style={{ fontSize: 13, color: '#444', marginBottom: 14 }}>
          Select a government-issued ID to verify your identity. Required for account activation.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {(Object.keys(DOC_META) as DocType[]).map(dt => (
            <button key={dt} onClick={() => resetDocType(dt)}
              style={{ padding: '8px 14px', borderRadius: 4, fontFamily: 'inherit', border: `1px solid ${docType === dt ? '#FF521B' : T.border}`, background: docType === dt ? '#FF521B' : '#fff', color: docType === dt ? '#fff' : '#444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {DOC_META[dt].label}
            </button>
          ))}
        </div>

        {docType && (
          <>
            <label style={labelStyle(T)}>{DOC_META[docType].numberLabel} *</label>
            <Input value={docNumber} onChange={e => setDocNumber(e.target.value.toUpperCase())} placeholder={DOC_META[docType].placeholder} style={{ marginBottom: 18 }} T={T} />

            <label style={labelStyle(T)}>{DOC_META[docType].backRequired ? 'Document Images (Front & Back) *' : 'Document Image *'}</label>
            <div style={{ display: 'grid', gridTemplateColumns: DOC_META[docType].backRequired ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 18, marginTop: 8 }}>
              <ImgBox label={DOC_META[docType].backRequired ? 'Front' : undefined} preview={docFrontPreview} uploading={uploadingDocFront} hint="Click to upload" onClick={() => docFrontRef.current?.click()} T={T} />
              {DOC_META[docType].backRequired && (
                <ImgBox label="Back" preview={docBackPreview} uploading={uploadingDocBack} hint="Click to upload" onClick={() => docBackRef.current?.click()} T={T} />
              )}
            </div>
            <input ref={docFrontRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setDocFrontPreview, setDocFrontUrl, setUploadingDocFront); e.target.value = ''; }} />
            <input ref={docBackRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setDocBackPreview, setDocBackUrl, setUploadingDocBack); e.target.value = ''; }} />

            <label style={labelStyle(T)}>BVN (Bank Verification Number) — Optional</label>
            <Input value={bvn} onChange={e => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="11-digit BVN" style={{ marginBottom: 18 }} T={T} />

            <label style={labelStyle(T)}>Selfie / Liveness Photo — Optional</label>
            <ImgBox preview={selfiePreview} uploading={uploadingSelfie} hint="Click to upload a clear selfie" onClick={() => selfieRef.current?.click()} T={T} />
            <input ref={selfieRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setSelfiePreview, setSelfieUrl, setUploadingSelfie); e.target.value = ''; }} />

            <div style={{ display: 'flex', gap: 8, background: '#f0ede6', borderRadius: 4, padding: 12, marginTop: 12, marginBottom: 28 }}>
              <span style={{ color: '#888', flexShrink: 0 }}>&#128274;</span>
              <span style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
                Your document is encrypted and used only for identity verification. It will never be shared with third parties.
              </span>
            </div>
          </>
        )}

        {!docType && <div style={{ marginBottom: 28 }} />}

        {/* ── MENU ITEMS ── */}
        <SectionLabel label="MENU ITEMS" T={T} />
        <div style={{ fontSize: 13, color: '#444', marginBottom: 14 }}>
          A well-stocked menu gets approved faster. Add a few items with names and prices.
        </div>

        {menuItems.length === 0 ? (
          <div style={{ height: 80, border: `1px dashed ${T.border}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: '#888' }}>No items added yet</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {menuItems.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: '10px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                  <input
                    value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)}
                    placeholder="Item name (e.g. Jollof Rice)"
                    style={{ background: '#f0ede6', border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 12px', color: '#111', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', background: '#f0ede6', border: `1px solid ${T.border}`, borderRadius: 4, padding: '0 10px' }}>
                    <span style={{ fontSize: 13, color: '#444', marginRight: 4, flexShrink: 0 }}>&#8358;</span>
                    <input
                      value={item.price} onChange={e => updateItem(item.id, 'price', e.target.value)}
                      placeholder="0.00" type="number" min="0"
                      style={{ background: 'transparent', border: 'none', color: '#111', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%' }}
                    />
                  </div>
                </div>
                <button onClick={() => removeItem(item.id)}
                  style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1, fontFamily: 'inherit' }}>
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={addMenuItem}
          style={{ width: '100%', padding: '10px', borderRadius: 4, border: '1px dashed #FF521B', background: 'transparent', color: '#FF521B', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 36 }}>
          + Add Menu Item
        </button>

        {saveError && <ErrorBanner msg={saveError} />}

        <button
          onClick={handleSave}
          disabled={saving || anyUploading}
          style={{ width: '100%', padding: '14px', borderRadius: 4, border: 'none', background: (saving || anyUploading) ? '#e8e4de' : '#FF521B', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: (saving || anyUploading) ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : anyUploading ? 'Waiting for uploads…' : 'Save & Continue'}
        </button>
      </div>

      {/* ── COVER HINT MODAL ── */}
      {coverHint && (
        <ModalSheet onClose={() => setCoverHint(false)} title="Cover Photo Guide" T={T}>
          <ModalSection label="Recommended dimensions" T={T} />
          <InfoBox T={T}>
            <InfoRow label="SIZE"    value="1280 × 720 px  ·  16:9 ratio" T={T} />
            <InfoRow label="MINIMUM" value="800 × 450 px" T={T} />
            <InfoRow label="FORMAT"  value="JPG or PNG" T={T} />
          </InfoBox>
          <ModalSection label="Tips" T={T} />
          {[
            'Show your actual food, products, or storefront — not a logo',
            'Use bright, well-lit photos; avoid dark or blurry images',
            'Keep the main subject centred — edges may be cropped on smaller screens',
            'Avoid heavy text overlays; customers scan images quickly',
          ].map(tip => <FeatureRow key={tip} text={tip} T={T} />)}
        </ModalSheet>
      )}

      {/* ── PLAN DETAILS MODAL ── */}
      {planModal && (
        <ModalSheet onClose={() => setPlanModal(null)} title={PLAN_DETAILS[planModal].title} T={T}>
          <p style={{ fontSize: 13, color: '#444', margin: '0 0 16px', lineHeight: 1.6 }}>
            Best for: {PLAN_DETAILS[planModal].bestFor}
          </p>
          <div style={{ height: 1, background: T.border, margin: '0 0 16px' }} />
          <ModalSection label="What&apos;s included" T={T} />
          {PLAN_DETAILS[planModal].features.map(f => <FeatureRow key={f} text={f} T={T} />)}
          <InfoBox T={T}>
            <InfoRow label="EXAMPLE" value={PLAN_DETAILS[planModal].example} T={T} />
          </InfoBox>
        </ModalSheet>
      )}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function PageShell({ children, T }: { children: ReactNode; T: Record<string, string> }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fbfbf2', fontFamily: 'var(--font-jakarta), sans-serif', padding: '20px' }}>
      {children}
    </div>
  );
}

function SectionLabel({ label, T, mt }: { label: string; T: Record<string, string>; mt?: number }) {
  return (
    <div style={{ marginTop: mt ?? 0, marginBottom: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#444', letterSpacing: '0.5px' }}>{label}</span>
    </div>
  );
}

function labelStyle(T: Record<string, string>): CSSProperties {
  return { display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 };
}

function Field({ label, children, T, style }: { label: string; children: ReactNode; T: Record<string, string>; style?: CSSProperties }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <label style={labelStyle(T)}>{label}</label>
      {children}
    </div>
  );
}

function Input({ type = 'text', value, onChange, placeholder, required, style, T }: {
  type?: string; value?: string; onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; required?: boolean; style?: CSSProperties; T: Record<string, string>;
}) {
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder} required={required}
      style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: '10px 14px', color: '#111', fontSize: 14, outline: 'none', fontFamily: 'inherit', ...style }}
    />
  );
}

function ImgBox({ label, preview, uploading, hint, onClick, T }: {
  label?: string; preview: string; uploading: boolean; hint: string; onClick: () => void; T: Record<string, string>;
}) {
  return (
    <div>
      {label && <div style={{ fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 4 }}>{label}</div>}
      <div
        onClick={onClick}
        style={{ height: 110, borderRadius: 4, border: `1px dashed ${T.border}`, background: '#fff', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        {preview
          ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ textAlign: 'center', color: '#888' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>&#128247;</div>
              <div style={{ fontSize: 12 }}>{hint}</div>
            </div>
        }
        {uploading && <UploadOverlay />}
        {preview && !uploading && <ChangeChip />}
      </div>
    </div>
  );
}

function UploadOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Uploading…</div>
    </div>
  );
}

function ChangeChip() {
  return (
    <div style={{ position: 'absolute', bottom: 8, right: 8, background: '#FF521B', borderRadius: 4, padding: '3px 9px', fontSize: 11, fontWeight: 700, color: '#fff' }}>
      Change
    </div>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected ? '#FF521B' : '#888'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {selected && <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF521B' }} />}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ background: '#E23B3B15', border: '1px solid #E23B3B40', borderRadius: 4, padding: '12px 16px', fontSize: 13, color: '#E23B3B', marginBottom: 16 }}>
      {msg}
    </div>
  );
}

function PrimaryBtn({ loading, label, loadingLabel, T }: { loading: boolean; label: string; loadingLabel: string; T: Record<string, string> }) {
  return (
    <button type="submit" disabled={loading}
      style={{ width: '100%', padding: '12px', borderRadius: 4, background: loading ? '#e8e4de' : '#FF521B', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer' }}>
      {loading ? loadingLabel : label}
    </button>
  );
}

// ── Modal components ───────────────────────────────────────────────────────

function ModalSheet({ children, onClose, title, T }: { children: ReactNode; onClose: () => void; title: string; T: Record<string, string> }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000, fontFamily: 'var(--font-jakarta), sans-serif' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 600, background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 24px 36px', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border, margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#444', lineHeight: 1, fontFamily: 'inherit' }}>&times;</button>
        </div>
        {children}
        <button onClick={onClose}
          style={{ width: '100%', marginTop: 24, padding: '12px', borderRadius: 4, background: '#FF521B', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          Got it
        </button>
      </div>
    </div>
  );
}

function ModalSection({ label, T }: { label: string; T: Record<string, string> }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 10 }}>{label}</div>;
}

function FeatureRow({ text, T }: { text: string; T: Record<string, string> }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
      <span style={{ color: '#FF521B', flexShrink: 0, marginTop: 1 }}>&#10003;</span>
      <span style={{ fontSize: 14, color: '#444', lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function InfoBox({ children, T }: { children: ReactNode; T: Record<string, string> }) {
  return <div style={{ background: '#f0ede6', borderRadius: 4, padding: 14, marginTop: 8, marginBottom: 4 }}>{children}</div>;
}

function InfoRow({ label, value, T }: { label: string; value: string; T: Record<string, string> }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#111', lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}
