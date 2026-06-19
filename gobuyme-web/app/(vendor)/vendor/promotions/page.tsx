'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { uploadToCloudinary } from '@/services/cloudinary';

interface Promo { id: string; title: string; description?: string; imageUrl?: string; isActive: boolean; expiresAt?: string; }

export default function VendorPromotionsPage() {
  const toast = useToast();
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', imageUrl: '', expiresAt: '' });
  const [imgBusy, setImgBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tier, setTier] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/vendors/me/promotions'),
      api.get('/vendors/me'),
    ]).then(([pRes, vRes]) => {
      setPromos(pRes.data.data ?? []);
      setTier(vRes.data.data?.commissionTier ?? null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImgBusy(true);
    try {
      const url = await uploadToCloudinary(file, 'vendor-promotions');
      setForm(f => ({ ...f, imageUrl: url }));
      toast('Image uploaded', 'success');
    } catch { toast('Upload failed', 'error'); }
    finally { setImgBusy(false); }
  };

  const create = async () => {
    if (!form.title) { toast('Title required', 'error'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/vendors/me/promotions', form);
      setPromos(prev => [...prev, data.data]);
      setModal(false);
      toast('Promotion created', 'success');
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Create failed', 'error');
    } finally { setSaving(false); }
  };

  const toggle = async (id: string) => {
    try {
      await api.patch(`/vendors/me/promotions/${id}/toggle`);
      setPromos(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
    } catch { toast('Update failed', 'error'); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this promotion?')) return;
    try {
      await api.delete(`/vendors/me/promotions/${id}`);
      setPromos(prev => prev.filter(p => p.id !== id));
      toast('Deleted', 'info');
    } catch { toast('Delete failed', 'error'); }
  };

  if (tier === 'TIER_1') return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 28 }}>Promotions</h1>
      <div className="card card-pad" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Promotions are a Tier 2 Feature</h3>
        <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>Upgrade to Tier 2 to unlock promotional cards and reach more customers.</p>
        <a href="/vendor/settings" className="btn btn-primary">Upgrade to Tier 2 →</a>
      </div>
    </div>
  );

  return (
    <div>
      <div className="between" style={{ marginBottom: 24 }}>
        <h1 className="t-page">Promotions</h1>
        <button className="btn btn-primary" onClick={() => { setForm({ title: '', description: '', imageUrl: '', expiresAt: '' }); setModal(true); }}>+ New Promotion</button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 200 }} />)}
        </div>
      ) : promos.length === 0 ? (
        <div className="empty"><div className="emoji">🎁</div><h3>No promotions</h3><p>Create your first promotion to attract more customers.</p><button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => { setForm({ title: '', description: '', imageUrl: '', expiresAt: '' }); setModal(true); }}>+ New Promotion</button></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {promos.map(p => (
            <div key={p.id} className="card" style={{ overflow: 'hidden', opacity: p.isActive ? 1 : .6 }}>
              {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: '100%', height: 160, objectFit: 'cover' }} /> : <div style={{ width: '100%', height: 160, background: 'linear-gradient(135deg, var(--brand-tint), var(--surface2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🎁</div>}
              <div style={{ padding: 16 }}>
                <div className="between" style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 700 }}>{p.title}</span>
                  <label className="switch" style={{ transform: 'scale(.85)' }}><input type="checkbox" checked={p.isActive} onChange={() => toggle(p.id)} /><span className="track" /></label>
                </div>
                {p.description && <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{p.description}</p>}
                <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>New Promotion</h3><button onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
              <input ref={fileRef}   type="file" accept="image/*"                      style={{ display: 'none' }} onChange={handleImageFile} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImageFile} />

              <div className="form-group"><label className="label">Title *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Description</label><textarea className="textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>

              {/* Image upload */}
              <div className="form-group">
                <label className="label">Promotion Image <span className="muted" style={{ fontSize: 11 }}>(1080×580 px, 1.86:1)</span></label>
                <div style={{ width: '100%', height: 120, borderRadius: 4, border: '1.5px dashed var(--line)', background: 'var(--surface2)', overflow: 'hidden', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {imgBusy ? (
                    <span className="spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--brand)', width: 24, height: 24 }} />
                  ) : form.imageUrl ? (
                    <>
                      <img src={form.imageUrl} alt="promo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={() => setForm(f => ({ ...f, imageUrl: '' }))} style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>🖼️</div>
                      <div style={{ fontSize: 11 }}>No image</div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={imgBusy} onClick={() => fileRef.current?.click()}>📁 Choose File</button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={imgBusy} onClick={() => cameraRef.current?.click()}>📷 Camera</button>
                </div>
              </div>

              <div className="form-group"><label className="label">Expires At</label><input className="input" type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={create} disabled={saving || imgBusy}>{saving ? <><span className="spin" />Creating…</> : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
