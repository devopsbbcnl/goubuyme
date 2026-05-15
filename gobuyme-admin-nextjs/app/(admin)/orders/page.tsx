'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';

type OrderStatus = 'IN_TRANSIT' | 'PREPARING' | 'DELIVERED' | 'CANCELLED' | 'CONFIRMED' | 'PENDING' | 'READY' | 'PICKED_UP';
type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  vendorName: string;
  riderName: string | null;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  originalDeliveryFee: number;
  platformFee: number;
  totalAmount: number;
  freeDeliveryUsed: boolean;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  distanceKm: number | null;
  paystackRef: string | null;
  paystackVerified: boolean;
  note: string | null;
  estimatedTime: number | null;
  cancelReason: string | null;
  rating: number | null;
  review: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    user: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      avatar: string | null;
      isEmailVerified: boolean;
      isPhoneVerified: boolean;
      isActive: boolean;
      createdAt: string;
    };
  };
  vendor: {
    id: string;
    businessName: string;
    slug: string;
    category: string;
    address: string;
    city: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
    isOpen: boolean;
    approvalStatus: string;
    commissionTier: string;
    rating: number;
    totalRatings: number;
    user: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      isActive: boolean;
    };
  };
  rider: {
    id: string;
    vehicleType: string;
    plateNumber: string | null;
    isAvailable: boolean;
    isOnline: boolean;
    latitude: number | null;
    longitude: number | null;
    approvalStatus: string;
    rating: number;
    totalRatings: number;
    user: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      avatar: string | null;
      isActive: boolean;
    };
  } | null;
  items: Array<{
    id: string;
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    menuItem: {
      image: string | null;
      category: string | null;
      isAvailable: boolean;
    };
  }>;
}

