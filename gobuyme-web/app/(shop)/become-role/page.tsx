'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const CATEGORIES = [
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'EMART', label: 'EMART Mart' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'DRINKS', label: 'Drinks' },
  { value: 'BUTCHER', label: 'Butcher' },
  { value: 'GAS', label: 'Gas' },
];

// An existing account registers a second role (vendor or rider). Same login, same history.
function BecomeRole() {
  const { user, loading: authLoading, addRole } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const role: 'vendor' | 'rider' = params.get('role') === 'rider' ? 'rider' : 'vendor';

  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('RESTAURANT');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Owerri');
  const [state, setState] = useState('Imo');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (role === 'vendor' && businessName.trim().length < 2) next.businessName = 'Enter your business name.';
    if (role === 'rider' && !vehicleType.trim()) next.vehicleType = 'Enter your vehicle type.';
    if (role === 'rider' && !plateNumber.trim()) next.plateNumber = 'Enter your plate number.';
    if (!address.trim()) next.address = 'Enter your address.';
    if (!city.trim()) next.city = 'Enter your city.';
    if (!state.trim()) next.state = 'Enter your state.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        role: role.toUpperCase(),
        address: address.trim(), city: city.trim(), state: state.trim(),
      };
      try {
        const { data } = await api.get('/geocode', {
          params: { address: address.trim(), city: city.trim(), state: state.trim() },
        });
        payload.latitude = data.data.lat;
        payload.longitude = data.data.lng;
      } catch { /* coordinates are optional */ }

      if (role === 'vendor') {
        payload.businessName = businessName.trim();
        payload.category = category;
        payload.commissionTier = 'TIER_1';
      } else {
        payload.vehicleType = vehicleType.trim();
        payload.plateNumber = plateNumber.trim().toUpperCase();
      }

      await addRole(payload);
      // Vendors finish their store profile next; riders go straight to their dashboard.
      router.replace(role === 'vendor' ? '/vendor-complete-profile' : '/rider');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrors({ general: msg ?? 'Could not add this role. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, key: string, value: string, set: (v: string) => void, extra?: { placeholder?: string }) => (
    <div className="form-group">
      <label className="label" htmlFor={`br-${key}`}>{label}</label>
      <input id={`br-${key}`} className="input" value={value} placeholder={extra?.placeholder} onChange={e => set(e.target.value)} />
      {errors[key] && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>{errors[key]}</p>}
    </div>
  );

  if (authLoading || !user) return null;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 20px 60px' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: 16 }}>← Back</button>

      <h1 className="t-page" style={{ marginBottom: 6 }}>
        {role === 'vendor' ? 'Register your business' : 'Become a delivery partner'}
      </h1>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>
        You&apos;ll use the same login ({user.email}). Your orders and account stay as they are, and you can switch back any time.
        {role === 'vendor'
          ? ' New businesses start on the Starter plan and are reviewed before going live.'
          : ' Riders are reviewed before they can accept deliveries.'}
      </p>

      {role === 'vendor' ? (
        <>
          {field('Business name', 'businessName', businessName, setBusinessName)}
          <div className="form-group">
            <label className="label">Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className="btn btn-sm"
                  style={{
                    borderRadius: 4,
                    background: category === c.value ? 'var(--primary-tint, rgba(255,82,27,.08))' : 'var(--surface)',
                    border: `1px solid ${category === c.value ? 'var(--primary)' : 'var(--border)'}`,
                    color: category === c.value ? 'var(--primary)' : 'var(--muted)',
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {field('Vehicle type', 'vehicleType', vehicleType, setVehicleType, { placeholder: 'e.g. Motorcycle' })}
          {field('Plate number', 'plateNumber', plateNumber, setPlateNumber)}
        </>
      )}

      {field('Address', 'address', address, setAddress)}
      {field('City', 'city', city, setCity)}
      {field('State', 'state', state, setState)}

      {errors.general && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{errors.general}</p>}

      <button className="btn btn-primary btn-block" onClick={submit} disabled={loading}>
        {loading ? <><span className="spin" />Registering…</> : role === 'vendor' ? 'Register business' : 'Register as rider'}
      </button>
    </div>
  );
}

export default function BecomeRolePage() {
  return (
    <Suspense fallback={null}>
      <BecomeRole />
    </Suspense>
  );
}
