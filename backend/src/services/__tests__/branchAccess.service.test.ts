// Branch manager logins: creating, validating, resetting and revoking, plus who gets order alerts.

jest.mock('../../config/db', () => ({ __esModule: true, default: { $transaction: jest.fn(), user: {}, vendor: {} } }));
jest.mock('bcryptjs', () => ({ __esModule: true, default: { hash: jest.fn(async (v: string) => `hashed:${v}`) } }));

import prisma from '../../config/db';
import {
  createManagerLogin,
  generateTempPassword,
  isStrongPassword,
  parseManagerInput,
  resetManagerPassword,
  revokeManagerLogin,
  updateManagerLogin,
} from '../branchAccess.service';
import { pickVendorContacts } from '../vendorRecipients';

const db = prisma as unknown as { $transaction: jest.Mock };

const branch = { id: 'b1', businessName: 'Mama Put - Rumuola', managerUserId: null as string | null };

function makeTx(overrides: { branch?: any; emailTaken?: boolean; phoneTaken?: boolean } = {}) {
  const found = overrides.branch === undefined ? branch : overrides.branch;
  return {
    vendor: {
      findFirst: jest.fn().mockResolvedValue(found),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.email && overrides.emailTaken) return { id: 'other' };
        if (where.phone && overrides.phoneTaken) return { id: 'other' };
        return null;
      }),
      create: jest.fn().mockResolvedValue({ id: 'mgr-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    pushSubscription: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(currentTx));
});

let currentTx: any = makeTx();

describe('generateTempPassword', () => {
  it('always meets the strength rules and is 12 characters', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(12);
      expect(isStrongPassword(p)).toBe(true);
    }
  });

  it('avoids look-alike characters and is not repeated', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const p = generateTempPassword();
      expect(p).not.toMatch(/[0OIl1]/);
      seen.add(p);
    }
    expect(seen.size).toBe(100);
  });
});

describe('isStrongPassword', () => {
  it('requires length, upper, lower, number and symbol', () => {
    expect(isStrongPassword('Str0ng!pass')).toBe(true);
    expect(isStrongPassword('short1!A')).toBe(true);
    expect(isStrongPassword('alllowercase1!')).toBe(false);
    expect(isStrongPassword('NoNumber!!')).toBe(false);
    expect(isStrongPassword('NoSymbol123')).toBe(false);
    expect(isStrongPassword('Ab1!')).toBe(false);
  });
});

describe('parseManagerInput', () => {
  it('accepts a full create body and normalises the email', () => {
    const r = parseManagerInput({ name: ' Ada Obi ', email: 'ADA@Example.com', phone: '08031234567' });
    expect(r.error).toBeUndefined();
    expect(r.data).toEqual({ name: 'Ada Obi', email: 'ada@example.com', phone: '08031234567' });
  });

  it('requires a name and an email when creating', () => {
    expect(parseManagerInput({ email: 'a@b.co' }).error).toMatch(/name/i);
    expect(parseManagerInput({ name: 'Ada' }).error).toMatch(/email/i);
  });

  it('rejects a bad email, phone or weak password', () => {
    expect(parseManagerInput({ name: 'Ada', email: 'nope' }).error).toMatch(/valid email/i);
    expect(parseManagerInput({ name: 'Ada', email: 'a@b.co', phone: '12ab' }).error).toMatch(/phone/i);
    expect(parseManagerInput({ name: 'Ada', email: 'a@b.co', password: 'weak' }).error).toMatch(/Password needs/);
  });

  it('keeps a strong supplied password and treats a blank one as "generate for me"', () => {
    expect(parseManagerInput({ name: 'Ada', email: 'a@b.co', password: 'Str0ng!pass' }).data.password).toBe('Str0ng!pass');
    expect(parseManagerInput({ name: 'Ada', email: 'a@b.co', password: '' }).data.password).toBeUndefined();
  });

  it('allows partial updates', () => {
    expect(parseManagerInput({ phone: '' }, true)).toEqual({ data: { phone: null } });
    expect(parseManagerInput({}, true)).toEqual({ data: {} });
  });
});

