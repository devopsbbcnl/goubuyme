import { CommissionTier } from '@prisma/client';

const PLATFORM_RATES: Record<CommissionTier, number> = {
  TIER_1: 0.03,
  TIER_2: 0.075,
};

const VENDOR_RATES: Record<CommissionTier, number> = {
  TIER_1: 0.97,
  TIER_2: 0.925,
};

export interface CommissionBreakdown {
  platformFee: number;
  netAmount: number;
  platformRate: number;
  vendorRate: number;
  tier: CommissionTier;
}

export const calcVendorFee = (subtotal: number, tier: CommissionTier): CommissionBreakdown => {
  const platformRate = PLATFORM_RATES[tier] ?? PLATFORM_RATES.TIER_2;
  const vendorRate = VENDOR_RATES[tier] ?? VENDOR_RATES.TIER_2;
  const platformFee = Math.round(subtotal * platformRate * 100) / 100;
  const netAmount = Math.round(subtotal * vendorRate * 100) / 100;
  return { platformFee, netAmount, platformRate, vendorRate, tier };
};

export const getCommissionRates = () => ({ PLATFORM_RATES, VENDOR_RATES });
