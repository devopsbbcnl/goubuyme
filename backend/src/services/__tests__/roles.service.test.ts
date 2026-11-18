const db = {
  vendor: { findFirst: jest.fn() },
  rider: { findUnique: jest.fn() },
  customer: { upsert: jest.fn() },
};
jest.mock('../../config/db', () => ({ __esModule: true, default: db }));

import {
  getRoleStatuses, canActAs, ensureCustomerProfile, holdsOtherLiveRole,
  resolveLoginRole, summarizeOtherRoles, REAL_CUSTOMER,
} from '../roles.service';

const riderRow = (approvalStatus: string) => ({ approvalStatus, company: null });

beforeEach(() => {
  jest.clearAllMocks();
  db.vendor.findFirst.mockResolvedValue(null);
  db.rider.findUnique.mockResolvedValue(null);
});

describe('getRoleStatuses', () => {
  it('gives a plain customer customer access only', async () => {
    const roles = await getRoleStatuses('u1', 'CUSTOMER' as never);
    expect(roles.find((r) => r.role === 'CUSTOMER')?.canSwitch).toBe(true);
    expect(roles.find((r) => r.role === 'VENDOR')).toMatchObject({ status: 'NOT_REGISTERED', canSwitch: false });
    expect(roles.find((r) => r.role === 'RIDER')).toMatchObject({ status: 'NOT_REGISTERED', canSwitch: false });
  });

  it('lets a customer who registered a vendor profile switch into it, even while pending', async () => {
    db.vendor.findFirst.mockResolvedValue({ approvalStatus: 'PENDING' });
    const roles = await getRoleStatuses('u1', 'CUSTOMER' as never);
    expect(roles.find((r) => r.role === 'VENDOR')).toMatchObject({ status: 'PENDING', canSwitch: true });
  });

  it('blocks a suspended rider without touching customer access', async () => {
    db.rider.findUnique.mockResolvedValue(riderRow('SUSPENDED'));
    const roles = await getRoleStatuses('u1', 'RIDER' as never);
    expect(roles.find((r) => r.role === 'RIDER')?.canSwitch).toBe(false);
    expect(roles.find((r) => r.role === 'CUSTOMER')?.canSwitch).toBe(true);
  });

  it('never lets staff accounts switch', async () => {
    const roles = await getRoleStatuses('u1', 'SUPER_ADMIN' as never);
    expect(roles).toEqual([{ role: 'SUPER_ADMIN', status: 'APPROVED', canSwitch: false }]);
  });
});

describe('canActAs', () => {
  it('always allows the primary role', async () => {
    expect(await canActAs('u1', 'RIDER' as never, 'RIDER' as never)).toBe(true);
  });

  it('lets any switchable account act as a customer', async () => {
    expect(await canActAs('u1', 'VENDOR' as never, 'CUSTOMER' as never)).toBe(true);
  });

  it('refuses a role with no profile', async () => {
    expect(await canActAs('u1', 'CUSTOMER' as never, 'VENDOR' as never)).toBe(false);
  });

  it('refuses staff roles as a target, so a token can never be escalated to admin', async () => {
    expect(await canActAs('u1', 'CUSTOMER' as never, 'SUPER_ADMIN' as never)).toBe(false);
  });

  it('refuses any switch from a staff account', async () => {
    expect(await canActAs('u1', 'SUPER_ADMIN' as never, 'CUSTOMER' as never)).toBe(false);
  });
});

describe('holdsOtherLiveRole', () => {
  const tx = {
    vendor: { findFirst: jest.fn() },
    rider: { findFirst: jest.fn() },
    customer: { findUnique: jest.fn() },
    order: { count: jest.fn() },
  };
  const run = (deleting: 'CUSTOMER' | 'VENDOR' | 'RIDER') => holdsOtherLiveRole(tx as never, 'u1', deleting);

  beforeEach(() => {
    tx.vendor.findFirst.mockResolvedValue(null);
    tx.rider.findFirst.mockResolvedValue(null);
    tx.customer.findUnique.mockResolvedValue(null);
    tx.order.count.mockResolvedValue(0);
  });

  it('is false for a rider with nothing else, so the account can be removed', async () => {
    expect(await run('RIDER')).toBe(false);
  });

  it('ignores an empty customer row created by switching modes', async () => {
    tx.customer.findUnique.mockResolvedValue({ id: 'c1' });
    expect(await run('RIDER')).toBe(false);
  });

  it('keeps the account when a rider also has customer order history', async () => {
    tx.customer.findUnique.mockResolvedValue({ id: 'c1' });
    tx.order.count.mockResolvedValue(3);
    expect(await run('RIDER')).toBe(true);
  });

  it('keeps the account when a rider also owns a live business', async () => {
    tx.vendor.findFirst.mockResolvedValue({ id: 'v1' });
    expect(await run('RIDER')).toBe(true);
  });

  it('keeps the account when a vendor is also a live rider', async () => {
    tx.rider.findFirst.mockResolvedValue({ id: 'r1' });
    expect(await run('VENDOR')).toBe(true);
  });

  it('does not count the role being deleted as "other"', async () => {
    tx.vendor.findFirst.mockResolvedValue({ id: 'v1' });
    expect(await run('VENDOR')).toBe(false);
    expect(tx.vendor.findFirst).not.toHaveBeenCalled();
  });

  it('only looks at live profiles, never suspended or rejected ones', async () => {
    await run('CUSTOMER');
    expect(tx.vendor.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ approvalStatus: { notIn: ['SUSPENDED', 'REJECTED'] } }),
    }));
  });
});

