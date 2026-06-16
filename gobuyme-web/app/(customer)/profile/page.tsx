'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

export default function ProfilePage() {
  const { user, loading: authLoading, logout, updateUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) setForm({ name: user.name ?? '', phone: user.phone ?? '' });
    setIsDark(document.documentElement.getAttribute('data-mode') === 'dark');
  }, [user]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-mode', next ? 'dark' : 'light');
    localStorage.setItem('gbm_theme', next ? 'dark' : 'light');
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/profile', { name: form.name, phone: form.phone });
      updateUser({ name: data.data?.name, phone: data.data?.phone });
      toast('Profile updated!', 'success');
    } catch { toast('Failed to update', 'error'); }
    finally { setSaving(false); }
  };

  if (authLoading || !user) return null;

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 720 }}>
        <h1 className="t-page" style={{ marginBottom: 32 }}>My Profile</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Profile card */}
          <div className="card card-pad" style={{ gridColumn: '1 / -1', display: 'flex', gap: 24, alignItems: 'center' }}>
            <div className="avatar" style={{ width: 72, height: 72, fontSize: 26 }}>
              {user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name ?? 'U')}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{user.name}</div>
              <div className="muted">{user.email}</div>
              <div className="muted">{user.phone}</div>
            </div>
          </div>

          {/* Edit */}
          <div className="card card-pad">
            <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Edit Profile</h3>
            <div className="form-group">
              <label className="label">Full Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><span className="spin" />Saving…</> : 'Save Changes'}
            </button>
          </div>

          {/* Settings */}
          <div className="card card-pad">
            <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Settings</h3>
            <div className="between" style={{ marginBottom: 16 }}>
              <span style={{ fontWeight: 600 }}>Dark Mode</span>
              <label className="switch"><input type="checkbox" checked={isDark} onChange={toggleTheme} /><span className="track" /></label>
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
              <Link href="/orders" className="v-nav-item">📦 My Orders</Link>
              <Link href="/profile/addresses" className="v-nav-item">📍 Saved Addresses</Link>
              <Link href="/forgot-password" className="v-nav-item">🔒 Change Password</Link>
            </div>
            <div className="divider" />
            <button className="btn btn-danger btn-block" style={{ marginTop: 12 }} onClick={logout}>Sign Out</button>
          </div>

        </div>
      </div>
    </div>
  );
}
