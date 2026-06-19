'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';

export default function CartPage() {
  const { items, totalAmount, updateQty, removeItem } = useCart();
  const router = useRouter();

  if (items.length === 0) return (
    <div className="page-body"><div className="inner">
      <div className="empty" style={{ padding: '80px 24px' }}>
        <div className="emoji">🛒</div>
        <h3>Your cart is empty</h3>
        <p>Add items from a vendor to get started.</p>
        <Link href="/vendors" className="btn btn-primary" style={{ marginTop: 24 }}>Browse Vendors</Link>
      </div>
    </div></div>
  );

  const vendorName = items[0]?.vendorName;

  return (
    <div className="page-body">
      <div className="inner">
        <h1 className="t-page" style={{ marginBottom: 28 }}>Your Cart</h1>
        <div className="layout-grid">

          {/* Items */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 15 }}>
              🏪 {vendorName}
            </div>
            {items.map(item => (
              <div key={item.menuItemId} style={{ display: 'flex', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
                {item.image
                  ? <img src={item.image} alt="" style={{ width: 60, height: 60, borderRadius: 6, objectFit: 'cover' }} />
                  : <div style={{ width: 60, height: 60, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🍽️</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{item.name}</div>
                  <div style={{ color: 'var(--brand)', fontWeight: 800, fontSize: 15 }}>₦{item.price.toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => updateQty(item.menuItemId, item.qty - 1)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid var(--line)', background: 'var(--surface)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 700 }}>−</button>
                  <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.menuItemId, item.qty + 1)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--brand)', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 700, border: 'none' }}>+</button>
                </div>
                <div style={{ fontWeight: 800, minWidth: 80, textAlign: 'right' }}>₦{(item.price * item.qty).toLocaleString()}</div>
                <button onClick={() => removeItem(item.menuItemId)} style={{ color: 'var(--error)', marginLeft: 8, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="card card-pad layout-sticky">
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>Order Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div className="between"><span className="muted">Subtotal</span><span style={{ fontWeight: 700 }}>₦{totalAmount.toLocaleString()}</span></div>
              <div className="between"><span className="muted">Delivery fee</span><span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: 13 }}>Calculated at checkout</span></div>
              <div className="divider" style={{ margin: '4px 0' }} />
              <div className="between"><span style={{ fontWeight: 700 }}>Subtotal</span><span style={{ fontWeight: 800, fontSize: 18, color: 'var(--brand)' }}>₦{totalAmount.toLocaleString()}</span></div>
            </div>
            <button className="btn btn-primary btn-block btn-lg" onClick={() => router.push('/checkout')}>
              Proceed to Checkout →
            </button>
            <Link href="/vendors" className="btn btn-ghost btn-block" style={{ marginTop: 10 }}>
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
