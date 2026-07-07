'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

const SLIDES = [
  { icon: '🍔', title: 'Order Anything', sub: 'Food, groceries, pharmacy, and more — all in one app.' },
  { icon: '⚡', title: '25-Min Delivery', sub: 'Lightning-fast riders deliver to your door, guaranteed.' },
  { icon: '🏪', title: '500+ Vendors', sub: 'The best restaurants and shops across Nigeria.' },
];

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <Link href="/" className="logo" style={{ justifyContent: 'center', fontSize: 28, marginBottom: 48, display: 'flex' }}>
          <span className="go">Go</span><span className="buy">Buy</span><span className="me">Me</span>
        </Link>

        <div style={{ display: 'grid', gap: 24, marginBottom: 48 }}>
          {SLIDES.map(s => (
            <div key={s.title} className="card card-pad" style={{ textAlign: 'left', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 36, flexShrink: 0 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: 14 }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="btn btn-primary btn-block btn-lg" onClick={() => router.push('/role-select')}>
            Create an Account
          </button>
          <Link href="/login" className="btn btn-ghost btn-block btn-lg">
            I already have an account
          </Link>
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 24, lineHeight: 1.6 }}>
          By continuing, you agree to our{' '}
          <Link href="/terms" style={{ color: 'var(--brand)' }}>Terms of Service</Link> and{' '}
          <Link href="/privacy" style={{ color: 'var(--brand)' }}>Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
