'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

interface SettingsState {
  platformName: string;
  supportEmail: string;
  vendorCommission: string;
  riderCommission: string;
  deliveryBaseRate: string;
  deliveryPerKm: string;
  minOrderAmount: string;
  maxDeliveryRadius: string;
  cancellationWindow: string;
  autoApproveVendors: boolean;
  autoApproveRiders: boolean;
  maintenanceMode: boolean;
}

const EMPTY: SettingsState = {
  platformName: '',
  supportEmail: '',
  vendorCommission: '',
  riderCommission: '',
  deliveryBaseRate: '',
  deliveryPerKm: '',
  minOrderAmount: '',
  maxDeliveryRadius: '',
  cancellationWindow: '',
  autoApproveVendors: false,
  autoApproveRiders: false,
  maintenanceMode: false,
};

export default function SettingsPage() {
  const { theme: T } = useTheme();
  const [cfg, setCfg] = useState<SettingsState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ data: SettingsState }>('/admin/settings')
      .then(res => setCfg(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof SettingsState, val: string | boolean) =>
    setCfg(c => ({ ...c, [key]: val }));

  const save = async () => {
    await api.patch('/admin/settings', cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, fontSize: 13, color: T.textSec }}>
        Loading settings…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Settings</div>
          <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>Platform configuration</div>
        </div>
        <button onClick={save} style={{
          padding: '10px 22px', borderRadius: 4, border: 'none',
          background: saved ? T.success : T.primary,
          color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          transition: 'background 0.2s',
        }}>
          {saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      {/* General */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>General</div>
        <div style={sectionBody}>
          <div>
            <label style={labelStyle}>Platform Name</label>
            <input style={inputStyle} value={cfg.platformName} onChange={e => set('platformName', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Support Email</label>
            <input style={inputStyle} value={cfg.supportEmail} onChange={e => set('supportEmail', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Commission rates */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>Commission Rates</div>
        <div style={sectionBody}>
          <div>
            <label style={labelStyle}>Vendor Commission (%)</label>
            <input style={inputStyle} type="number" min="0" max="100" value={cfg.vendorCommission} onChange={e => set('vendorCommission', e.target.value)} />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>Platform fee deducted from each vendor order</div>
          </div>
          <div>
            <label style={labelStyle}>Rider Commission (%)</label>
            <input style={inputStyle} type="number" min="0" max="100" value={cfg.riderCommission} onChange={e => set('riderCommission', e.target.value)} />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>Platform fee deducted from delivery earnings</div>
          </div>
        </div>
      </div>

      {/* Delivery pricing */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>Delivery Pricing</div>
        <div style={{ ...sectionBody, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          <div>
            <label style={labelStyle}>Base Rate (₦)</label>
            <input style={inputStyle} type="number" min="0" value={cfg.deliveryBaseRate} onChange={e => set('deliveryBaseRate', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Per KM Rate (₦)</label>
            <input style={inputStyle} type="number" min="0" value={cfg.deliveryPerKm} onChange={e => set('deliveryPerKm', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Min Order (₦)</label>
            <input style={inputStyle} type="number" min="0" value={cfg.minOrderAmount} onChange={e => set('minOrderAmount', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Max Radius (km)</label>
            <input style={inputStyle} type="number" min="1" value={cfg.maxDeliveryRadius} onChange={e => set('maxDeliveryRadius', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Order policy */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>Order Policy</div>
        <div style={sectionBody}>
          <div>
            <label style={labelStyle}>Cancellation Window (minutes)</label>
            <input style={inputStyle} type="number" min="0" value={cfg.cancellationWindow} onChange={e => set('cancellationWindow', e.target.value)} />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>How long customers can cancel after placing an order</div>
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>Platform Controls</div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {([
            { key: 'autoApproveVendors', label: 'Auto-approve vendors', desc: 'Skip manual review for new vendor applications' },
            { key: 'autoApproveRiders',  label: 'Auto-approve riders',  desc: 'Skip manual review for new rider applications' },
            { key: 'maintenanceMode',    label: 'Maintenance mode',     desc: 'Take the platform offline for all users' },
          ] as const).map((toggle, i) => (
            <div key={toggle.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 0',
              borderTop: i > 0 ? `1px solid ${T.border}` : 'none',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: toggle.key === 'maintenanceMode' ? T.error : T.text }}>
                  {toggle.label}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>{toggle.desc}</div>
              </div>
              <button
                onClick={() => set(toggle.key, !cfg[toggle.key])}
                style={{
                  width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: cfg[toggle.key]
                    ? (toggle.key === 'maintenanceMode' ? T.error : T.primary)
                    : T.surface3,
                  position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, width: 18, height: 18, borderRadius: 9,
                  background: '#fff', transition: 'left 0.2s',
                  left: cfg[toggle.key] ? 23 : 3,
                }} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
