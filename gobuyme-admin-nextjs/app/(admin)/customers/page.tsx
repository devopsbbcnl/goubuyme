'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';

interface Customer {
  id: string; name: string; email: string; phone: string | null;
  isActive: boolean; totalOrders: number; totalSpent: number; createdAt: string;
}

interface Address {
  id: string; label: string; address: string; city: string; state: string; isDefault: boolean;
}

type OrderStatus = 'IN_TRANSIT' | 'PREPARING' | 'DELIVERED' | 'CANCELLED' | 'CONFIRMED' | 'PENDING' | 'READY' | 'PICKED_UP';

interface CustomerOrder {
  id: string; orderNumber: string; status: OrderStatus;
  totalAmount: number; vendorName: string; createdAt: string;
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${n.toLocaleString()}`;
  return `₦${n}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function CustomersPage() {
  const { theme: T } = useTheme();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);
  const [deleteCustomerName, setDeleteCustomerName] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Customer[] }>('/admin/customers?limit=100');
      setCustomers(res.data);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    if (!selectedCustomer) { setAddresses([]); setOrders([]); return; }

    setAddressesLoading(true);
    api.get<{ data: Address[] }>(`/admin/customers/${selectedCustomer.id}/addresses`)
      .then(res => setAddresses(res.data))
      .catch(() => setAddresses([]))
      .finally(() => setAddressesLoading(false));

    setOrdersLoading(true);
    api.get<{ data: CustomerOrder[] }>(`/admin/orders?customerId=${selectedCustomer.id}&limit=100`)
      .then(res => setOrders(res.data))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [selectedCustomer]);

  const filtered = customers.filter(c =>
    (filter === 'ALL' || (filter === 'ACTIVE' ? c.isActive : !c.isActive)) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').includes(search))
  );

  useEffect(() => { setPage(1); }, [filter, search]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const activeCount = customers.filter(c => c.isActive).length;

  const deleteCustomerHandler = async () => {
    if (!deleteCustomerId) return;
    setDeleteLoading(true);
    try {
      await api.del(`/admin/customers/${deleteCustomerId}`);
      setCustomers(cs => cs.filter(c => c.id !== deleteCustomerId));
      setDeleteCustomerId(null);
      setDeleteCustomerName('');
    } catch {
      // error handled by api wrapper
    } finally {
      setDeleteLoading(false);
    }
  };

  const openDeleteModal = (id: string, name: string) => {
    setDeleteCustomerId(id);
    setDeleteCustomerName(name);
    setDeleteModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Modal
        open={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        title="Customer Details"
        width={520}
      >
        {selectedCustomer && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 9999, flexShrink: 0,
                background: T.primaryTint,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, color: T.primary,
              }}>
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{selectedCustomer.name}</div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>{selectedCustomer.email}</div>
              </div>
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 9px',
                color: selectedCustomer.isActive ? T.success : T.textSec,
                background: selectedCustomer.isActive ? T.successBg : T.surface3,
              }}>
                {selectedCustomer.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Info grid */}
            {[
              ['Customer ID', selectedCustomer.id],
              ['Phone', selectedCustomer.phone ?? '—'],
              ['Member Since', fmtDate(selectedCustomer.createdAt)],
              ['Total Orders', String(selectedCustomer.totalOrders)],
              ['Total Spent', fmtCurrency(selectedCustomer.totalSpent)],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: `1px solid ${T.border}`,
              }}>
                <span style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: label === 'Total Spent' ? 700 : 500, fontFamily: 'monospace' }}>
                  {value}
                </span>
              </div>
            ))}

            {/* Orders */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Orders
              </div>
              {ordersLoading ? (
                <div style={{ fontSize: 12, color: T.textSec, padding: '8px 0' }}>Loading…</div>
              ) : orders.length === 0 ? (
                <div style={{ fontSize: 12, color: T.textSec, padding: '8px 0' }}>No orders yet.</div>
              ) : (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: T.surface2 }}>
                        {['Order', 'Vendor', 'Amount', 'Status', 'Date'].map(h => (
                          <th key={h} style={{ padding: '9px 12px', fontSize: 10, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr
                          key={o.id}
                          onClick={() => {
                            setSelectedCustomer(null);
                            router.push(`/orders?openOrderId=${o.id}`);
                          }}
                          style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, color: T.primary }}>{o.orderNumber}</td>
                          <td style={{ padding: '10px 12px', fontSize: 12, color: T.textSec }}>{o.vendorName}</td>
                          <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, color: T.text }}>{fmtCurrency(o.totalAmount)}</td>
                          <td style={{ padding: '10px 12px' }}><Badge status={o.status} /></td>
                          <td style={{ padding: '10px 12px', fontSize: 11, color: T.textMuted }}>{fmtDateTime(o.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Addresses */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Saved Addresses
              </div>
              {addressesLoading ? (
                <div style={{ fontSize: 12, color: T.textSec, padding: '8px 0' }}>Loading…</div>
              ) : addresses.length === 0 ? (
                <div style={{ fontSize: 12, color: T.textSec, padding: '8px 0' }}>No saved addresses.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {addresses.map(a => (
                    <div key={a.id} style={{
                      background: T.surface2, borderRadius: 4, padding: '10px 12px',
                      border: `1px solid ${a.isDefault ? T.primary : T.border}`,
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.label}</span>
                          {a.isDefault && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: T.primary, background: T.primaryTint, borderRadius: 4, padding: '1px 6px' }}>Default</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: T.textSec }}>{a.address}</div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{a.city}, {a.state}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  openDeleteModal(selectedCustomer.id, selectedCustomer.name);
                }}
                style={{ padding: '8px 16px', borderRadius: 4, border: `1px solid ${T.error}`, background: 'none', color: T.error, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Delete Account
              </button>
              <button
                onClick={() => setSelectedCustomer(null)}
                style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: T.surface2, color: T.text, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDeleteModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Customer"
        message="This action will permanently delete the customer account and all associated data. This cannot be undone."
        itemName={deleteCustomerName}
        onConfirm={deleteCustomerHandler}
        isLoading={deleteLoading}
        isDangerous
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Customers</div>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {loading ? 'Loading…' : `${customers.length} total · ${activeCount} active`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: 4,
              border: filter === f ? `1px solid ${T.primary}` : 'none',
              background: filter === f ? T.primaryTint : T.surface2,
              color: filter === f ? T.primary : T.textSec,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              {f.charAt(0) + f.slice(1).toLowerCase()}
              {f !== 'ALL' && (
                <span style={{ opacity: 0.6, marginLeft: 4 }}>
                  {f === 'ACTIVE' ? activeCount : customers.length - activeCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 14px', color: T.text, fontSize: 13, outline: 'none', width: 240 }}
        />
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              {['Customer', 'Phone', 'Email', 'Orders', 'Total Spent', 'Joined', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                  Loading customers…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                  No customers found.
                </td>
              </tr>
            ) : paginated.map(c => (
              <tr
                key={c.id}
                onClick={() => setSelectedCustomer(c)}
                style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{c.id.slice(0, 8)}</div>
                </td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{c.phone ?? '—'}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{c.email}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: T.text }}>{c.totalOrders}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.success }}>{fmtCurrency(c.totalSpent)}</td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{fmtDate(c.createdAt)}</td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 9px',
                    color: c.isActive ? T.success : T.textSec,
                    background: c.isActive ? T.successBg : T.surface3,
                  }}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '13px 16px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => openDeleteModal(c.id, c.name)} style={{ padding: '5px 10px', borderRadius: 4, border: `1px solid ${T.error}`, background: 'none', color: T.error, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          total={filtered.length}
          page={page}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={(size) => { setPerPage(size); setPage(1); }}
        />
      </div>
    </div>
  );
}
