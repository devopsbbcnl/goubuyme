'use client';
import { SmoisProvider } from '@/components/smois/ui';
import { useTheme } from '@/context/ThemeContext';

export default function SmoisLayout({ children }: { children: React.ReactNode }) {
  const { theme: T } = useTheme();
  return (
    <SmoisProvider
      fallback={(state) => (
        <div style={{ padding: 40, textAlign: 'center', color: T.textSec, fontSize: 14 }}>
          {state === 'loading' ? 'Loading…' : (
            <>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
              <div style={{ fontWeight: 800, color: T.text, marginBottom: 4 }}>No access to the social media workspace</div>
              Ask a super admin to add you under Social Media → Team.
            </>
          )}
        </div>
      )}
    >
      {children}
    </SmoisProvider>
  );
}
