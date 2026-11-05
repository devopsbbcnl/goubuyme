// A branch is its own vendor (own menu, stock, hours, listing) owned by the same account.

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: { vendor: { updateMany: jest.fn() } },
}));

import prisma from '../../config/db';
import {
  BranchError,
  MAX_BRANCHES,
  branchBusinessName,
  copyMenu,
  createBranchVendor,
  syncBranchesWithParent,
} from '../branch.service';

const db = prisma as unknown as { vendor: { updateMany: jest.Mock } };

const parent: any = {
  id: 'main-1', userId: 'owner-1', parentVendorId: null, businessName: 'Mama Put', state: 'Rivers',
  category: 'RESTAURANT', subcategory: null, description: 'Good food', logo: 'logo.png', logoPosition: '50% 50%',
  coverImage: 'cover.png', coverPosition: null, timezone: 'Africa/Lagos', openingTime: '08:00', closingTime: '21:00',
  avgDeliveryTime: 30, commissionTier: 'TIER_2', isPharmacyFlagged: false, approvalStatus: 'APPROVED',
};

const input = { name: 'Rumuola', address: '5 Rumuola Rd', city: 'Port Harcourt', latitude: 4.84, longitude: 7.02, phone: '08031234567' };

function makeTx(overrides: Record<string, any> = {}) {
  return {
    vendor: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'branch-1', ...data })),
      ...overrides.vendor,
    },
    vendorBusinessHours: {
      findMany: jest.fn().mockResolvedValue([{ dayOfWeek: 1, openTime: '08:00', closeTime: '20:00' }]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    menuItem: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      ...overrides.menuItem,
    },
  } as any;
}

beforeEach(() => jest.clearAllMocks());

describe('branchBusinessName', () => {
  it('prefixes the main business so every listing stays recognisable', () => {
    expect(branchBusinessName('Mama Put', '  Rumuola ')).toBe('Mama Put - Rumuola');
  });
});

describe('createBranchVendor', () => {
  it('creates a separate vendor owned by the same account, linked to the main business', async () => {
    const tx = makeTx();
    const branch = await createBranchVendor(tx, parent, input);
    const data = tx.vendor.create.mock.calls[0][0].data;

    expect(data.userId).toBe('owner-1');
    expect(data.parentVendorId).toBe('main-1');
    expect(data.businessName).toBe('Mama Put - Rumuola');
    expect(data.branchLabel).toBe('Rumuola');
    expect(data.address).toBe('5 Rumuola Rd');
    expect(data.latitude).toBe(4.84);
    expect(data.contactPhone).toBe('08031234567');
    expect(data.slug).toMatch(/^mama-put-rumuola-[0-9a-f]{6}$/);
    expect(branch.id).toBe('branch-1');
  });

  it('starts presentable: copies look, category, tier and approval, but starts closed', async () => {
    const tx = makeTx();
    await createBranchVendor(tx, parent, input);
    const data = tx.vendor.create.mock.calls[0][0].data;

    expect(data).toMatchObject({
      category: 'RESTAURANT', description: 'Good food', logo: 'logo.png', coverImage: 'cover.png',
      commissionTier: 'TIER_2', approvalStatus: 'APPROVED', openingTime: '08:00', isOpen: false,
    });
  });

  it('copies opening hours but never the menu (menu and stock are per location)', async () => {
    const tx = makeTx();
    await createBranchVendor(tx, parent, input);
    expect(tx.vendorBusinessHours.createMany).toHaveBeenCalledWith({
      data: [{ dayOfWeek: 1, openTime: '08:00', closeTime: '20:00', vendorId: 'branch-1' }],
    });
    expect(tx.menuItem.create).not.toHaveBeenCalled();
  });

  it('mirrors a pending main business so the branch is not live before the main is approved', async () => {
    const tx = makeTx();
    await createBranchVendor(tx, { ...parent, approvalStatus: 'PENDING' }, input);
    expect(tx.vendor.create.mock.calls[0][0].data.approvalStatus).toBe('PENDING');
  });

  it('refuses a branch of a branch', async () => {
    await expect(createBranchVendor(makeTx(), { ...parent, parentVendorId: 'x' }, input)).rejects.toThrow(BranchError);
  });

  it('refuses an eleventh branch with a 409', async () => {
    const tx = makeTx({ vendor: { count: jest.fn().mockResolvedValue(MAX_BRANCHES) } });
    await expect(createBranchVendor(tx, parent, input)).rejects.toMatchObject({ status: 409 });
    expect(tx.vendor.create).not.toHaveBeenCalled();
  });

  it('refuses a duplicate location name with a 409', async () => {
    const tx = makeTx({ vendor: { findFirst: jest.fn().mockResolvedValue({ id: 'other' }) } });
    await expect(createBranchVendor(tx, parent, input)).rejects.toThrow(/already have a location/);
    expect(tx.vendor.create).not.toHaveBeenCalled();
  });
});

describe('copyMenu', () => {
  it('copies items with their extras and options but resets stock to zero', async () => {
    const tx = makeTx({
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'Jollof', description: 'Spicy', price: 2500, image: 'j.png', imagePosition: null, category: 'Mains',
            isAvailable: true, isFeatured: true, stockQuantity: 40,
            drinkOptions: [{ name: 'Zobo', price: 500, isAvailable: true }],
            optionGroups: [{ name: 'Protein', required: true, items: [{ name: 'Chicken', extraPrice: 800, isAvailable: true }] }],
          },
        ]),
      },
    });

    const n = await copyMenu(tx, 'main-1', 'branch-1');
    expect(n).toBe(1);

    const data = tx.menuItem.create.mock.calls[0][0].data;
    expect(data.vendorId).toBe('branch-1');
    expect(data.stockQuantity).toBe(0);
    expect(data.price).toBe(2500);
    expect(data.drinkOptions.create).toEqual([{ name: 'Zobo', price: 500, isAvailable: true }]);
    expect(data.optionGroups.create[0].items.create).toEqual([{ name: 'Chicken', extraPrice: 800, isAvailable: true }]);
  });
});

describe('syncBranchesWithParent', () => {
  it('copies approval and tier to branches', async () => {
    await syncBranchesWithParent('main-1', { approvalStatus: 'APPROVED', commissionTier: 'TIER_1' });
    expect(db.vendor.updateMany).toHaveBeenCalledWith({
      where: { parentVendorId: 'main-1' },
      data: { approvalStatus: 'APPROVED', commissionTier: 'TIER_1' },
    });
  });

  it('closes branches when the main business is suspended or rejected', async () => {
    await syncBranchesWithParent('main-1', { approvalStatus: 'SUSPENDED' });
    expect(db.vendor.updateMany).toHaveBeenCalledWith({
      where: { parentVendorId: 'main-1' },
      data: { approvalStatus: 'SUSPENDED', isOpen: false },
    });
  });

  it('does nothing when there is nothing to sync', async () => {
    await syncBranchesWithParent('main-1', {});
    expect(db.vendor.updateMany).not.toHaveBeenCalled();
  });
});
