/**
 * Kuja service worker — Phase 13.34.
 *
 * Minimal: handles 'push' events from the VAPID push service and
 * 'notificationclick' to focus / open the relevant URL.
 *
 * Registered by the frontend at /sw.js. Static-export Next.js serves
 * this from public/sw.js → root scope.
 */

self.addEventListener('install', (event) => {
  // Activate immediately on first install — no caching layer here.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Kuja', body: 'You have a new notification', url: '/' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    // Some pushes are payload-less; keep defaults.
  }
  const options = {
    body: payload.body,
    icon: '/svg/empty-states.svg',
    badge: '/svg/empty-states.svg',
    data: { url: payload.url || '/' },
    tag: payload.tag,
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(payload.title || 'Kuja', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(targetUrl) && 'focus' in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
