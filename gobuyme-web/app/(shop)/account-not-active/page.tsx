'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const SUPPORT_EMAIL = 'support@gobuyme.com';

export default function AccountNotActivePage() {
  const { user, loading, updateUser, logout } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading && (!user || user.role !== 'vendor')) router.replace('/login');
  }, [user, loading, router]);

  const roleLabel = 'vendor';

  const handleRefresh = async () => {
    setRefreshing(true);
    setMessage('');
    try {
      const { data } = await api.get('/auth/activation-status');
      const { approvalStatus } = data.data;
      updateUser({ approvalStatus });
      if (approvalStatus === 'APPROVED') {
        router.replace('/vendor');
      } else {
        setMessage("Account is still pending approval. We'll notify you when it's ready.");
      }
    } catch {
      setMessage('Could not check status. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const supportHref = `mailto:${SUPPORT_EMAIL}?subject=Account Activation – ${roleLabel}&body=Hi, my ${roleLabel} account is pending approval. Please assist.`;

  if (loading || !user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%', background: 'var(--surface2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', fontSize: 36,
        }}>🔒</div>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Account Not Active</h2>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 4 }}>
          Your GoBuyMe {roleLabel} account is currently being set up or awaiting approval.
        </p>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          You&apos;ll be notified once it&apos;s ready.
        </p>

        {!!message && (
          <p className="muted" style={{ fontSize: 13, background: 'var(--surface2)', padding: 12, borderRadius: 4, marginBottom: 20 }}>
            {message}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="btn btn-primary btn-block btn-lg" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <><span className="spin" />Checking…</> : 'Refresh Status'}
          </button>
          <a href={supportHref} className="btn btn-ghost btn-block btn-lg" style={{ textDecoration: 'none' }}>
            ✉️ Contact Support
          </a>
          <button
            onClick={() => { logout(); router.replace('/login'); }}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, cursor: 'pointer', padding: 8 }}
          >
            Sign out
          </button>
        </div>

        <p style={{ marginTop: 28 }}>
          <Link href="/" style={{ fontSize: 13, color: 'var(--muted)' }}>← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