const fmtCurrency = (n: number) => `\u20A6${n.toLocaleString()}`;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const labelize = (s: string) =>
  s.split('_').map(part => part.charAt(0) + part.slice(1).toLowerCase()).join(' ');

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  const h = Math.floor(diffMs / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h} hr ago`;
  if (m >= 1) return `${m} min ago`;
  return 'Just now';
};

const STATUS_TABS: Array<'ALL' | OrderStatus> = ['ALL', 'IN_TRANSIT', 'PREPARING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

export default function OrdersPage() {
  const { theme: T } = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Order[] }>('/admin/orders?limit=100');
      setOrders(res.data);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get<{ data: OrderDetail }>(`/admin/orders/${id}`);
      setDetail(res.data);
    } catch {
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = orders.filter(o =>
    (filter === 'ALL' || o.status === filter) &&
    (!search ||
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      (o.riderName ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  const inTransitCount = orders.filter(o => o.status === 'IN_TRANSIT').length;
  const preparingCount = orders.filter(o => o.status === 'PREPARING').length;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Orders</div>
            <div style={{ fontSize: 13, color: T.textSec }}>
              {loading ? 'Loading...' : `${orders.length} total - ${inTransitCount} in transit - ${preparingCount} preparing`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_TABS.map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: '7px 14px', borderRadius: 4,
                border: filter === s ? `1px solid ${T.primary}` : 'none',
                background: filter === s ? T.primaryTint : T.surface2,
                color: filter === s ? T.primary : T.textSec,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>
                {s === 'ALL' ? 'All' : labelize(s)}
                {s !== 'ALL' && (
                  <span style={{ opacity: 0.6, marginLeft: 4 }}>
                    {orders.filter(o => o.status === s).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search order, customer, vendor..."
            style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 14px', color: T.text, fontSize: 13, outline: 'none', width: 260 }}
          />
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Order ID', 'Customer', 'Vendor', 'Rider', 'Amount', 'Status', 'Time'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                    Loading orders...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                    No orders match the current filter.
                  </td>
                </tr>
              ) : filtered.map(o => (
                <tr
                  key={o.id}
                  onClick={() => openDetail(o.id)}
                  style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.primary }}>{o.orderNumber}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.text }}>{o.customerName}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{o.vendorName}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{o.riderName ?? '-'}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.text }}>{fmtCurrency(o.totalAmount)}</td>
                  <td style={{ padding: '13px 16px' }}><Badge status={o.status} /></td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: T.textMuted }}>{timeAgo(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail ? `Order ${detail.orderNumber}` : 'Order Detail'}
        width={860}
      >
        {detailLoading || !detail ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
            {detailLoading ? 'Loading...' : 'Failed to load order.'}
          </div>
        ) : (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{detail.orderNumber}</div>
                <div style={{ fontSize: 13, color: T.textSec, marginTop: 4 }}>
                  Placed {fmtDateTime(detail.createdAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Badge status={detail.status} />
                <Badge status={detail.paymentStatus} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Total', value: fmtCurrency(detail.totalAmount) },
                { label: 'Items', value: detail.items.reduce((sum, item) => sum + item.quantity, 0) },
                { label: 'Payment', value: labelize(detail.paymentMethod) },
                { label: 'Distance', value: detail.distanceKm == null ? '-' : `${detail.distanceKm.toFixed(1)} km` },
              ].map(s => (
                <div key={s.label} style={{ background: T.surface2, borderRadius: 4, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: T.textSec, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <SectionHead label="Order Info" T={T} />
                <InfoGrid rows={[
                  ['Order ID', detail.id],
                  ['Status', labelize(detail.status)],
                  ['Created', fmtDateTime(detail.createdAt)],
                  ['Updated', fmtDateTime(detail.updatedAt)],
                  ['Estimated Time', detail.estimatedTime == null ? '-' : `${detail.estimatedTime} min`],
                  ['Cancel Reason', detail.cancelReason ?? '-'],
                  ['Rating', detail.rating == null ? '-' : `${detail.rating}/5`],
                  ['Review', detail.review ?? '-'],
                ]} T={T} />
              </div>

              <div>
                <SectionHead label="Payment" T={T} />
                <InfoGrid rows={[
                  ['Payment Status', labelize(detail.paymentStatus)],
                  ['Payment Method', labelize(detail.paymentMethod)],
                  ['Paystack Ref', detail.paystackRef ?? '-'],
                  ['Paystack Verified', detail.paystackVerified ? 'Yes' : 'No'],
                  ['Free Delivery', detail.freeDeliveryUsed ? 'Yes' : 'No'],
                ]} T={T} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <SectionHead label="Customer" T={T} />
                <PersonBlock
                  name={detail.customer.user.name}
                  email={detail.customer.user.email}
                  phone={detail.customer.user.phone}
                  avatar={detail.customer.user.avatar}
                  rows={[
                    ['Customer ID', detail.customer.id],
                    ['User ID', detail.customer.user.id],
                    ['Email Verified', detail.customer.user.isEmailVerified ? 'Yes' : 'No'],
                    ['Phone Verified', detail.customer.user.isPhoneVerified ? 'Yes' : 'No'],
                    ['Account Active', detail.customer.user.isActive ? 'Yes' : 'No'],
                    ['Joined', fmtDateTime(detail.customer.user.createdAt)],
                  ]}
                  T={T}
                />
              </div>

              <div>
                <SectionHead label="Vendor" T={T} />
                <InfoGrid rows={[
                  ['Business', detail.vendor.businessName],
                  ['Vendor ID', detail.vendor.id],
                  ['Owner', detail.vendor.user.name],
                  ['Owner Email', detail.vendor.user.email],
                  ['Owner Phone', detail.vendor.user.phone ?? '-'],
                  ['Category', labelize(detail.vendor.category)],
                  ['Status', detail.vendor.approvalStatus],
                  ['Tier', detail.vendor.commissionTier],
                  ['Open Now', detail.vendor.isOpen ? 'Yes' : 'No'],
                  ['Rating', detail.vendor.rating > 0 ? `${detail.vendor.rating.toFixed(1)} (${detail.vendor.totalRatings})` : '-'],
                ]} T={T} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <SectionHead label="Rider" T={T} />
                {!detail.rider ? (
                  <p style={{ fontSize: 13, color: T.textSec, margin: 0 }}>No rider has been assigned to this order yet.</p>
                ) : (
                  <PersonBlock
                    name={detail.rider.user.name}
                    email={detail.rider.user.email}
                    phone={detail.rider.user.phone}
                    avatar={detail.rider.user.avatar}
                    rows={[
                      ['Rider ID', detail.rider.id],
                      ['Vehicle', detail.rider.vehicleType],
                      ['Plate Number', detail.rider.plateNumber ?? '-'],
                      ['Approval', detail.rider.approvalStatus],
                      ['Online', detail.rider.isOnline ? 'Yes' : 'No'],
                      ['Available', detail.rider.isAvailable ? 'Yes' : 'No'],
                      ['Rating', detail.rider.rating > 0 ? `${detail.rider.rating.toFixed(1)} (${detail.rider.totalRatings})` : '-'],
                    ]}
                    T={T}
                  />
                )}
              </div>

              <div>
                <SectionHead label="Delivery" T={T} />
                <InfoGrid rows={[
                  ['Address', detail.deliveryAddress],
                  ['Customer Note', detail.note ?? '-'],
                  ['Delivery Fee', fmtCurrency(detail.deliveryFee)],
                  ['Original Fee', fmtCurrency(detail.originalDeliveryFee)],
                  ['Coordinates', detail.deliveryLatitude == null || detail.deliveryLongitude == null ? '-' : `${detail.deliveryLatitude}, ${detail.deliveryLongitude}`],
                  ['Vendor Address', `${detail.vendor.address}, ${detail.vendor.city}, ${detail.vendor.state}`],
                ]} T={T} />
              </div>
            </div>

            <div>
              <SectionHead label="Items" T={T} />
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: T.surface2 }}>
                      {['Item', 'Category', 'Qty', 'Unit Price', 'Line Total', 'Available'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map(item => (
                      <tr key={item.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: '12px', fontSize: 13, fontWeight: 700, color: T.text }}>
                          {item.name}
                          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{item.menuItemId}</div>
                        </td>
                        <td style={{ padding: '12px', fontSize: 13, color: T.textSec }}>{item.menuItem.category ?? '-'}</td>
                        <td style={{ padding: '12px', fontSize: 13, color: T.text }}>{item.quantity}</td>
                        <td style={{ padding: '12px', fontSize: 13, color: T.text }}>{fmtCurrency(item.price)}</td>
                        <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: T.text }}>{fmtCurrency(item.price * item.quantity)}</td>
                        <td style={{ padding: '12px' }}><Badge status={item.menuItem.isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionHead label="Totals" T={T} />
              <div style={{ background: T.surface2, borderRadius: 4, padding: 14, maxWidth: 360, marginLeft: 'auto' }}>
                <InfoGrid rows={[
                  ['Subtotal', fmtCurrency(detail.subtotal)],
                  ['Delivery Fee', fmtCurrency(detail.deliveryFee)],
                  ['Platform Fee', fmtCurrency(detail.platformFee)],
                  ['Total', fmtCurrency(detail.totalAmount)],
                ]} T={T} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function SectionHead({ label, T }: { label: string; T: Record<string, string> }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
      {label}
    </div>
  );
}

function InfoGrid({ rows, T }: { rows: [string, string][]; T: Record<string, string> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(([key, val]) => (
        <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: T.textSec, minWidth: 120, flexShrink: 0 }}>{key}</span>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600, wordBreak: 'break-word' }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

function PersonBlock({
  name,
  email,
  phone,
  avatar,
  rows,
  T,
}: {
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  rows: [string, string][];
  T: Record<string, string>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: T.surface2,
          border: `1px solid ${T.border}`,
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 800,
          color: T.textSec,
        }}>
          {avatar
            ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={avatar} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{name}</div>
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>{email}</div>
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>{phone ?? '-'}</div>
        </div>
      </div>
      <InfoGrid rows={rows} T={T} />
    </div>
  );
}