describe('createManagerLogin', () => {
  it('creates a verified vendor-role user, links it to the branch and returns a temporary password once', async () => {
    const tx = makeTx();
    const r = await createManagerLogin(tx, 'owner-1', 'b1', { name: 'Ada', email: 'Ada@Example.com' });

    expect(r.email).toBe('ada@example.com');
    expect(r.temporaryPassword).toBeTruthy();
    expect(isStrongPassword(r.temporaryPassword!)).toBe(true);

    const data = tx.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ name: 'Ada', email: 'ada@example.com', role: 'VENDOR', isEmailVerified: true });
    expect(data.password).toBe(`hashed:${r.temporaryPassword}`); // stored hashed, never in clear text
    expect(tx.vendor.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { managerUserId: 'mgr-1' } });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('BRANCH_LOGIN_CREATED');
  });

  it('uses a password the owner chose and returns no temporary one', async () => {
    const tx = makeTx();
    const r = await createManagerLogin(tx, 'owner-1', 'b1', { name: 'Ada', email: 'a@b.co', password: 'Str0ng!pass' });
    expect(r.temporaryPassword).toBeNull();
    expect(tx.user.create.mock.calls[0][0].data.password).toBe('hashed:Str0ng!pass');
  });

  it("only works on a branch of the caller's own business", async () => {
    const tx = makeTx({ branch: null });
    await expect(createManagerLogin(tx, 'someone-else', 'b1', { name: 'Ada', email: 'a@b.co' })).rejects.toMatchObject({ status: 404 });
    expect(tx.vendor.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'b1', parent: { userId: 'someone-else' } });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('refuses a second login on the same branch', async () => {
    const tx = makeTx({ branch: { ...branch, managerUserId: 'mgr-0' } });
    await expect(createManagerLogin(tx, 'owner-1', 'b1', { name: 'Ada', email: 'a@b.co' })).rejects.toMatchObject({ status: 409 });
  });

  it('refuses an email or phone that already belongs to an account', async () => {
    await expect(createManagerLogin(makeTx({ emailTaken: true }), 'owner-1', 'b1', { name: 'Ada', email: 'a@b.co' }))
      .rejects.toThrow(/already registered/);
    await expect(createManagerLogin(makeTx({ phoneTaken: true }), 'owner-1', 'b1', { name: 'Ada', email: 'a@b.co', phone: '08031234567' }))
      .rejects.toThrow(/phone number/);
  });
});

describe('updateManagerLogin', () => {
  it('signs the manager out when access is switched off', async () => {
    currentTx = makeTx({ branch: { ...branch, managerUserId: 'mgr-1' } });
    await updateManagerLogin('owner-1', 'b1', { isActive: false });
    expect(currentTx.user.update).toHaveBeenCalledWith({ where: { id: 'mgr-1' }, data: { isActive: false, refreshToken: null } });
    expect(currentTx.auditLog.create.mock.calls[0][0].data.action).toBe('BRANCH_LOGIN_DISABLED');
  });

  it('turns access back on without touching sessions', async () => {
    currentTx = makeTx({ branch: { ...branch, managerUserId: 'mgr-1' } });
    await updateManagerLogin('owner-1', 'b1', { isActive: true });
    expect(currentTx.user.update).toHaveBeenCalledWith({ where: { id: 'mgr-1' }, data: { isActive: true } });
  });

  it('fails clearly when the branch has no login yet', async () => {
    currentTx = makeTx();
    await expect(updateManagerLogin('owner-1', 'b1', { name: 'New' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('resetManagerPassword', () => {
  it('sets a new hashed password and ends every existing session', async () => {
    currentTx = makeTx({ branch: { ...branch, managerUserId: 'mgr-1' } });
    const pw = await resetManagerPassword('owner-1', 'b1');
    expect(isStrongPassword(pw)).toBe(true);
    const data = currentTx.user.update.mock.calls[0][0].data;
    expect(data.password).toBe(`hashed:${pw}`);
    expect(data.refreshToken).toBeNull();
  });
});

describe('revokeManagerLogin', () => {
  it('closes the account, frees the email, unregisters devices and returns the branch to the owner', async () => {
    const tx = makeTx({ branch: { ...branch, managerUserId: 'mgr-1' } });
    await revokeManagerLogin(tx, 'owner-1', 'b1');

    expect(tx.vendor.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { managerUserId: null } });
    const data = tx.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ isActive: false, email: 'deleted-mgr-1@deleted.gobuyme.local', phone: null, refreshToken: null, pushToken: null });
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(tx.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'mgr-1' } });
  });

  it('does nothing when there is no login', async () => {
    const tx = makeTx();
    await revokeManagerLogin(tx, 'owner-1', 'b1');
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('pickVendorContacts (who hears about a branch order)', () => {
  const owner = { id: 'owner-1', phone: '+2348000000001', email: 'owner@x.co' };
  const manager = { id: 'mgr-1', phone: '+2348000000002', email: 'mgr@x.co', isActive: true };

  it('notifies only the owner when there is no manager', () => {
    expect(pickVendorContacts({ notifyOwnerOfOrders: true, user: owner, manager: null }).map((c) => c.userId)).toEqual(['owner-1']);
  });

  it("notifies the manager first (their own devices) and the owner too by default", () => {
    const c = pickVendorContacts({ notifyOwnerOfOrders: true, user: owner, manager });
    expect(c.map((x) => x.userId)).toEqual(['mgr-1', 'owner-1']);
    expect(c[0].isManager).toBe(true);
    expect(c[1].isManager).toBe(false);
  });

  it('leaves the owner out when they switched that off', () => {
    expect(pickVendorContacts({ notifyOwnerOfOrders: false, user: owner, manager }).map((c) => c.userId)).toEqual(['mgr-1']);
  });

  it('falls back to the owner when the manager login is disabled, even if the owner opted out', () => {
    expect(pickVendorContacts({ notifyOwnerOfOrders: false, user: owner, manager: { ...manager, isActive: false } }).map((c) => c.userId))
      .toEqual(['owner-1']);
  });
});
