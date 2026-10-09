import { OrderStatus } from '@prisma/client';
import {
  canAdminCancel,
  canAssignRider,
  checkGoodwillCredit,
  rankRidersByDistance,
} from '../orderRules';

describe('canAdminCancel', () => {
  it('allows every non-terminal status', () => {
    for (const s of [
      OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING,
      OrderStatus.READY, OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT,
    ]) {
      expect(canAdminCancel(s)).toBe(true);
    }
  });

  it('refuses delivered and already-cancelled orders', () => {
    expect(canAdminCancel(OrderStatus.DELIVERED)).toBe(false);
    expect(canAdminCancel(OrderStatus.CANCELLED)).toBe(false);
  });
});

describe('canAssignRider', () => {
  it('only allows assignment while the order is READY at the vendor', () => {
    const allowed = Object.values(OrderStatus).filter(canAssignRider);
    expect(allowed).toEqual([OrderStatus.READY]);
  });
});

describe('checkGoodwillCredit', () => {
  const base = { alreadyIssued: 0, orderTotal: 10_000, isSuperAdmin: false, cap: 2000 };

  it('allows an ops admin up to the per-order cap', () => {
    expect(checkGoodwillCredit({ ...base, amount: 2000 })).toBeNull();
    expect(checkGoodwillCredit({ ...base, amount: 2000.01 })).toMatch(/at most ₦2,000/);
  });

  it('counts goodwill already issued on the same order against the cap', () => {
    expect(checkGoodwillCredit({ ...base, alreadyIssued: 1500, amount: 500 })).toBeNull();
    expect(checkGoodwillCredit({ ...base, alreadyIssued: 1500, amount: 501 })).toMatch(/at most ₦500 more/);
    expect(checkGoodwillCredit({ ...base, alreadyIssued: 2000, amount: 1 })).toMatch(/already been used/);
  });

  it('never lets the cap exceed the order total for small orders', () => {
    expect(checkGoodwillCredit({ ...base, orderTotal: 800, amount: 801 })).not.toBeNull();
    expect(checkGoodwillCredit({ ...base, orderTotal: 800, amount: 800 })).toBeNull();
  });

  it('lets a super admin go past the ops cap but not past the order total', () => {
    expect(checkGoodwillCredit({ ...base, isSuperAdmin: true, amount: 9000 })).toBeNull();
    expect(checkGoodwillCredit({ ...base, isSuperAdmin: true, amount: 10_001 })).not.toBeNull();
  });

  it('rejects zero, negative, non-finite and sub-kobo amounts', () => {
    for (const amount of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkGoodwillCredit({ ...base, amount })).toMatch(/greater than zero/);
    }
    expect(checkGoodwillCredit({ ...base, amount: 10.005 })).toMatch(/2 decimal places/);
  });

  it('accepts two-decimal amounts despite floating-point representation', () => {
    // 10.1 * 100 === 1010.0000000000001 in JS — must not be mistaken for a third decimal.
    expect(checkGoodwillCredit({ ...base, amount: 10.1 })).toBeNull();
    expect(checkGoodwillCredit({ ...base, amount: 0.29 })).toBeNull();
  });
});

describe('rankRidersByDistance', () => {
  // Simple planar distance keeps the expectations obvious; the real caller passes haversine.
  const planar = (lat1: number, lng1: number, lat2: number, lng2: number) => Math.hypot(lat2 - lat1, lng2 - lng1);
  const vendor = { latitude: 0, longitude: 0 };

  it('sorts nearest first and rounds to one decimal', () => {
    const ranked = rankRidersByDistance(
      [
        { id: 'far', latitude: 3, longitude: 4 },
        { id: 'near', latitude: 0.12, longitude: 0 },
      ],
      vendor,
      planar,
    );
    expect(ranked.map((r) => r.id)).toEqual(['near', 'far']);
    expect(ranked[0].distanceKm).toBe(0.1);
    expect(ranked[1].distanceKm).toBe(5);
  });

  it('puts riders with no known location last instead of dropping them', () => {
    const ranked = rankRidersByDistance(
      [
        { id: 'unknown', latitude: null, longitude: null },
        { id: 'known', latitude: 1, longitude: 0 },
      ],
      vendor,
      planar,
    );
    expect(ranked.map((r) => r.id)).toEqual(['known', 'unknown']);
    expect(ranked[1].distanceKm).toBeNull();
  });

  it('returns null distances when the vendor location is unknown', () => {
    const ranked = rankRidersByDistance(
      [{ id: 'a', latitude: 1, longitude: 1 }],
      { latitude: null, longitude: null },
      planar,
    );
    expect(ranked[0].distanceKm).toBeNull();
  });
});
