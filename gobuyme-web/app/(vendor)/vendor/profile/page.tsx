'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { uploadToCloudinary } from '@/services/cloudinary';

interface VendorProfile {
  businessName: string;
  description?: string;
  address: string;
  city: string;
  state?: string;
  phone?: string;
  category: string;
  coverImage?: string;
  logo?: string;
  commissionTier: string;
  openingTime?: string;
  closingTime?: string;
}

const CATEGORIES = ['RESTAURANT', 'EMART', 'PHARMACY'];

function ImgUpload({
  label, value, folder, onUploaded,
}: {
  label: string; value?: string; folder: string; onUploaded: (url: string) => void;
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
      onUploaded(url);
      toast('Image uploaded', 'success');
    } catch { toast('Upload failed', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="form-group">
      <label className="label">{label}</label>
      <input ref={fileRef}   type="file" accept="image/*"                     style={{ display: 'none' }} onChange={handle} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handle} />

      {/* preview */}
      <div style={{ width: '100%', height: 130, borderRadius: 4, border: '1.5px dashed var(--line)', background: 'var(--surface2)', overflow: 'hidden', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {busy ? (
          <span className="spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--brand)', width: 26, height: 26 }} />
        ) : value ? (
          <>
            <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              onClick={() => onUploaded('')}
              style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >✕</button>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>🖼️</div>
            <div style={{ fontSize: 11 }}>No image</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => fileRef.current?.click()}>📁 Choose File</button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => cameraRef.current?.click()}>📷 Camera</button>
      </div>
    </div>
  );
}

export default function VendorProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/vendors/me').then(r => setProfile(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof VendorProfile>(key: K, val: VendorProfile[K]) =>
    setProfile(p => p ? { ...p, [key]: val } : p);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await api.patch('/vendors/me', {
        businessName: profile.businessName,
        description:  profile.description,
        address:      profile.address,
        city:         profile.city,
        state:        profile.state,
        logo:         profile.logo,
        coverImage:   profile.coverImage,
        openingTime:  profile.openingTime,
        closingTime:  profile.closingTime,
      });
      toast('Profile updated', 'success');
    } catch { toast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 60 }} />)}</div>;
  if (!profile) return <div className="empty"><div className="emoji">🏪</div><h3>No profile data</h3></div>;

  return (
    <div>
      <div className="between" style={{ marginBottom: 28 }}>
        <h1 className="t-page">Store Profile</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><span className="spin" />Saving…</> : 'Save Changes'}
        </button>
      </div>

      <div className="two-col-grid">

        {/* Business Info */}
        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Business Info</h3>
          <div className="form-group"><label className="label">Business Name</label><input className="input" value={profile.businessName} onChange={e => set('businessName', e.target.value)} /></div>
          <div className="form-group"><label className="label">Description</label><textarea className="textarea" value={profile.description ?? ''} onChange={e => set('description', e.target.value)} /></div>
          <div className="form-group"><label className="label">Category</label>
            <select className="select" value={profile.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}><label className="label">Opens</label><input className="input" type="time" value={profile.openingTime ?? ''} onChange={e => set('openingTime', e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label className="label">Closes</label><input className="input" type="time" value={profile.closingTime ?? ''} onChange={e => set('closingTime', e.target.value)} /></div>
          </div>
        </div>

        {/* Location & Contact */}
        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Location & Contact</h3>
          <div className="form-group"><label className="label">Address</label><input className="input" value={profile.address ?? ''} onChange={e => set('address', e.target.value)} /></div>
          <div className="form-group"><label className="label">City</label><input className="input" value={profile.city ?? ''} onChange={e => set('city', e.target.value)} /></div>
          <div className="form-group"><label className="label">State</label><input className="input" value={profile.state ?? ''} onChange={e => set('state', e.target.value)} /></div>
        </div>

        {/* Logo */}
        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Store Logo</h3>
          <ImgUpload label="Logo" value={profile.logo} folder="vendor-logos" onUploaded={url => set('logo', url)} />
        </div>

        {/* Cover Image */}
        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Cover Image</h3>
          <ImgUpload label="Cover Photo" value={profile.coverImage} folder="vendor-covers" onUploaded={url => set('coverImage', url)} />
        </div>

        {/* Commission Tier */}
        <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Commission Tier</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Current tier: <strong>{profile.commissionTier}</strong></p>
          {profile.commissionTier === 'TIER_1' && (
            <div style={{ background: 'var(--brand-tint)', borderRadius: 'var(--r)', padding: 14, fontSize: 13 }}>
              <strong>Tier 1</strong> — 3% commission, no promotions. Upgrade to <strong>Tier 2</strong> (7.5%) to unlock promotional cards.
            </div>
          )}
          {profile.commissionTier === 'TIER_2' && (
            <div style={{ background: '#E8F8F1', borderRadius: 'var(--r)', padding: 14, fontSize: 13 }}>
              <strong>Tier 2</strong> — 7.5% commission, promotions unlocked ✓
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
