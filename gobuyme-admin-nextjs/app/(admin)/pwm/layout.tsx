'use client';
import { PwmProvider } from '@/components/pwm/ui';
import { useTheme } from '@/context/ThemeContext';

export default function PwmLayout({ children }: { children: React.ReactNode }) {
  const { theme: T } = useTheme();
  return (
    <PwmProvider
      fallback={(state) => (
        <div style={{ padding: 40, textAlign: 'center', color: T.textSec, fontSize: 14 }}>
          {state === 'loading' ? 'Loading…' : (
            <>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
              <div style={{ fontWeight: 800, color: T.text, marginBottom: 4 }}>No access to People &amp; Workforce</div>
              Ask a super admin to add you under People &amp; Workforce → Team.
            </>
          )}
        </div>
      )}
    >
      {children}
    </PwmProvider>
  );
}
