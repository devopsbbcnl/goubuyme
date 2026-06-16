'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';

export default function VendorSettingsPage() {
  const { logout } = useAuth();
  const toast = useToast();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-mode') === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-mode', next ? 'dark' : 'light');
    localStorage.setItem('gbm_theme', next ? 'dark' : 'light');
    toast(`Switched to ${next ? 'dark' : 'light'} mode`, 'info');
  };

  const settings = [
    { label: 'Dark Mode', desc: 'Toggle dark/light appearance', toggle: toggleTheme, checked: isDark },
  ];

  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 28 }}>Settings</h1>
      <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {settings.map(s => (
          <div key={s.label} className="card card-pad between">
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.label}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{s.desc}</div>
            </div>
            <label className="switch"><input type="checkbox" checked={s.checked} onChange={s.toggle} /><span className="track" /></label>
          </div>
        ))}
        <div className="card card-pad">
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Danger Zone</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Signing out will require you to log in again.</p>
          <button className="btn btn-danger" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}
