import { getPlatformSettings } from '../settings.service';

jest.mock('../settings.service', () => ({
  getPlatformSettings: jest.fn(),
}));

// Imported after the mock so calcVendorFee/getCommissionRates pick up the
// mocked settings.service instead of hitting Prisma.
import { calcVendorFee, getCommissionRates } from '../commission.service';

const mockedGetPlatformSettings = getPlatformSettings as jest.MockedFunction<typeof getPlatformSettings>;

describe('calcVendorFee', () => {
  it('takes 3% platform commission for TIER_1', async () => {
    mockedGetPlatformSettings.mockResolvedValue({
      tier1CommissionPercent: 3,
      tier2CommissionPercent: 7.5,
    } as any);

    const result = await calcVendorFee(10000, 'TIER_1');
    expect(result.platformFee).toBe(300);
    expect(result.netAmount).toBe(9700);
    expect(result.platformRate).toBe(0.03);
    expect(result.vendorRate).toBe(0.97);
  });

  it('takes 7.5% platform commission for TIER_2', async () => {
    mockedGetPlatformSettings.mockResolvedValue({
      tier1CommissionPercent: 3,
      tier2CommissionPercent: 7.5,
    } as any);

    const result = await calcVendorFee(10000, 'TIER_2');
    expect(result.platformFee).toBe(750);
    expect(result.netAmount).toBe(9250);
  });

  it('reflects admin-adjusted commission rates from platform settings, not just the hardcoded defaults', async () => {
    // Confirms calcVendorFee actually reads live settings rather than
    // silently falling back to 3%/7.5% no matter what an admin configures.
    mockedGetPlatformSettings.mockResolvedValue({
      tier1CommissionPercent: 5,
      tier2CommissionPercent: 10,
    } as any);

    const result = await calcVendorFee(2000, 'TIER_1');
    expect(result.platformFee).toBe(100); // 5% of 2000
    expect(result.netAmount).toBe(1900);
  });

  it('platform fee and net amount stay within a kobo of the subtotal, but are NOT always exact', async () => {
    // platformFee and netAmount are rounded independently (Math.round on each
    // separately) instead of one being derived from the other, so they can
    // land a kobo off the true subtotal on some inputs — e.g. subtotal=1 on
    // TIER_2 (7.5%) gives platformFee=0.08 + netAmount=0.93 = 1.01, one kobo
    // over. This test documents that gap rather than asserting a false
    // invariant; it's flagged separately since correcting the rounding
    // touches real payment/payout amounts and is a judgment call, not
    // something to change silently from a test file.
    mockedGetPlatformSettings.mockResolvedValue({
      tier1CommissionPercent: 3,
      tier2CommissionPercent: 7.5,
    } as any);

    for (const subtotal of [0, 1, 999, 15000, 123456.78]) {
      const result = await calcVendorFee(subtotal, 'TIER_2');
      const sum = Math.round((result.platformFee + result.netAmount) * 100) / 100;
      expect(Math.abs(sum - subtotal)).toBeLessThanOrEqual(0.010001);
    }
  });

  it('reproduces the known one-kobo rounding drift for subtotal=1 on TIER_2', async () => {
    mockedGetPlatformSettings.mockResolvedValue({
      tier1CommissionPercent: 3,
      tier2CommissionPercent: 7.5,
    } as any);

    const result = await calcVendorFee(1, 'TIER_2');
    expect(result.platformFee).toBe(0.08);
    expect(result.netAmount).toBe(0.93);
    expect(result.platformFee + result.netAmount).toBe(1.01); // one kobo over subtotal
  });

  it('falls back to the hardcoded default rates (3% / 7.5%) if platform settings are unavailable', async () => {
    // settings.service.getPlatformSettings hits Prisma — if the DB call
    // fails, commission calculation must not throw and take down checkout;
    // it should degrade to the documented defaults instead.
    mockedGetPlatformSettings.mockRejectedValue(new Error('DB unreachable'));

    const result = await calcVendorFee(10000, 'TIER_1');
    expect(result.platformRate).toBe(0.03);
    expect(result.platformFee).toBe(300);
  });
});

describe('getCommissionRates', () => {
  it('vendor rate is always 1 minus the platform rate, for both tiers', async () => {
    mockedGetPlatformSettings.mockResolvedValue({
      tier1CommissionPercent: 3,
      tier2CommissionPercent: 7.5,
    } as any);

    const { PLATFORM_RATES, VENDOR_RATES } = await getCommissionRates();
    expect(PLATFORM_RATES.TIER_1 + VENDOR_RATES.TIER_1).toBeCloseTo(1);
    expect(PLATFORM_RATES.TIER_2 + VENDOR_RATES.TIER_2).toBeCloseTo(1);
  });
});
