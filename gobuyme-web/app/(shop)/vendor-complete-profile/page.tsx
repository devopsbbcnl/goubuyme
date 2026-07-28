'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { uploadToCloudinary } from '@/services/cloudinary';
import { useCommissionRates, CommissionRates } from '@/hooks/useCommissionRates';

type Tier = 'TIER_1' | 'TIER_2';
type DocType = 'NIN' | 'DRIVERS_LICENSE' | 'PASSPORT';

const DOC_META: Record<DocType, { label: string; numberLabel: string; placeholder: string; backRequired: boolean }> = {
  NIN: { label: 'NIN', numberLabel: 'NIN', placeholder: '11-digit NIN (e.g. 12345678901)', backRequired: false },
  DRIVERS_LICENSE: { label: "Driver's License", numberLabel: 'License Number', placeholder: 'e.g. ABC123456XY', backRequired: true },
  PASSPORT: { label: 'Passport', numberLabel: 'Passport Number', placeholder: 'e.g. A12345678', backRequired: false },
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;
const exampleLine = (platformPercent: number) =>
  `On a ₦10,000 order: GoBuyMe earns ${naira(10_000 * platformPercent / 100)} · You receive ${naira(10_000 * (100 - platformPercent) / 100)}`;

const planDetails = (rates: CommissionRates): Record<Tier, { title: string; bestFor: string; features: string[]; example: string }> => ({
  TIER_2: {
    title: 'Growth Plan',
    bestFor: 'Vendors starting out or scaling up on GoBuyMe.',
    features: [
      `${rates.TIER_2.platformPercent}% commission deducted from each order subtotal`,
      'Promotions/Adverts & Analytics',
      'Priority listing in search results',
      'Full platform access',
      'Secure payment processing via Paystack',
      'Daily payouts processed at 11:30 AM',
      'Dedicated vendor support',
    ],
    example: exampleLine(rates.TIER_2.platformPercent),
  },
  TIER_1: {
    title: 'Starter Plan',
    bestFor: 'Established vendors with consistent, high order volumes.',
    features: [
      `${rates.TIER_1.platformPercent}% commission deducted from each order subtotal`,
      'Full platform access',
      'Secure payment processing via Paystack',
      'Daily payouts processed at 11:30 AM',
      'Dedicated vendor support',
    ],
    example: exampleLine(rates.TIER_1.platformPercent),
  },
});

// ── Reusable image upload box ───────────────────────────────────────────────────

function ImageUploadBox({
  label, value, onChange, height = 150, folder, circle,
}: { label: string; value: string; onChange: (url: string) => void; height?: number; folder: string; circle?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, folder);
      onChange(url);
    } catch (err: any) {
      toast(err?.message || 'Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="label">{label}</label>
      <div
        className="doc-img-box"
        style={{ height, width: circle ? height : '100%', borderRadius: circle ? '50%' : undefined }}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <span className="spin" />
        ) : value ? (
          <img src={value} alt={label} />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>📷</div>
            Tap to upload
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handle} />
    </div>
  );
}

// ── Tier card ────────────────────────────────────────────────────────────────────

