'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface Address {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

const EMPTY_FORM = { label: '', address: '', city: '', state: '' };

const PinIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);

export default function AddressesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [latLng, setLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeErr, setGeocodeErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) fetchAddresses();
  }, [user]);

  const fetchAddresses = async () => {
    setPageLoading(true);
    try {
      const { data } = await api.get('/addresses');
      setAddresses(data.data ?? []);
    } catch { toast('Failed to load addresses', 'error'); }
    finally { setPageLoading(false); }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setLatLng(null);
    setGeocodeErr('');
    setShowModal(true);
  };

  const openEdit = (addr: Address) => {
    setEditing(addr);
    setForm({ label: addr.label, address: addr.address, city: addr.city ?? '', state: addr.state ?? '' });
    setLatLng(addr.latitude != null && addr.longitude != null ? { lat: addr.latitude, lng: addr.longitude } : null);
    setGeocodeErr('');
    setShowModal(true);
  };

  const triggerGeocode = (f: typeof form) => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    setLatLng(null);
    setGeocodeErr('');
    if (f.address.trim().length < 5 || !f.city.trim() || !f.state.trim()) return;
    setGeocoding(true);
    geocodeTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/geocode', {
          params: { address: f.address.trim(), city: f.city.trim(), state: f.state.trim() },
        });
        setLatLng({ lat: data.data.lat, lng: data.data.lng });
      } catch {
        setGeocodeErr('Could not confirm this location — check the address and try again.');
      } finally { setGeocoding(false); }
    }, 600);
  };

  const setField = (key: keyof typeof form, val: string) => {
    const next = { ...form, [key]: val };
    setForm(next);
    if (key === 'address' || key === 'city' || key === 'state') triggerGeocode(next);
  };

  const handleSave = async () => {
    if (!form.label.trim() || !form.address.trim() || !form.city.trim() || !form.state.trim()) {
      toast('Please fill in all fields', 'error'); return;
    }
    if (!latLng) {
      toast('Location not confirmed — check the address', 'error'); return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(), address: form.address.trim(),
        city: form.city.trim(), state: form.state.trim(),
        latitude: latLng.lat, longitude: latLng.lng,
      };
      if (editing) {
        await api.put(`/addresses/${editing.id}`, payload);
        toast('Address updated', 'success');
      } else {
        await api.post('/addresses', payload);
        toast('Address added', 'success');
      }
      setShowModal(false);
      fetchAddresses();
    } catch { toast('Could not save address', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this address?')) return;
    setDeleting(id);
    try {
      await api.delete(`/addresses/${id}`);
      setAddresses(prev => prev.filter(a => a.id !== id));
      toast('Address removed', 'success');
    } catch { toast('Could not remove address', 'error'); }
    finally { setDeleting(null); }
  };

  const handleSetDefault = async (addr: Address) => {
    try {
      await api.put(`/addresses/${addr.id}`, { isDefault: true });
      setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === addr.id })));
    } catch { toast('Could not update default address', 'error'); }
  };

  if (authLoading || !user) return null;

  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 680, paddingTop: 40, paddingBottom: 80 }}>

        {/* Header */}
        <div className="between" style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/profile"
              style={{
                width: 36, height: 36, borderRadius: 'var(--r)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface2)', color: 'var(--text2)',
                transition: 'background .15s',
              }}
            >
              <BackIcon />
            </Link>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>Saved Addresses</h1>
              {!pageLoading && addresses.length > 0 && (
                <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {addresses.length} address{addresses.length !== 1 ? 'es' : ''} saved
                </p>
              )}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusIcon /> Add
          </button>
        </div>

        {/* Loading skeleton */}
        {pageLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2].map(i => (
              <div key={i} className="card" style={{ padding: 20, display: 'flex', gap: 14 }}>
                <div className="sk" style={{ width: 40, height: 40, borderRadius: 'var(--r)', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="sk" style={{ height: 14, width: '40%', borderRadius: 4 }} />
                  <div className="sk" style={{ height: 12, width: '70%', borderRadius: 4 }} />
                  <div className="sk" style={{ height: 12, width: '30%', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!pageLoading && addresses.length === 0 && (
          <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--brand-tint)', color: 'var(--brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <PinIcon size={28} />
            </div>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No saved addresses</p>
            <p className="muted" style={{ fontSize: 13, maxWidth: 280, margin: '0 auto 24px', lineHeight: 1.6 }}>
              Add your home, work, or other frequent locations for faster checkout.
            </p>
            <button className="btn btn-primary" onClick={openAdd}>Add your first address</button>
          </div>
        )}

        {/* Address list */}
        {!pageLoading && addresses.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {addresses.map(addr => (
              <div
                key={addr.id}
                className="card"
                style={{
                  padding: '18px 20px',
                  borderColor: addr.isDefault ? 'var(--brand)' : undefined,
                  borderWidth: addr.isDefault ? 1.5 : undefined,
                  transition: 'border-color .15s',
                }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {/* Icon */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--r)',
                    background: addr.isDefault ? 'var(--brand)' : 'var(--surface2)',
                    color: addr.isDefault ? '#fff' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'background .15s, color .15s',
                  }}>
                    <PinIcon size={17} />
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{addr.label}</span>
                      {addr.isDefault && (
                        <span className="badge badge-success" style={{ fontSize: 10, padding: '2px 8px' }}>Default</span>
                      )}
                      {addr.latitude == null && (
                        <span className="badge badge-warning" style={{ fontSize: 10, padding: '2px 8px' }}>No location</span>
                      )}
                    </div>
                    <p className="muted" style={{ fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {addr.address}
                    </p>
                    <p className="muted" style={{ fontSize: 12 }}>
                      {[addr.city, addr.state].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                  {!addr.isDefault && (
                    <>
                      <button
                        onClick={() => handleSetDefault(addr)}
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)', padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', transition: 'opacity .15s' }}
                        onMouseOver={e => (e.currentTarget.style.opacity = '.7')}
                        onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                      >
                        Set as default
                      </button>
                      <span style={{ width: 1, height: 14, background: 'var(--line)', margin: '0 14px' }} />
                    </>
                  )}
                  <button
                    onClick={() => openEdit(addr)}
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', transition: 'color .15s' }}
                    onMouseOver={e => (e.currentTarget.style.color = 'var(--text)')}
                    onMouseOut={e => (e.currentTarget.style.color = 'var(--text2)')}
                  >
                    Edit
                  </button>
                  <span style={{ width: 1, height: 14, background: 'var(--line)', margin: '0 14px' }} />
                  <button
                    onClick={() => handleDelete(addr.id)}
                    disabled={deleting === addr.id}
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)', padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', opacity: deleting === addr.id ? .5 : 1, transition: 'opacity .15s' }}
                  >
                    {deleting === addr.id ? 'Removing…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}

            {/* Add another */}
            <button
              onClick={openAdd}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '14px 20px',
                borderRadius: 'var(--r)', border: '1.5px dashed var(--line)',
                background: 'transparent', color: 'var(--brand)',
                fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', transition: 'border-color .15s, background .15s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = 'var(--brand-tint)'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <PlusIcon /> Add New Address
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal">
            <div className="modal-head">
              <h3>{editing ? 'Edit Address' : 'New Address'}</h3>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  width: 32, height: 32, borderRadius: 'var(--r)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted)', background: 'var(--surface2)',
                  border: 'none', cursor: 'pointer', transition: 'background .15s',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--surface3)')}
                onMouseOut={e => (e.currentTarget.style.background = 'var(--surface2)')}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="modal-body">
              {/* Label */}
              <div className="form-group">
                <label className="label">Label</label>
                <input
                  className="input"
                  placeholder="e.g. Home, Office, Mum's house"
                  value={form.label}
                  onChange={e => setField('label', e.target.value)}
                />
              </div>

              {/* Street address */}
              <div className="form-group">
                <label className="label">Street Address</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    placeholder="e.g. 12 Aba Road, Trans Amadi"
                    value={form.address}
                    onChange={e => setField('address', e.target.value)}
                    style={{
                      paddingRight: 44,
                      borderColor: latLng ? 'var(--brand)' : geocodeErr ? 'var(--error)' : undefined,
                    }}
                  />
                  <span style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {geocoding && (
                      <span style={{
                        width: 14, height: 14, border: '2px solid var(--line)',
                        borderTopColor: 'var(--brand)', borderRadius: '50%',
                        display: 'inline-block', animation: 'spin .6s linear infinite',
                      }} />
                    )}
                    {!geocoding && latLng && (
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'var(--brand)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <CheckIcon />
                      </span>
                    )}
                  </span>
                </div>
                {geocodeErr && <p className="input-error">{geocodeErr}</p>}
                {latLng && !geocodeErr && (
                  <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 5, fontWeight: 600 }}>
                    Location confirmed
                  </p>
                )}
              </div>

              {/* City + State */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">City</label>
                  <input
                    className="input"
                    placeholder="Port Harcourt"
                    value={form.city}
                    onChange={e => setField('city', e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">State</label>
                  <input
                    className="input"
                    placeholder="Rivers"
                    value={form.state}
                    onChange={e => setField('state', e.target.value)}
                  />
                </div>
              </div>

              <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
                Location is confirmed automatically once address, city, and state are filled in. Coordinates are required for delivery fee calculation.
              </p>
            </div>

            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || geocoding}
              >
                {saving ? <><span className="spin" style={{ borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} />Saving…</> : editing ? 'Save Changes' : 'Add Address'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
