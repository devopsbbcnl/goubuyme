'use client';

import { useEffect } from 'react';
import { reportError } from '@/services/errorReporting';

export default function ShopError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: 'boundary' });
  }, [error]);

  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
    }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>{error.message || 'Please try again.'}</p>
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
  );
}
