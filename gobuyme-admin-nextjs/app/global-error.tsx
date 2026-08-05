'use client';

import { useEffect } from 'react';
import { reportError } from '@/services/errorReporting';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: 'global' });
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0 }}>
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
          background: '#0E0E0E', color: '#fff', fontFamily: 'sans-serif',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: '#aaa', marginBottom: 24 }}>{error.message || 'Please try again.'}</p>
          <button
            onClick={() => unstable_retry()}
            style={{
              padding: '12px 24px', background: '#FF521B', color: '#fff',
              border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
