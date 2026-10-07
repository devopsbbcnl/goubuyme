'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { setAnalyticsOptOut } from '@/services/analytics';

/**
 * "Usage analytics" switch row, shared by the customer profile, vendor settings and rider
 * profile pages. The account flag (User.analyticsOptIn) is the source of truth — the backend
 * drops events for opted-out users — and the local flag stops this browser queueing them.
 */
export function AnalyticsConsentRow({ style }: { style?: React.CSSProperties }) {
  const toast = useToast();
  // null until loaded, so the switch never shows a guessed value.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api.get('/notifications/preferences').then(r => {
      const value = r.data.data?.analyticsOptIn;
      if (typeof value !== 'boolean') return;
      setEnabled(value);
      setAnalyticsOptOut(!value);
    }).catch(() => {});
  }, []);

  const toggle = async () => {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    setAnalyticsOptOut(!next);
    try {
      await api.patch('/notifications/preferences', { analyticsOptIn: next });
      toast(next ? 'Thanks for helping us improve GoBuyMe' : 'We\'ll stop collecting usage analytics', 'success');
    } catch {
      setEnabled(!next);
      setAnalyticsOptOut(next);
      toast('Couldn\'t update your preference', 'error');
    }
  };

  return (
    <div className="between" style={style}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Usage analytics</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Share which pages and features you use so we can improve GoBuyMe. Never your address or payment details.
        </div>
      </div>
      <label className="switch" style={{ flexShrink: 0 }}>
        <input
          type="checkbox"
          aria-label="Share usage analytics"
          checked={enabled ?? false}
          disabled={enabled === null}
          onChange={toggle}
        />
        <span className="track" />
      </label>
    </div>
  );
}
