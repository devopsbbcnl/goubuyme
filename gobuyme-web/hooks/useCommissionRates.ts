import { useEffect, useState } from 'react';
import api from '@/services/api';

export interface TierRate {
  platformPercent: number;
  vendorPercent: number;
}

export interface CommissionRates {
  TIER_1: TierRate;
  TIER_2: TierRate;
}

export const DEFAULT_COMMISSION_RATES: CommissionRates = {
  TIER_1: { platformPercent: 3, vendorPercent: 97 },
  TIER_2: { platformPercent: 7.5, vendorPercent: 92.5 },
};

let cached: CommissionRates | null = null;

/** Live platform commission rates (GET /vendors/commission-rates), with defaults until loaded. */
export function useCommissionRates(): CommissionRates {
  const [rates, setRates] = useState<CommissionRates>(cached ?? DEFAULT_COMMISSION_RATES);

  useEffect(() => {
    if (cached) return;
    api.get('/vendors/commission-rates')
      .then(res => {
        const data = res.data?.data as CommissionRates | undefined;
        if (data?.TIER_1?.platformPercent != null && data?.TIER_2?.platformPercent != null) {
          cached = data;
          setRates(data);
        }
      })
      .catch(() => {});
  }, []);

  return rates;
}
