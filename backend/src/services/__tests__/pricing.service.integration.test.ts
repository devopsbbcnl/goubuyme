// Unlike pricing.service.test.ts (which tests the pure calculateBucketFee/
// calculateSurcharges helpers directly), this file mocks Prisma and
// getDistance to verify calculateDeliveryFee's full assembly — base fee,
// bucket fee, surcharges, area multiplier, surge multiplier, and the max-fee
// cap all combine and round in the order the real function actually applies
// them, not just that each piece is individually correct in isolation.

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    pricingProfile: { findFirst: jest.fn() },
    vendorPricingOverride: { findUnique: jest.fn() },
    deliveryZone: { findFirst: jest.fn() },
    pricingBucket: { findMany: jest.fn() },
    pricingModifier: { findMany: jest.fn() },
    surgeEvent: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../distance.service', () => ({
  getDistance: jest.fn(),
}));

import prisma from '../../config/db';
import { getDistance } from '../distance.service';
import { calculateDeliveryFee } from '../pricing.service';

const mockPrisma = prisma as unknown as {
  pricingProfile: { findFirst: jest.Mock };
  vendorPricingOverride: { findUnique: jest.Mock };
  deliveryZone: { findFirst: jest.Mock };
  pricingBucket: { findMany: jest.Mock };
  pricingModifier: { findMany: jest.Mock };
  surgeEvent: { findMany: jest.Mock };
  $queryRaw: jest.Mock;
};
const mockGetDistance = getDistance as jest.Mock;

const BASE_PROFILE = {
  id: 'profile-1',
  name: 'Lagos Standard',
  country: 'Nigeria',
  state: 'Lagos',
  city: 'Ikeja',
  baseFee: 500,
  minimumFee: 300,
  maximumFee: 2000,
  riderPayoutPercentage: null,
};

const ONE_BUCKET = [{ minDistanceKm: 0, maxDistanceKm: 10, fee: 600, perKmRate: null }];

function setupMocks(overrides: {
  distanceKm?: number;
  profile?: typeof BASE_PROFILE;
  buckets?: any[];
  modifiers?: any[];
  zone?: any;
  surges?: any[];
  vendorOverride?: any;
  riderPayoutPercentage?: number;
} = {}) {
  mockGetDistance.mockResolvedValue({
    distanceKm: overrides.distanceKm ?? 8,
    durationMinutes: 20,
  });
  mockPrisma.pricingProfile.findFirst.mockResolvedValue(overrides.profile ?? BASE_PROFILE);
  mockPrisma.vendorPricingOverride.findUnique.mockResolvedValue(overrides.vendorOverride ?? null);
  mockPrisma.pricingBucket.findMany.mockResolvedValue(overrides.buckets ?? ONE_BUCKET);
  mockPrisma.pricingModifier.findMany.mockResolvedValue(overrides.modifiers ?? []);
  mockPrisma.deliveryZone.findFirst.mockResolvedValue(overrides.zone ?? null);
  mockPrisma.surgeEvent.findMany.mockResolvedValue(overrides.surges ?? []);
  // $queryRaw is called twice: once by findDeliveryZone (landmark-keyword
  // lookup) and once at the end for platform_settings — first call must
  // resolve to [] so findDeliveryZone falls through to its findFirst
  // fallback above, rather than short-circuiting on a fake zone match.
  mockPrisma.$queryRaw
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ riderPayoutPercentage: overrides.riderPayoutPercentage ?? 80 }]);
}

const INPUT = {
  vendorLat: 6.6,
  vendorLng: 3.35,
  customerLat: 6.62,
  customerLng: 3.36,
  vendorId: 'vendor-1',
  country: 'Nigeria',
  state: 'Lagos',
  city: 'Ikeja',
};

