'use client';

import { useEffect } from 'react';
import api from '@/services/api';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0))) as BufferSource;
}

/** Registers the vendor dashboard's service worker and subscribes it to Web Push,
 * so a new order alerts the vendor even when the tab isn't focused. No-ops silently
 * if the browser doesn't support push, permission is denied, or VAPID isn't configured. */
export function useVendorPushSubscription(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) return;

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
        }
        if (Notification.permission !== 'granted') return;
        if (cancelled) return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
        }

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

        await api.post('/vendors/me/push-subscriptions', {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });
      } catch {
        // Push is a nice-to-have here — socket + SMS/email cover the same alert.
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);
}