function TierCard({
  tier, selected, onSelect, onDetails,
}: { tier: Tier; selected: boolean; onSelect: () => void; onDetails: () => void }) {
  const rates = useCommissionRates();
  const meta = planDetails(rates)[tier];
  const line = `${rates[tier].platformPercent}% commission per order`;
  return (
    <div className={`tier-card${selected ? ' selected' : ''}`} onClick={onSelect}>
      <div className="tier-card-head">
        <div className="tier-card-left">
          <span className="tier-card-title">{meta.title}</span>
          {tier === 'TIER_2' && <span className="badge badge-warning">RECOMMENDED</span>}
        </div>
        <div className="tier-radio">{selected && <div className="tier-radio-dot" />}</div>
      </div>
      <div className="tier-card-line">✓ {line}</div>
      <button type="button" className="tier-details-link" onClick={e => { e.stopPropagation(); onDetails(); }}>
        Plan details
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────────

export default function VendorCompleteProfilePage() {
  const { user, loading: authLoading, updateUser, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const rates = useCommissionRates();

  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalTier, setModalTier] = useState<Tier | null>(null);
  const initialTier = useRef<Tier>('TIER_2');

  const [logo, setLogo] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Rivers');
  const [openingTime, setOpeningTime] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [tier, setTier] = useState<Tier>('TIER_2');

  const [docType, setDocType] = useState<DocType>('NIN');
  const [docNumber, setDocNumber] = useState('');
  const [docFrontUrl, setDocFrontUrl] = useState('');
  const [docBackUrl, setDocBackUrl] = useState('');
  const [bvn, setBvn] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'vendor')) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || user.role !== 'vendor') return;
    api.get('/vendors/me').then(({ data }) => {
      const v = data.data;
      setLogo(v.logo ?? '');
      setCoverImage(v.coverImage ?? '');
      setDescription(v.description ?? '');
      setAddress(v.address ?? '');
      setCity(v.city ?? '');
      setState(v.state ?? 'Rivers');
      setOpeningTime(v.openingTime ?? '');
      setClosingTime(v.closingTime ?? '');
      setTier(v.commissionTier ?? 'TIER_2');
      initialTier.current = v.commissionTier ?? 'TIER_2';
    }).catch(() => {
      toast('Could not load your vendor profile.', 'error');
    }).finally(() => setInitializing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSave = async () => {
    if (!description.trim()) return toast('Please add a short description of your store.', 'error');
    if (!address.trim() || !city.trim()) return toast('Please enter your store address and city.', 'error');
    if (!openingTime.trim() || !closingTime.trim()) return toast('Please enter your opening and closing times.', 'error');
    if (!docNumber.trim()) return toast(`Please enter your ${DOC_META[docType].numberLabel}.`, 'error');
    if (!docFrontUrl) return toast('Please upload an image of your identity document.', 'error');
    if (DOC_META[docType].backRequired && !docBackUrl) return toast("Please upload the back of your driver's license.", 'error');

    setSaving(true);
    try {
      await api.patch('/vendors/me', {
        description: description.trim(),
        logo: logo || null,
        coverImage: coverImage || null,
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        openingTime: openingTime.trim(),
        closingTime: closingTime.trim(),
      });

      if (tier !== initialTier.current) {
        await api.patch('/vendors/me/tier', { tier });
      }

      await api.post('/vendors/me/document', {
        type: docType,
        number: docNumber.trim(),
        imageUrl: docFrontUrl,
        imageUrlBack: docBackUrl || null,
        bvn: bvn.trim() || null,
        selfieUrl: selfieUrl || null,
      });

      const { data } = await api.get('/auth/activation-status');
      const { approvalStatus } = data.data;
      updateUser({ approvalStatus });
      router.replace(approvalStatus === 'APPROVED' ? '/vendor' : '/account-not-active');
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Could not save your profile. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user || user.role !== 'vendor' || initializing) return null;

  const modal = modalTier ? planDetails(rates)[modalTier] : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface2)' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/">
          <Image src="/images/logo.png" alt="GoBuyMe" width={120} height={40} style={{ objectFit: 'contain', display: 'block' }} />
        </Link>
        <button onClick={() => { logout(); router.replace('/login'); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
          Sign out
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 120px' }}>
        <h1 className="t-page" style={{ marginBottom: 8 }}>Set up your store</h1>
        <p className="muted" style={{ fontSize: 14, marginBottom: 28 }}>
          Complete your profile and choose a commission plan so we can activate your account.
        </p>

        {/* Photos */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Store Photos</h2>
          <div style={{ marginBottom: 16 }}>
            <ImageUploadBox label="Cover Photo" value={coverImage} onChange={setCoverImage} height={160} folder="vendor-onboarding/cover" />
          </div>
          <ImageUploadBox label="Store Logo" value={logo} onChange={setLogo} height={88} circle folder="vendor-onboarding/logo" />
        </div>

        {/* About */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>About Your Store</h2>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Description *</label>
            <textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell customers what makes your store special…" />
          </div>
        </div>

        {/* Address & hours */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Store Address &amp; Hours</h2>
          <div className="form-group"><label className="label">Street Address *</label><input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="12 Wetheral Road" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label className="label">City *</label><input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="Port Harcourt" /></div>
            <div className="form-group"><label className="label">State</label><input className="input" value={state} onChange={e => setState(e.target.value)} placeholder="Rivers" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="label">Opens at *</label><input className="input" value={openingTime} onChange={e => setOpeningTime(e.target.value)} placeholder="08:00" /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="label">Closes at *</label><input className="input" value={closingTime} onChange={e => setClosingTime(e.target.value)} placeholder="22:00" /></div>
          </div>
        </div>

        {/* Commission plan */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Commission Plan *</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>You can switch plans later from your profile (14-day cooldown applies).</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TierCard tier="TIER_2" selected={tier === 'TIER_2'} onSelect={() => setTier('TIER_2')} onDetails={() => setModalTier('TIER_2')} />
            <TierCard tier="TIER_1" selected={tier === 'TIER_1'} onSelect={() => setTier('TIER_1')} onDetails={() => setModalTier('TIER_1')} />
          </div>
        </div>

        {/* Identity verification */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Identity Verification *</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Select a government-issued ID to verify your identity. This is required for account activation.
          </p>

          <div className="doc-type-row" style={{ marginBottom: 16 }}>
            {(Object.keys(DOC_META) as DocType[]).map(dt => (
              <button
                key={dt}
                type="button"
                className={`doc-type-chip${docType === dt ? ' active' : ''}`}
                onClick={() => { setDocType(dt); setDocNumber(''); setDocFrontUrl(''); setDocBackUrl(''); }}
              >
                {DOC_META[dt].label}
              </button>
            ))}
          </div>

          <div className="form-group">
            <label className="label">{DOC_META[docType].numberLabel} *</label>
            <input className="input" value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder={DOC_META[docType].placeholder} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: DOC_META[docType].backRequired ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
            <ImageUploadBox label={`${DOC_META[docType].backRequired ? 'Front of Document' : 'Document Image'} *`} value={docFrontUrl} onChange={setDocFrontUrl} height={110} folder="vendor-onboarding/id" />
            {DOC_META[docType].backRequired && (
              <ImageUploadBox label="Back of Document *" value={docBackUrl} onChange={setDocBackUrl} height={110} folder="vendor-onboarding/id" />
            )}
          </div>

          <div className="form-group">
            <label className="label">BVN (Bank Verification Number) — Optional</label>
            <input className="input" value={bvn} onChange={e => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="11-digit BVN" />
          </div>

          <ImageUploadBox label="Selfie / Liveness Photo — Optional" value={selfieUrl} onChange={setSelfieUrl} height={110} folder="vendor-onboarding/id" />

          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
            🔒 Your document is encrypted and used only for identity verification. It will never be shared with third parties.
          </p>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--line)', padding: '16px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <button className="btn btn-primary btn-block btn-lg" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spin" />Saving…</> : 'Save & Continue'}
          </button>
        </div>
      </div>

      {/* Plan details modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModalTier(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>{modal.title}</h3><button onClick={() => setModalTier(null)}>✕</button></div>
            <div className="modal-body">
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Best for: {modal.bestFor}</p>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>What&apos;s included</p>
              {modal.features.map(f => (
                <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <span style={{ color: 'var(--brand)' }}>✓</span>{f}
                </div>
              ))}
              <div style={{ marginTop: 16, padding: 12, background: 'var(--surface2)', borderRadius: 4 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 4 }}>EXAMPLE</p>
                <p style={{ fontSize: 13 }}>{modal.example}</p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setModalTier(null)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