describe('calculateDeliveryFee (full pipeline)', () => {
  it('assembles base fee + bucket fee + surcharge + area multiplier into the final fee, and derives rider payout from the result', async () => {
    setupMocks({
      zone: { id: 'zone-1', name: 'Ikeja Zone', type: 'CITY', multiplier: 1.2 },
      modifiers: [{ name: 'Fuel', type: 'FIXED', value: 100, isActive: true, surchargeType: 'FUEL' }],
      riderPayoutPercentage: 80,
    });

    const result = await calculateDeliveryFee(INPUT);

    // (500 base + 600 bucket + 100 fuel surcharge) * 1.2 area multiplier * 1.0 surge = 1440
    expect(result.baseFee).toBe(500);
    expect(result.bucketFee).toBe(600);
    expect(result.areaMultiplier).toBe(1.2);
    expect(result.surgeMultiplier).toBe(1);
    expect(result.finalFee).toBe(1440);

    // Rider payout is derived from the FINAL fee (post-multiplier), not the base.
    expect(result.estimatedRiderPayout).toBe(Math.ceil(1440 * 0.8)); // 1152
  });

  it('caps the final fee at the pricing profile\'s maximumFee, even after multipliers would push it higher', async () => {
    setupMocks({
      distanceKm: 8,
      zone: { id: 'zone-2', name: 'Surge Zone', type: 'CITY', multiplier: 2 }, // pushes well past the 2000 cap
    });

    const result = await calculateDeliveryFee(INPUT);

    // (500 + 600) * 2 = 2200, which exceeds maximumFee (2000) — must clamp.
    expect(result.finalFee).toBe(2000);
  });

  it('raises the base fee up to minimumFee if a vendor override sets it lower than the profile allows', async () => {
    setupMocks({
      vendorOverride: { pricingProfileId: 'profile-1', isActive: true, baseFee: 100, perKmRate: null, maxFee: null },
    });
    mockPrisma.vendorPricingOverride.findUnique.mockResolvedValue({
      vendorId: 'vendor-1',
      pricingProfileId: 'profile-1',
      isActive: true,
      baseFee: 100, // below BASE_PROFILE.minimumFee (300)
      perKmRate: null,
      maxFee: null,
    });

    const result = await calculateDeliveryFee(INPUT);
    expect(result.baseFee).toBe(300); // clamped up to minimumFee, override ignored
  });

  it('rounds the final fee up to the nearest whole currency unit', async () => {
    setupMocks({
      zone: { id: 'zone-3', name: 'Fraction Zone', type: 'CITY', multiplier: 1.0001 },
    });

    const result = await calculateDeliveryFee(INPUT);
    expect(Number.isInteger(result.finalFee)).toBe(true);
  });

  it('throws if no pricing profile can be resolved, instead of silently charging nothing', async () => {
    setupMocks({ profile: null as any });
    mockPrisma.pricingProfile.findFirst.mockResolvedValue(null);

    await expect(calculateDeliveryFee(INPUT)).rejects.toThrow('No active pricing profile found');
  });
});

describe('calculateDeliveryFee (free-delivery threshold)', () => {
  const withThreshold = (threshold: number | null) =>
    ({ ...BASE_PROFILE, freeDeliveryThreshold: threshold } as any);

  it('flags free delivery when the subtotal meets the threshold, without altering the gross fee', async () => {
    setupMocks({ profile: withThreshold(5000) });

    const result = await calculateDeliveryFee({ ...INPUT, subtotal: 5000 });

    expect(result.freeDeliveryThreshold).toBe(5000);
    expect(result.freeDeliveryApplied).toBe(true);
    // The distance-based fee is preserved so callers can display/strike it and pay the rider.
    expect(result.finalFee).toBeGreaterThan(0);
  });

  it('does not flag free delivery when the subtotal is below the threshold', async () => {
    setupMocks({ profile: withThreshold(5000) });

    const result = await calculateDeliveryFee({ ...INPUT, subtotal: 4999 });

    expect(result.freeDeliveryApplied).toBe(false);
  });

  it('does not flag free delivery when the profile has no threshold set', async () => {
    setupMocks({ profile: withThreshold(null) });

    const result = await calculateDeliveryFee({ ...INPUT, subtotal: 999999 });

    expect(result.freeDeliveryThreshold).toBeNull();
    expect(result.freeDeliveryApplied).toBe(false);
  });

  it('does not flag free delivery when no subtotal is provided', async () => {
    setupMocks({ profile: withThreshold(5000) });

    const result = await calculateDeliveryFee(INPUT);

    expect(result.freeDeliveryApplied).toBe(false);
  });
});
