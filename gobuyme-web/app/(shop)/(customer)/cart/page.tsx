'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';

export default function CartHubPage() {
  const { carts } = useCart();

  if (carts.length === 0) return (
    <div className="page-body"><div className="inner">
      <div className="empty" style={{ padding: '80px 24px' }}>
        <div className="emoji">🛒</div>
        <h3>Your cart is empty</h3>
        <p>Add items from a vendor to get started.</p>
        <Link href="/vendors" className="btn btn-primary" style={{ marginTop: 24 }}>Browse Vendors</Link>
      </div>
    </div></div>
  );

  return (
    <div className="page-body">
      <div className="inner">
        <h1 className="t-page" style={{ marginBottom: 28 }}>Your Carts</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
          {carts.map(cart => {
            const itemCount = cart.items.reduce((s, i) => s + i.qty, 0);
            const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
            return (
              <Link
                key={cart.vendorId}
                href={`/cart/${cart.vendorId}`}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', textDecoration: 'none', color: 'inherit' }}
              >
                {cart.vendorLogo
                  ? <Image src={cart.vendorLogo} alt="" width={52} height={52} style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🏪</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{cart.vendorName}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{itemCount} item{itemCount === 1 ? '' : 's'}</div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--brand)' }}>₦{subtotal.toLocaleString()}</div>
                <div style={{ color: 'var(--muted)', fontSize: 18 }}>→</div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
