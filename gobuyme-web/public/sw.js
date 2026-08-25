// Minimal push-only service worker for the vendor dashboard's order alerts.
// Not a full offline/PWA cache layer — just enough to show a notification while
// the tab is backgrounded or closed, and focus/open the orders page on click.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'GoBuyMe', body: event.data.text() };
  }

  const { title = 'GoBuyMe', body = '', data = {}, requireInteraction = false } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.png',
      badge: '/icon.png',
      requireInteraction,
      data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = '/vendor/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes('/vendor/orders'));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});
