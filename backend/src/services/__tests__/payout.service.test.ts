import { calcRiderEarning } from '../payout.service';

describe('calcRiderEarning', () => {
  it('splits a delivery fee 85% rider / 15% platform', () => {
    const result = calcRiderEarning(1000);
    expect(result).toEqual({
      grossAmount: 1000,
      platformCut: 150,
      netAmount: 850,
    });
  });

  it('rounds to 2 decimal places instead of leaving floating-point noise', () => {
    // 333 * 0.85 = 283.05, 333 * 0.15 = 49.95 — chosen because naive float
    // math on these particular inputs is exactly where rounding bugs show up.
    const result = calcRiderEarning(333);
    expect(result.netAmount).toBe(283.05);
    expect(result.platformCut).toBe(49.95);
  });

  it('the rider and platform cuts always add back up to the gross amount', () => {
    // The one invariant that actually matters financially: money in must
    // equal money out, for any delivery fee a real order could produce.
    for (const fee of [0, 1, 99, 500, 1500, 12345.67]) {
      const { grossAmount, platformCut, netAmount } = calcRiderEarning(fee);
      expect(Math.round((platformCut + netAmount) * 100) / 100).toBe(grossAmount);
    }
  });

  it('returns zero for a zero delivery fee', () => {
    expect(calcRiderEarning(0)).toEqual({ grossAmount: 0, platformCut: 0, netAmount: 0 });
  });
});
