'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface Item { id: string; name: string; description?: string; price: number; imageUrl?: string; isAvailable: boolean; categoryTag?: string; }

export default function VendorMenuPage() {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', categoryTag: '', imageUrl: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/vendors/me/menu').then(r => setItems(r.data.data ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openModal = (item?: Item) => {
    if (item) { setEditing(item); setForm({ name: item.name, description: item.description ?? '', price: String(item.price), categoryTag: item.categoryTag ?? '', imageUrl: item.imageUrl ?? '' }); }
    else { setEditing(null); setForm({ name: '', description: '', price: '', categoryTag: '', imageUrl: '' }); }
    setModal(true);
  };

  const save = async () => {
    if (!form.name || !form.price) { toast('Name and price required', 'error'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description, price: Number(form.price), categoryTag: form.categoryTag, imageUrl: form.imageUrl || undefined };
      if (editing) {
        const { data } = await api.patch(`/vendors/me/menu/${editing.id}`, payload);
        setItems(prev => prev.map(i => i.id === editing.id ? data.data : i));
        toast('Item updated', 'success');
      } else {
        const { data } = await api.post('/vendors/me/menu', payload);
        setItems(prev => [...prev, data.data]);
        toast('Item added', 'success');
      }
      setModal(false);
    } catch { toast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/vendors/me/menu/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      toast('Item deleted', 'info');
    } catch { toast('Delete failed', 'error'); }
  };

  const toggleAvail = async (item: Item) => {
    try {
      const { data } = await api.patch(`/vendors/me/menu/${item.id}`, { isAvailable: !item.isAvailable });
      setItems(prev => prev.map(i => i.id === item.id ? data.data : i));
    } catch { toast('Update failed', 'error'); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 24 }}>
        <h1 className="t-page">Menu</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>+ Add Item</button>
      </div>

      {loading ? (
        <div className="menu-grid">{[...Array(8)].map((_, i) => <div key={i} className="sk" style={{ height: 200 }} />)}</div>
      ) : items.length === 0 ? (
        <div className="empty"><div className="emoji">🍽️</div><h3>No menu items</h3><p>Add your first item to get started.</p><button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => openModal()}>+ Add Item</button></div>
      ) : (
        <div className="menu-grid">
          {items.map(item => (
            <div key={item.id} className="menu-card" style={{ opacity: item.isAvailable ? 1 : .6 }}>
              {item.imageUrl ? <img className="img" src={item.imageUrl} alt={item.name} /> : <div className="img-ph">🍽️</div>}
              <div className="info">
                <div className="name">{item.name}</div>
                <div className="price">₦{item.price.toLocaleString()}</div>
                <div className="between" style={{ marginTop: 10 }}>
                  <label className="switch" style={{ transform: 'scale(.85)' }}>
                    <input type="checkbox" checked={item.isAvailable} onChange={() => toggleAvail(item)} />
                    <span className="track" />
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openModal(item)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(item.id)}>Del</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>{editing ? 'Edit Item' : 'Add Menu Item'}</h3><button onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group"><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Price (₦) *</label><input className="input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Category Tag</label><input className="input" value={form.categoryTag} onChange={e => setForm(f => ({ ...f, categoryTag: e.target.value }))} placeholder="e.g. Starters, Mains, Drinks" /></div>
              <div className="form-group"><label className="label">Description</label><textarea className="textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Image URL</label><input className="input" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." /></div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <><span className="spin" />Saving…</> : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
