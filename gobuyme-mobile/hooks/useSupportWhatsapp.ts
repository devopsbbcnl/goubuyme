import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/services/api';

// Fallback used until the live number loads (or if the request fails offline).
export const DEFAULT_SUPPORT_WHATSAPP = '2347078901075';
const STORAGE_KEY = '@gbm/support_whatsapp';

let cached: string | null = null;

/** Live support WhatsApp number (GET /vendors/support-contact), editable in admin Settings. */
export function useSupportWhatsapp(): string {
  const [number, setNumber] = useState<string>(cached ?? DEFAULT_SUPPORT_WHATSAPP);

  useEffect(() => {
    let cancelled = false;
    // Last known number first, so it works offline right after launch.
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (!cancelled && saved && /^\d{10,15}$/.test(saved)) setNumber(saved);
      })
      .catch(() => {});
    api.get('/vendors/support-contact')
      .then(res => {
        const n = res.data?.data?.whatsapp;
        if (typeof n === 'string' && /^\d{10,15}$/.test(n)) {
          cached = n;
          if (!cancelled) setNumber(n);
          AsyncStorage.setItem(STORAGE_KEY, n).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return number;
}
