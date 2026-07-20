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

  it('BUG: perKmRate on the open-ended last bucket is never applied — every distance past its minimum charges the same flat fee', () => {
    // calculateBucketFee's first condition is:
    //   bucket.maxDistanceKm === null || distanceKm < bucket.maxDistanceKm
    // For the terminal bucket (maxDistanceKm === null), that's always true,
    // so it returns bucket.fee immediately. The perKmRate branch right below
    // it is dead code — it can never run, because the condition above it
    // already caught `maxDistanceKm === null` and returned first.
    //
    // Net effect: a customer at 10.1km and a customer at 100km are charged
    // the exact same fee (1000) despite this bucket having a perKmRate of
    // 100 configured — that rate is silently ignored for every order past
    // the last bounded bucket. This test documents the CURRENT production
    // behavior, not the intended one — flagged separately, not fixed here,
    // since correcting it changes live delivery pricing and is a business
    // call, not a unit-test call.
    expect(calculateBucketFee(10.1, buckets).fee).toBe(1000);
    expect(calculateBucketFee(100, buckets).fee).toBe(1000); // same fee as 10.1km
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
