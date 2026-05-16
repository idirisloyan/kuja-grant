/**
 * Kuja service worker — Phase 4 (Global South affordances).
 *
 * Two responsibilities:
 *   1. Push notifications (Phase 13.34) — handles VAPID push + click-through.
 *   2. Offline shell caching (Phase 4) — caches the navigation HTML and
 *      static chunks so the app loads instantly on revisit and degrades
 *      gracefully on patchy connections.
 *
 * Strategy:
 *   - install:     pre-cache nothing (avoid version-mismatch surprises).
 *   - fetch:       network-first with cache fallback for navigation;
 *                  cache-first for /_next/static (immutable assets).
 *   - activate:    purge any old caches whose version doesn't match.
 *
 * API requests (/api/*) ARE NOT cached — the user always needs fresh
 * permission checks, fresh data, fresh AI output. If the network is
 * offline the request just fails and the UI shows its existing error.
 */

// Bumped Phase 14: portfolio + calendar PDF + win/loss debrief shipped.
// Old SW shells reference chunks that no longer exist; the activate
// step purges any cache that doesn't match this prefix so the next
// page open re-fetches the current bundle.
const CACHE_VERSION = 'kuja-v14-0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Files that make sense to keep around so a cold offline open shows something
const SHELL_URLS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined),    // never block install on a network hiccup
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => !k.startsWith(CACHE_VERSION))
        .map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Never cache API or auth requests
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for immutable static chunks
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Network-first for HTML navigations (so users always get the latest build)
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }
});

async function networkFirst(request, cacheName) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone()).catch(() => undefined);
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Final fallback: the cached root shell
    const shellRoot = await caches.match('/');
    if (shellRoot) return shellRoot;
    return new Response('You are offline. Reconnect to load this page.', {
      status: 503, headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone()).catch(() => undefined);
    }
    return fresh;
  } catch (e) {
    return new Response('', { status: 504 });
  }
}

// ---------------------------------------------------------------------------
// Push notifications (Phase 13.34 — unchanged)
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = { title: 'Kuja', body: 'You have a new notification', url: '/' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) { /* payload-less push: keep defaults */ }

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
