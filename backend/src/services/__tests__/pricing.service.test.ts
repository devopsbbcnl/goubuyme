import { calculateBucketFee, calculateSurcharges } from '../pricing.service';

describe('calculateBucketFee', () => {
  const buckets = [
    { minDistanceKm: 0, maxDistanceKm: 5, fee: 500, perKmRate: null },
    { minDistanceKm: 5, maxDistanceKm: 10, fee: 800, perKmRate: null },
    { minDistanceKm: 10, maxDistanceKm: null, fee: 1000, perKmRate: 100 },
  ];

  it('picks the flat fee for a distance inside a bounded bucket', () => {
    expect(calculateBucketFee(3, buckets).fee).toBe(500);
    expect(calculateBucketFee(9.9, buckets).fee).toBe(800);
  });

  it('a bucket boundary belongs to the bucket starting there, not the one ending there', () => {
    // minDistanceKm is inclusive, maxDistanceKm is exclusive — 5km is bucket 2
    // (min 5), not bucket 1 (max 5).
    expect(calculateBucketFee(5, buckets).fee).toBe(800);
  });

  it('applies perKmRate to extra distance past the open-ended last bucket, instead of a flat fee no matter how far', () => {
    // Previously fixed bug: the terminal bucket's flat-fee condition
    // (`maxDistanceKm === null`) short-circuited before the perKmRate branch
    // could ever run, so any distance past the last bounded bucket paid the
    // same flat fee regardless of how far past it was. Now extra distance
    // beyond minDistanceKm is billed at perKmRate.
    // At 10.1km: 1000 flat + (0.1km extra * 100/km) = 1010.
    expect(calculateBucketFee(10.1, buckets).fee).toBeCloseTo(1010);
    // At 15km: 1000 flat + (5km extra * 100/km) = 1500 — scales with distance,
    // unlike the old flat-1000-forever behavior.
    expect(calculateBucketFee(15, buckets).fee).toBe(1500);
  });

  it('an open-ended bucket with no perKmRate configured still falls back to its flat fee', () => {
    const flatOnlyBuckets = [
      { minDistanceKm: 0, maxDistanceKm: 5, fee: 500, perKmRate: null },
      { minDistanceKm: 5, maxDistanceKm: null, fee: 900, perKmRate: null },
    ];
    expect(calculateBucketFee(50, flatOnlyBuckets).fee).toBe(900);
  });

  it('falls back to the first bucket fee if no bucket matches (e.g. an empty distance)', () => {
    expect(calculateBucketFee(-1, buckets).fee).toBe(500);
  });

  it('is not sensitive to the input array order, since it sorts by minDistanceKm first', () => {
    const shuffled = [buckets[2], buckets[0], buckets[1]];
    expect(calculateBucketFee(7, shuffled).fee).toBe(800);
  });
});

describe('calculateSurcharges', () => {
  const modifier = (overrides: Partial<Record<string, any>>) => ({
    name: 'test-modifier',
    type: 'FIXED',
    value: 100,
    isActive: true,
    surchargeType: 'FUEL',
    ...overrides,
  });

  it('applies a NIGHT_DELIVERY surcharge between 9PM and 6AM, not during the day', () => {
    const modifiers = [modifier({ surchargeType: 'NIGHT_DELIVERY', value: 200 })];

    const atNight = calculateSurcharges(modifiers, new Date('2026-01-01T22:00:00'));
    expect(atNight).toHaveLength(1);
    expect(atNight[0].amount).toBe(200);

    const atNoon = calculateSurcharges(modifiers, new Date('2026-01-01T12:00:00'));
    expect(atNoon).toHaveLength(0);
  });

  it('applies a RAIN surcharge only when weather condition is RAIN or HEAVY_RAIN', () => {
    const modifiers = [modifier({ surchargeType: 'RAIN', type: 'PERCENTAGE', value: 10 })];

    expect(calculateSurcharges(modifiers, new Date(), 'RAIN')).toHaveLength(1);
    expect(calculateSurcharges(modifiers, new Date(), 'HEAVY_RAIN')).toHaveLength(1);
    expect(calculateSurcharges(modifiers, new Date(), 'CLEAR')).toHaveLength(0);
    expect(calculateSurcharges(modifiers, new Date())).toHaveLength(0);
  });

  it('applies a HIGH_TRAFFIC surcharge only when traffic level is HIGH', () => {
    const modifiers = [modifier({ surchargeType: 'HIGH_TRAFFIC', type: 'PERCENTAGE', value: 15 })];

    expect(calculateSurcharges(modifiers, new Date(), undefined, 'HIGH')).toHaveLength(1);
    expect(calculateSurcharges(modifiers, new Date(), undefined, 'LOW')).toHaveLength(0);
    expect(calculateSurcharges(modifiers, new Date(), undefined, 'MEDIUM')).toHaveLength(0);
  });

  it('FUEL and EMERGENCY surcharges always apply whenever active, regardless of time/weather/traffic', () => {
    const modifiers = [
      modifier({ surchargeType: 'FUEL', value: 50 }),
      modifier({ surchargeType: 'EMERGENCY', type: 'PERCENTAGE', value: 20 }),
    ];

    const result = calculateSurcharges(modifiers, new Date('2026-01-01T12:00:00'));
    expect(result).toHaveLength(2);
  });

  it('an inactive modifier never applies, even if its condition is otherwise met', () => {
    const modifiers = [modifier({ surchargeType: 'FUEL', isActive: false })];
    expect(calculateSurcharges(modifiers, new Date())).toHaveLength(0);
  });

  it('stacks multiple simultaneously-applicable surcharges instead of only applying one', () => {
    const modifiers = [
      modifier({ surchargeType: 'NIGHT_DELIVERY', value: 200 }),
      modifier({ surchargeType: 'RAIN', type: 'PERCENTAGE', value: 10 }),
      modifier({ surchargeType: 'FUEL', value: 50 }),
    ];
    const result = calculateSurcharges(modifiers, new Date('2026-01-01T23:00:00'), 'RAIN');
    expect(result).toHaveLength(3);
  });
});
