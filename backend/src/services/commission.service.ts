import { CommissionTier } from '@prisma/client';
import { getPlatformSettings } from './settings.service';

const DEFAULT_PLATFORM_RATES: Record<CommissionTier, number> = {
  TIER_1: 0.03,
  TIER_2: 0.075,
};

export interface CommissionBreakdown {
  platformFee: number;
  netAmount: number;
  platformRate: number;
  vendorRate: number;
  tier: CommissionTier;
}

const loadPlatformRates = async (): Promise<Record<CommissionTier, number>> => {
  try {
    const settings = await getPlatformSettings();
    return {
      TIER_1: settings.tier1CommissionPercent / 100,
      TIER_2: settings.tier2CommissionPercent / 100,
    };
  } catch {
    return DEFAULT_PLATFORM_RATES;
  }
};

export const calcVendorFee = async (subtotal: number, tier: CommissionTier): Promise<CommissionBreakdown> => {
  const rates = await loadPlatformRates();
  const platformRate = rates[tier] ?? rates.TIER_2;
  const vendorRate = 1 - platformRate;
  const platformFee = Math.round(subtotal * platformRate * 100) / 100;
  const netAmount = Math.round(subtotal * vendorRate * 100) / 100;
  return { platformFee, netAmount, platformRate, vendorRate, tier };
};

export const getCommissionRates = async () => {
  const PLATFORM_RATES = await loadPlatformRates();
  const VENDOR_RATES: Record<CommissionTier, number> = {
    TIER_1: 1 - PLATFORM_RATES.TIER_1,
    TIER_2: 1 - PLATFORM_RATES.TIER_2,
  };
  return { PLATFORM_RATES, VENDOR_RATES };
};
