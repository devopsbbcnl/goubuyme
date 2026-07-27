// Mocks Prisma to verify evaluatePromo's validation gates (active, expiry, vendor scope,
// minimum order, prior redemption) and the discount it computes per promo type.

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    offer: { findUnique: jest.fn() },
    offerRedemption: { findUnique: jest.fn() },
  },
}));

import prisma from '../../config/db';
import { evaluatePromo } from '../offer.service';

const mockPrisma = prisma as unknown as {
  offer: { findUnique: jest.Mock };
  offerRedemption: { findUnique: jest.Mock };
};

const BASE_OFFER = {
  id: 'offer-1',
  code: 'SAVE10',
  discount: 10,
  isPercent: true,
  minOrder: 1000,
  vendorId: null as string | null,
  expiresAt: null as Date | null,
  isActive: true,
};

const ARGS = { code: 'save10', userId: 'user-1', vendorId: 'vendor-1', subtotal: 5000 };

function setup(offer: Partial<typeof BASE_OFFER> | null, redeemed = false) {
  mockPrisma.offer.findUnique.mockResolvedValue(offer ? { ...BASE_OFFER, ...offer } : null);
  mockPrisma.offerRedemption.findUnique.mockResolvedValue(redeemed ? { id: 'r-1' } : null);
}

beforeEach(() => jest.clearAllMocks());

describe('evaluatePromo', () => {
  it('computes a percentage discount off the subtotal', async () => {
    setup({ isPercent: true, discount: 10 });
    const r = await evaluatePromo(ARGS);
    expect(r.valid).toBe(true);
    expect(r.type).toBe('percent');
    expect(r.subtotalDiscount).toBe(500); // 10% of 5000
    expect(r.freeDelivery).toBe(false);
  });

  it('caps a flat discount at the subtotal so the total never goes negative', async () => {
    setup({ isPercent: false, discount: 8000 });
    const r = await evaluatePromo({ ...ARGS, subtotal: 5000 });
    expect(r.type).toBe('flat');
    expect(r.subtotalDiscount).toBe(5000);
  });

  it('treats a zero non-percent discount as a free-delivery promo', async () => {
    setup({ isPercent: false, discount: 0 });
    const r = await evaluatePromo(ARGS);
    expect(r.type).toBe('free_delivery');
    expect(r.freeDelivery).toBe(true);
    expect(r.subtotalDiscount).toBe(0);
  });

  it('rejects an unknown or inactive code', async () => {
    setup(null);
    expect((await evaluatePromo(ARGS)).valid).toBe(false);
    setup({ isActive: false });
    expect((await evaluatePromo(ARGS)).valid).toBe(false);
  });

  it('rejects an expired code', async () => {
    setup({ expiresAt: new Date(Date.now() - 1000) });
    expect((await evaluatePromo(ARGS)).valid).toBe(false);
  });

  it('rejects when the subtotal is below the minimum order', async () => {
    setup({ minOrder: 10000 });
    expect((await evaluatePromo({ ...ARGS, subtotal: 5000 })).valid).toBe(false);
  });

  it('rejects a vendor-scoped code used on a different vendor', async () => {
    setup({ vendorId: 'vendor-2' });
    expect((await evaluatePromo({ ...ARGS, vendorId: 'vendor-1' })).valid).toBe(false);
  });

  it('rejects a code the customer has already redeemed', async () => {
    setup({}, true);
    const r = await evaluatePromo(ARGS);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/already used/i);
  });
});
