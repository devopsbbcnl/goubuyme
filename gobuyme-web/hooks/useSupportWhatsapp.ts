import { useEffect, useState } from 'react';
import api from '@/services/api';

// Fallback used until the live number loads (or if the request fails).
export const DEFAULT_SUPPORT_WHATSAPP = '2347078901075';

let cached: string | null = null;

/** Digits in international format, e.g. 2347078901075 → "+234 707 890 1075". */
export function formatWhatsapp(n: string): string {
  const m = /^234(\d{3})(\d{3})(\d{4})$/.exec(n);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : `+${n}`;
}

/** Live support WhatsApp number (GET /vendors/support-contact), editable in admin Settings. */
export function useSupportWhatsapp(): string {
  const [number, setNumber] = useState<string>(cached ?? DEFAULT_SUPPORT_WHATSAPP);

  useEffect(() => {
    if (cached) return;
    api.get('/vendors/support-contact')
      .then(res => {
        const n = res.data?.data?.whatsapp;
        if (typeof n === 'string' && /^\d{10,15}$/.test(n)) {
          cached = n;
          setNumber(n);
        }
      })
      .catch(() => {});
  }, []);

  return number;
}
