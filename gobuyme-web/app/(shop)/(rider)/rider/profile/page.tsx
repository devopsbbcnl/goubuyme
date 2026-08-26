'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';
import api from '@/services/api';
import DeleteAccountModal from '@/components/ui/DeleteAccountModal';
import ImageCropModal from '@/components/ui/ImageCropModal';
import { uploadToCloudinary } from '@/services/cloudinary';

interface RiderProfile {
  name: string; phone: string; vehicleType: string; plateNumber: string;
  isOnline: boolean; totalDeliveries: number;
  guarantorName: string; guarantorPhone: string; guarantorAddress: string;
}

const VEHICLE_LABELS: Record<string, string> = {
  MOTORCYCLE: 'Motorcycle', BICYCLE: 'Bicycle', CAR: 'Car', TRUCK: 'Truck',
};

function AvatarUpload({ avatar, initials, onUploaded }: { avatar?: string; initials: string; onUploaded: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const toast = useToast();

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setCropFile(file);
  };

  const uploadCropped = async (file: File) => {
    setCropFile(null);
    setBusy(true);
    try {
      const url = await uploadToCloudinary(file, 'rider-avatars');
      onUploaded(url);
      toast('Photo updated', 'success');
    } catch (err: any) { toast(err?.message || 'Upload failed', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={busy}
      style={{ position: 'relative', flexShrink: 0, border: 'none', background: 'none', padding: 0, cursor: busy ? 'default' : 'pointer' }}
      aria-label="Change profile photo"
    >
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handle} />
      <ImageCropModal file={cropFile} aspect={1} onCancel={() => setCropFile(null)} onConfirm={uploadCropped} />

      <div className="avatar" style={{ width: 72, height: 72, fontSize: 26, background: '#EAF2FF', color: 'var(--rider)' }}>
        {avatar ? <Image src={avatar} alt="" width={72} height={72} style={{ objectFit: 'cover' }} /> : initials}
      </div>
      <div style={{
        position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%',
        background: busy ? 'var(--muted)' : 'var(--brand)', border: '2px solid var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
      }}>
        {busy ? <span className="spin" style={{ width: 11, height: 11, borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /> : '📷'}
      </div>
    </button>
  );
}

export default function RiderProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [form, setForm] = useState<RiderProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    api.get('/riders/me').then(r => {
      const d = r.data.data;
      const p: RiderProfile = {
        name:             d.user?.name ?? '',
        phone:            d.user?.phone ?? '',
        vehicleType:      d.vehicleType ?? '',
        plateNumber:      d.plateNumber ?? '',
        isOnline:         d.isOnline ?? false,
        totalDeliveries:  d.totalDeliveries ?? 0,
        guarantorName:    d.document?.guarantorName ?? '',
        guarantorPhone:   d.document?.guarantorPhone ?? '',
        guarantorAddress: d.document?.guarantorAddress ?? '',
      };
      setProfile(p);
      setForm(p);
    }).catch(() => {}).finally(() => setLoading(false));
    setIsDark(document.documentElement.getAttribute('data-mode') === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-mode', next ? 'dark' : 'light');
    localStorage.setItem('gbm_theme', next ? 'dark' : 'light');
  };

  const set = (key: keyof RiderProfile, val: string) =>
    setForm(p => p ? { ...p, [key]: val } : p);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.patch('/auth/profile', { name: form.name, phone: form.phone });
      await api.patch('/riders/me', { vehicleType: form.vehicleType, plateNumber: form.plateNumber });
      updateUser({ name: form.name, phone: form.phone });
      setProfile(form);
      setEditing(false);
      toast('Profile updated', 'success');
    } catch { toast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const cancel = () => { setForm(profile); setEditing(false); };

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const uploadAvatar = async (url: string) => {
    try {
      await api.patch('/auth/profile', { photoUrl: url });
      updateUser({ avatar: url });
    } catch { toast('Could not save photo', 'error'); }
  };

  if (loading) return (
    <div style={{ display: 'grid', gap: 16 }}>
      {[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 140 }} />)}
    </div>
  );

  const src = profile ?? form;

  return (
    <div>
      <div className="between" style={{ marginBottom: 28 }}>
        <h1 className="t-page">Profile</h1>
        {!editing && (
          <button className="btn btn-ghost" style={{ height: 40 }} onClick={() => setEditing(true)}>
            ✏️ Edit Profile
          </button>
        )}
      </div>

      <div className="two-col-grid" style={{ gap: 20 }}>

        {/* Header */}
        <div className="card card-pad" style={{ gridColumn: '1 / -1', display: 'flex', gap: 20, alignItems: 'center' }}>
          <AvatarUpload avatar={user?.avatar} initials={initials(src?.name ?? 'R')} onUploaded={uploadAvatar} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{src?.name}</div>
            <div className="muted">{user?.email}</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              {src?.totalDeliveries ?? 0} deliveries · {src?.isOnline ? '🟢 Online' : '🔴 Offline'}
            </div>
          </div>
        </div>

        {/* Personal Info */}
        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Personal Info</h3>
          {editing ? (
            <>
              <div className="form-group">
                <label className="label">Full Name</label>
                <input className="input" value={form?.name ?? ''} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="label">Phone</label>
                <input className="input" value={form?.phone ?? ''} onChange={e => set('phone', e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <InfoRow label="Full Name" value={src?.name} />
              <InfoRow label="Phone" value={src?.phone} />
            </>
          )}
        </div>

        {/* Vehicle Info */}
        <div className="card card-pad">
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Vehicle Info</h3>
          {editing ? (
            <>
              <div className="form-group">
                <label className="label">Vehicle Type</label>
                <select className="select" value={form?.vehicleType ?? ''} onChange={e => set('vehicleType', e.target.value)}>
                  <option value="">Select type</option>
                  <option value="MOTORCYCLE">Motorcycle</option>
                  <option value="BICYCLE">Bicycle</option>
                  <option value="CAR">Car</option>
                  <option value="TRUCK">Truck</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Plate Number</label>
                <input className="input" value={form?.plateNumber ?? ''} onChange={e => set('plateNumber', e.target.value)} placeholder="ABC-123-XY" />
              </div>
            </>
          ) : (
            <>
              <InfoRow label="Vehicle Type" value={VEHICLE_LABELS[src?.vehicleType ?? ''] ?? src?.vehicleType ?? '—'} />
              <InfoRow label="Plate Number" value={src?.plateNumber || '—'} />
            </>
          )}
        </div>

        {/* Guarantor Info */}
        <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Guarantor</h3>
          {src?.guarantorName || src?.guarantorPhone || src?.guarantorAddress ? (
            <div className="three-col-grid">
              <InfoRow label="Guarantor Name" value={src.guarantorName || '—'} />
              <InfoRow label="Guarantor Phone" value={src.guarantorPhone || '—'} />
              <InfoRow label="Guarantor Address" value={src.guarantorAddress || '—'} />
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              No guarantor on file. <a href="/rider/documents" style={{ color: 'var(--brand)', fontWeight: 600 }}>Submit your KYC documents</a> to add one.
            </p>
          )}
        </div>

        {/* Appearance + sign out */}
        <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Appearance</h3>
          <div className="between">
            <span style={{ fontWeight: 600 }}>Dark Mode</span>
            <label className="switch"><input type="checkbox" checked={isDark} onChange={toggleTheme} /><span className="track" /></label>
          </div>
          <div className="divider" />
          <button className="btn btn-danger btn-block" style={{ marginTop: 12 }} onClick={logout}>Sign Out</button>
        </div>

        {/* Danger zone */}
        <div className="card card-pad" style={{ gridColumn: '1 / -1', borderColor: 'rgba(226,59,59,.25)' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--error)' }}>Danger Zone</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Deleting your account deactivates your rider profile and revokes access immediately.
          </p>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => setShowDeleteModal(true)}>
            Delete My Account
          </button>
        </div>

        {/* Edit actions */}
        {editing && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12 }}>
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={save} disabled={saving}>
              {saving ? <><span className="spin" />Saving…</> : 'Save Changes'}
            </button>
            <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={cancel} disabled={saving}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <DeleteAccountModal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{value || '—'}</div>
    </div>
  );
}
