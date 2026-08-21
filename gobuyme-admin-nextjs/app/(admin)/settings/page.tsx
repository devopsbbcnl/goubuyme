'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface SettingsApi {
  deliveryBaseFee: number;
  deliveryPerKmRate: number;
  deliveryMaxFee: number;
  maxDeliveryRadiusKm: number;
  cancellationWindowMinutes: number;
  maintenanceMode: boolean;
  tier1CommissionPercent: number;
  tier2CommissionPercent: number;
}

interface SettingsState {
  deliveryBaseFee: string;
  deliveryPerKmRate: string;
  deliveryMaxFee: string;
  maxDeliveryRadiusKm: string;
  cancellationWindowMinutes: string;
  maintenanceMode: boolean;
  tier1CommissionPercent: string;
  tier2CommissionPercent: string;
}

const EMPTY: SettingsState = {
  deliveryBaseFee: '',
  deliveryPerKmRate: '',
  deliveryMaxFee: '',
  maxDeliveryRadiusKm: '',
  cancellationWindowMinutes: '',
  maintenanceMode: false,
  tier1CommissionPercent: '',
  tier2CommissionPercent: '',
};

const toState = (s: SettingsApi | undefined): SettingsState => {
  if (!s) {
    return EMPTY;
  }
  return {
    deliveryBaseFee: String(s.deliveryBaseFee ?? ''),
    deliveryPerKmRate: String(s.deliveryPerKmRate ?? ''),
    deliveryMaxFee: String(s.deliveryMaxFee ?? ''),
    maxDeliveryRadiusKm: String(s.maxDeliveryRadiusKm ?? ''),
    cancellationWindowMinutes: String(s.cancellationWindowMinutes ?? ''),
    maintenanceMode: Boolean(s.maintenanceMode),
    tier1CommissionPercent: String(s.tier1CommissionPercent ?? ''),
    tier2CommissionPercent: String(s.tier2CommissionPercent ?? ''),
  };
};

export default function SettingsPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const [cfg, setCfg] = useState<SettingsState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const canSave = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    api.get<{ data: SettingsApi }>('/admin/settings')
      .then(res => {
        // Backend responses are enveloped: { status, message, data }
        setCfg(toState(res.data));
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
        setCfg(EMPTY);
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof SettingsState, val: string | boolean) =>
    setCfg(c => ({ ...c, [key]: val }));

  const save = async () => {
    if (!canSave) {
      setError('Only Super Admins can update platform settings.');
      return;
    }

    setSaving(true);
    setSaved(false);
    setError('');

    try {
      // Each field is independent: empty inputs are simply not sent, leaving the saved value unchanged.
      const payload: Record<string, number | boolean> = { maintenanceMode: cfg.maintenanceMode };
      const numericKeys = [
        'deliveryBaseFee', 'deliveryPerKmRate', 'deliveryMaxFee',
        'maxDeliveryRadiusKm', 'cancellationWindowMinutes',
        'tier1CommissionPercent', 'tier2CommissionPercent',
      ] as const;
      for (const key of numericKeys) {
        const raw = cfg[key].trim();
        if (raw === '') continue;
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        payload[key] = key === 'cancellationWindowMinutes' ? Math.round(n) : n;
      }
      const res = await api.patch<{ data: SettingsApi }>('/admin/settings', payload);
      setCfg(toState(res.data));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
    padding: '9px 12px',
    color: T.text,
    fontSize: 13,
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: 700,
    color: T.textSec,
    marginBottom: 6,
    display: 'block' as const,
  };

  const sectionStyle = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
    overflow: 'hidden' as const,
  };

  const sectionHeader = {
    padding: '14px 20px',
    borderBottom: `1px solid ${T.border}`,
    fontSize: 13,
    fontWeight: 700,
    color: T.text,
    background: T.surface2,
  };

  const sectionBody = {
    padding: '20px',
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, fontSize: 13, color: T.textSec }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Settings</div>
          <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>
            Live platform configuration
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving || !canSave}
          style={{
            padding: '10px 22px',
            borderRadius: 4,
            border: 'none',
            background: !canSave ? T.surface3 : saved ? T.success : T.primary,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: saving || !canSave ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div style={{
          background: `${T.error}15`,
          border: `1px solid ${T.error}40`,
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 13,
          color: T.error,
        }}>
          {error}
        </div>
      )}

      {!canSave && (
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 13,
          color: T.textSec,
        }}>
          Settings are read-only for your role. Super Admin access is required to save changes.
        </div>
      )}


      <div style={sectionStyle}>
        <div style={sectionHeader}>Delivery Pricing</div>
        <div style={{ ...sectionBody, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div>
            <label style={labelStyle}>Base Fee (Naira)</label>
            <input style={inputStyle} type="number" min="0" value={cfg.deliveryBaseFee} onChange={e => set('deliveryBaseFee', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Per KM Rate (Naira)</label>
            <input style={inputStyle} type="number" min="0" value={cfg.deliveryPerKmRate} onChange={e => set('deliveryPerKmRate', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Max Fee (Naira)</label>
            <input style={inputStyle} type="number" min="0" value={cfg.deliveryMaxFee} onChange={e => set('deliveryMaxFee', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Max Radius (km)</label>
            <input style={inputStyle} type="number" min="1" value={cfg.maxDeliveryRadiusKm} onChange={e => set('maxDeliveryRadiusKm', e.target.value)} />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeader}>Commission Tiers</div>
        <div style={sectionBody}>
          <div>
            <label style={labelStyle}>Tier 1 — Starter Commission (%)</label>
            <input style={inputStyle} type="number" min="0" max="50" step="0.1" value={cfg.tier1CommissionPercent} onChange={e => set('tier1CommissionPercent', e.target.value)} />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>
              Platform cut per order for Starter Plan vendors. No promotions access.
            </div>
          </div>
          <div>
            <label style={labelStyle}>Tier 2 — Growth Commission (%)</label>
            <input style={inputStyle} type="number" min="0" max="50" step="0.1" value={cfg.tier2CommissionPercent} onChange={e => set('tier2CommissionPercent', e.target.value)} />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>
              Platform cut per order for Growth Plan vendors. Includes promotion cards.
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: T.textMuted }}>
            Rate changes apply to new orders only — existing orders keep the commission captured at checkout.
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeader}>Order Policy</div>
        <div style={sectionBody}>
          <div>
            <label style={labelStyle}>Cancellation Window (minutes)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              max="240"
              value={cfg.cancellationWindowMinutes}
              onChange={e => set('cancellationWindowMinutes', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeader}>Platform Controls</div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 0',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.error }}>
                Maintenance Mode
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
                Blocks customer, vendor, and rider API actions while admin access remains available.
              </div>
            </div>
            <button
              onClick={() => set('maintenanceMode', !cfg.maintenanceMode)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                background: cfg.maintenanceMode ? T.error : T.surface3,
                position: 'relative',
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute',
                top: 3,
                width: 18,
                height: 18,
                borderRadius: 9,
                background: '#fff',
                transition: 'left 0.2s',
                left: cfg.maintenanceMode ? 23 : 3,
              }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