describe('ensureCustomerProfile', () => {
  it('creates the customer row only if missing', async () => {
    await ensureCustomerProfile('u1');
    expect(db.customer.upsert).toHaveBeenCalledWith({ where: { userId: 'u1' }, update: {}, create: { userId: 'u1' } });
  });
});

describe('resolveLoginRole', () => {
  it('uses the primary role when nothing was remembered', async () => {
    expect(await resolveLoginRole({ id: 'u1', role: 'CUSTOMER' as never, lastActiveRole: null })).toBe('CUSTOMER');
  });

  it('reopens the last used role while the person still qualifies', async () => {
    db.rider.findUnique.mockResolvedValue(riderRow('APPROVED'));
    expect(await resolveLoginRole({ id: 'u1', role: 'CUSTOMER' as never, lastActiveRole: 'RIDER' as never })).toBe('RIDER');
  });

  it('falls back to the primary role once the remembered role is suspended', async () => {
    db.rider.findUnique.mockResolvedValue(riderRow('SUSPENDED'));
    expect(await resolveLoginRole({ id: 'u1', role: 'CUSTOMER' as never, lastActiveRole: 'RIDER' as never })).toBe('CUSTOMER');
  });

  it('falls back to the primary role when the lookup fails, never blocking sign-in', async () => {
    db.rider.findUnique.mockRejectedValue(new Error('db down'));
    expect(await resolveLoginRole({ id: 'u1', role: 'CUSTOMER' as never, lastActiveRole: 'RIDER' as never })).toBe('CUSTOMER');
  });

  it('never lifts a staff account into another role', async () => {
    expect(await resolveLoginRole({ id: 'u1', role: 'SUPER_ADMIN' as never, lastActiveRole: 'CUSTOMER' as never })).toBe('SUPER_ADMIN');
  });
});

describe('summarizeOtherRoles', () => {
  const base = { role: 'CUSTOMER' as never, customer: null, rider: null, vendors: [] as { approvalStatus: string }[] };

  it('is empty for a single-role account', () => {
    expect(summarizeOtherRoles(base, 'CUSTOMER')).toEqual([]);
  });

  it('lists the other roles with their standing, never the one being viewed', () => {
    const u = { ...base, rider: { approvalStatus: 'PENDING' }, vendors: [{ approvalStatus: 'APPROVED' }] };
    expect(summarizeOtherRoles(u, 'VENDOR')).toEqual([{ role: 'RIDER', status: 'PENDING' }]);
    expect(summarizeOtherRoles(u, 'RIDER')).toEqual([{ role: 'VENDOR', status: 'APPROVED' }]);
  });

  it('counts a customer-primary account as a customer even without orders', () => {
    const u = { ...base, customer: { _count: { orders: 0 } }, rider: { approvalStatus: 'APPROVED' } };
    expect(summarizeOtherRoles(u, 'RIDER')).toEqual([{ role: 'CUSTOMER', status: 'ACTIVE' }]);
  });

  it('ignores the empty customer row a vendor/rider gets from switching modes', () => {
    const u = { ...base, role: 'RIDER' as never, customer: { _count: { orders: 0 } }, rider: { approvalStatus: 'APPROVED' } };
    expect(summarizeOtherRoles(u, 'RIDER')).toEqual([]);
  });

  it('counts a vendor/rider who has actually ordered as a customer', () => {
    const u = { ...base, role: 'RIDER' as never, customer: { _count: { orders: 2 } }, rider: { approvalStatus: 'APPROVED' } };
    expect(summarizeOtherRoles(u, 'RIDER')).toEqual([{ role: 'CUSTOMER', status: 'ACTIVE' }]);
  });
});

describe('REAL_CUSTOMER', () => {
  it('is a customer-primary account or anyone with orders', () => {
    expect(REAL_CUSTOMER).toEqual({ OR: [{ user: { role: 'CUSTOMER' } }, { orders: { some: {} } }] });
  });
});
