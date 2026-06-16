'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface Promo { id: string; title: string; description?: string; imageUrl?: string; isActive: boolean; expiresAt?: string; }

export default function VendorPromotionsPage() {
  const toast = useToast();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', imageUrl: '', expiresAt: '' });
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
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ New Promotion</button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 200 }} />)}
        </div>
      ) : promos.length === 0 ? (
        <div className="empty"><div className="emoji">🎁</div><h3>No promotions</h3><p>Create your first promotion to attract more customers.</p><button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setModal(true)}>+ New Promotion</button></div>
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
              <div className="form-group"><label className="label">Title *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Description</label><textarea className="textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Image URL</label><input className="input" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." /></div>
              <div className="form-group"><label className="label">Expires At</label><input className="input" type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={create} disabled={saving}>{saving ? <><span className="spin" />Creating…</> : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
