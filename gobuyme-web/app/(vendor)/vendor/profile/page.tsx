'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface VendorProfile { businessName: string; bio?: string; address: string; city: string; phone: string; category: string; coverImageUrl?: string; logoUrl?: string; commissionTier: string; }

const CATEGORIES = ['RESTAURANT', 'GROCERY', 'PHARMACY', 'ELECTRONICS', 'FASHION', 'BAKERY', 'BEVERAGES'];

export default function VendorProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/vendors/me').then(r => setProfile(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await api.patch('/vendors/me', { businessName: profile.businessName, bio: profile.bio, address: profile.address, city: profile.city, phone: profile.phone });
      toast('Profile updated', 'success');
    } catch { toast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const set = (key: keyof VendorProfile, val: string) => setProfile(p => p ? { ...p, [key]: val } : p);

  if (loading) return <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 60 }} />)}</div>;
  if (!profile) return <div className="empty"><div className="emoji">🏪</div><h3>No profile data</h3></div>;

  return (
    <div>
      <div className="between" style={{ marginBottom: 28 }}>
        <h1 className="t-page">Store Profile</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <><span className="spin" />Saving…</> : 'Save Changes'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Business Info</h3>
          <div className="form-group"><label className="label">Business Name</label><input className="input" value={profile.businessName} onChange={e => set('businessName', e.target.value)} /></div>
          <div className="form-group"><label className="label">Bio</label><textarea className="textarea" value={profile.bio ?? ''} onChange={e => set('bio', e.target.value)} /></div>
          <div className="form-group"><label className="label">Category</label>
            <select className="select" value={profile.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Location & Contact</h3>
          <div className="form-group"><label className="label">Address</label><input className="input" value={profile.address} onChange={e => set('address', e.target.value)} /></div>
          <div className="form-group"><label className="label">City</label><input className="input" value={profile.city} onChange={e => set('city', e.target.value)} /></div>
          <div className="form-group"><label className="label">Phone</label><input className="input" value={profile.phone} onChange={e => set('phone', e.target.value)} /></div>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Commission Tier</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Current tier: <strong>{profile.commissionTier}</strong></p>
          {profile.commissionTier === 'TIER_1' && (
            <div style={{ background: 'var(--brand-tint)', borderRadius: 'var(--r)', padding: 14, fontSize: 13 }}>
              <strong>Tier 1</strong> — 3% commission, no promotions
              <br />Upgrade to <strong>Tier 2</strong> (7.5%) to unlock promotional cards.
            </div>
          )}
          {profile.commissionTier === 'TIER_2' && (
            <div style={{ background: '#E8F8F1', borderRadius: 'var(--r)', padding: 14, fontSize: 13 }}>
              <strong>Tier 2</strong> — 7.5% commission, promotions unlocked ✓
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Cover Image</h3>
          {profile.coverImageUrl && <img src={profile.coverImageUrl} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 12 }} />}
          <div className="form-group"><label className="label">Cover Image URL</label><input className="input" value={profile.coverImageUrl ?? ''} onChange={e => set('coverImageUrl', e.target.value)} placeholder="https://..." /></div>
        </div>
      </div>
    </div>
  );
}
