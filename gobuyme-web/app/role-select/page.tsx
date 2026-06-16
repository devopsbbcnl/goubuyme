'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

const ROLES = [
  { role: 'customer', icon: '🛒', title: 'I\'m a Customer', sub: 'Order food, groceries and more delivered fast.' },
  { role: 'vendor', icon: '🏪', title: 'I\'m a Vendor', sub: 'Sell your products to thousands of customers.' },
  { role: 'rider', icon: '🏍️', title: 'I\'m a Rider', sub: 'Earn money delivering orders in your city.' },
];

export default function RoleSelectPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <Link href="/onboarding" className="logo" style={{ justifyContent: 'center', fontSize: 26, marginBottom: 40, display: 'flex' }}>
          <span className="go">Go</span><span className="buy">Buy</span><span className="me">Me</span>
        </Link>

        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Join GoBuyMe</h2>
        <p className="muted" style={{ textAlign: 'center', fontSize: 14, marginBottom: 36 }}>Choose how you want to use GoBuyMe</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ROLES.map(r => (
            <button
              key={r.role}
              onClick={() => router.push(`/register?role=${r.role}`)}
              className="card card-pad"
              style={{ display: 'flex', alignItems: 'center', gap: 20, cursor: 'pointer', textAlign: 'left', transition: 'all .15s', border: '1.5px solid var(--line)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
            >
              <span style={{ fontSize: 40, flexShrink: 0 }}>{r.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{r.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>{r.sub}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 28, fontSize: 14, color: 'var(--muted)' }}>
          Already have an account? <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
