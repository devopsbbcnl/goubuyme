'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, normalizeScreen, trackScreen } from '@/services/analytics';

/** Mounted once in the (shop) root layout: starts analytics and records page views. */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => { initAnalytics(); }, []);
  useEffect(() => { if (pathname) trackScreen(normalizeScreen(pathname)); }, [pathname]);

  return null;
}
