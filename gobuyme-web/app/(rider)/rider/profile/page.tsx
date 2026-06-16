'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface RiderProfile {
  name: string; phone: string; vehicleType: string; vehiclePlate: string;
  isOnline: boolean; totalDeliveries: number;
  guarantorName: string; guarantorPhone: string; guarantorAddress: string;
}

const VEHICLE_LABELS: Record<string, string> = {
  MOTORCYCLE: 'Motorcycle', BICYCLE: 'Bicycle', CAR: 'Car', TRUCK: 'Truck',
};

export default function RiderProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [form, setForm] = useState<RiderProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    api.get('/riders/me').then(r => {
      const d = r.data.data;
      const p: RiderProfile = {
        name:             d.user?.name ?? '',
        phone:            d.user?.phone ?? '',
        vehicleType:      d.vehicleType ?? '',
        vehiclePlate:     d.vehiclePlate ?? '',
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
      await api.patch('/riders/me', { vehicleType: form.vehicleType, vehiclePlate: form.vehiclePlate });
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Header */}
        <div className="card card-pad" style={{ gridColumn: '1 / -1', display: 'flex', gap: 20, alignItems: 'center' }}>
          <div className="avatar" style={{ width: 72, height: 72, fontSize: 26, background: '#EAF2FF', color: 'var(--rider)', flexShrink: 0 }}>
            {user?.avatar ? <img src={user.avatar} alt="" /> : initials(src?.name ?? 'R')}
          </div>
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
                <input className="input" value={form?.vehiclePlate ?? ''} onChange={e => set('vehiclePlate', e.target.value)} placeholder="ABC-123-XY" />
              </div>
            </>
          ) : (
            <>
              <InfoRow label="Vehicle Type" value={VEHICLE_LABELS[src?.vehicleType ?? ''] ?? src?.vehicleType ?? '—'} />
              <InfoRow label="Plate Number" value={src?.vehiclePlate || '—'} />
            </>
          )}
        </div>

        {/* Guarantor Info */}
        <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Guarantor</h3>
          {src?.guarantorName || src?.guarantorPhone || src?.guarantorAddress ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <InfoRow label="Guarantor Name" value={src.guarantorName || '—'} />
              <InfoRow label="Guarantor Phone" value={src.guarantorPhone || '—'} />
              <InfoRow label="Guarantor Address" value={src.guarantorAddress || '—'} />
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              No guarantor on file. Submit your KYC documents to add one.
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
