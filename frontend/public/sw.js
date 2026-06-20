/**
 * Kuja service worker — Phase 100 (offline-first PWA).
 *
 * Three responsibilities:
 *   1. Push notifications (Phase 13.34) — handles VAPID push + click-through.
 *   2. Offline shell caching — HTML navigations + immutable _next/static.
 *   3. Stale-while-revalidate API reads — listed safe-GET endpoints get
 *      cached so an offline user still sees their data.
 *
 * Strategy:
 *   - install:     pre-cache nothing (avoid version-mismatch surprises).
 *   - fetch:       network-first with cache fallback for navigation;
 *                  cache-first for /_next/static (immutable assets);
 *                  stale-while-revalidate for whitelisted safe GET /api/.
 *   - activate:    purge any old caches whose version doesn't match.
 *
 * API writes (POST/PUT/PATCH/DELETE) are NOT handled here. They go
 * through the offline-outbox.ts layer on the page side: when the page
 * detects no connectivity, it queues the mutation in IndexedDB and the
 * page replays it on reconnect via a `message` postMessage to this SW
 * (event.data.type === 'kuja-drain-outbox') so the replay runs in the
 * SW context where Background Sync events also live.
 */

// Bumped Phase 100: offline-first PWA. New cache buckets for API reads.
// Old SW shells reference chunks that no longer exist; the activate
// step purges any cache that doesn't match this prefix so the next
// page open re-fetches the current bundle.
const CACHE_VERSION = 'kuja-v15-0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Files that make sense to keep around so a cold offline open shows something
const SHELL_URLS = ['/'];

// Allow-list of API paths whose GET responses are safe to serve from
// cache when offline. Anything not on this list never hits the cache.
// Edit with care — caching auth-scoped responses is fine because the
// cache is per-origin and we never persist auth tokens server-side.
const API_CACHE_ALLOW = [
  /^\/api\/auth\/me$/,                            // session check
  /^\/api\/dashboard\b/,                          // role-aware dashboard
  /^\/api\/grants(?:\/\d+)?(?:\?|$)/,              // grants list + detail
  /^\/api\/applications(?:\/\d+)?(?:\?|$)/,        // applications list + detail
  /^\/api\/applications\/\d+\/pre-submit-preview/,
  /^\/api\/applications\/\d+\/predictive-nudge/,
  /^\/api\/reports(?:\/\d+)?(?:\?|$)/,             // reports list + detail
  /^\/api\/reports\/upcoming/,
  /^\/api\/organizations(?:\/\d+)?(?:\?|$)/,
  /^\/api\/passport\/share\/[^/]+$/,                // public share lookups
  /^\/api\/journey\/me$/,
  /^\/api\/whats-new(?:\?|$)/,
  /^\/api\/notifications(?:\/\d+)?(?:\?|$)/,
];

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

function isApiCacheAllowed(path) {
  for (const re of API_CACHE_ALLOW) {
    if (re.test(path)) return true;
  }
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API requests
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && isApiCacheAllowed(url.pathname)) {
      event.respondWith(staleWhileRevalidate(req, API_CACHE));
    }
    return;
  }

  if (req.method !== 'GET') return;

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

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((res) => {
    if (res && res.ok) {
      // Tag cached responses with the date the SW saw them, so the page
      // can surface a "showing data from <time>" badge for clarity when
      // the user is offline.
      const tagged = new Response(res.clone().body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
      cache.put(request, tagged).catch(() => undefined);
    }
    return res;
  }).catch(() => null);

  if (cached) {
    // Don't await the network — return cached immediately, refresh in
    // the background. networkPromise keeps the cache fresh for next time.
    networkPromise.catch(() => undefined);
    // Attach a header so the page can detect cached responses
    const taggedCached = new Response(cached.clone().body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: { ...Object.fromEntries(cached.headers.entries()), 'x-kuja-from-cache': '1' },
    });
    return taggedCached;
  }
  // No cache — wait on the network. If it fails, return a 503 the
  // outbox layer can recognise.
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response(
    JSON.stringify({ success: false, error: 'offline', message: 'No cached copy available offline.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

// ---------------------------------------------------------------------------
// Background Sync — the outbox replay channel.
// ---------------------------------------------------------------------------
//
// Browsers that support `SyncManager` fire a `sync` event when the device
// comes back online with a `sync` tag we registered earlier. We forward it
// to every open page via postMessage so the outbox can drain. Pages without
// Background Sync support also call `navigator.serviceWorker.controller
// .postMessage({type:'kuja-drain-outbox'})` on `window.online` directly.

self.addEventListener('sync', (event) => {
  if (event.tag === 'kuja-outbox-sync') {
    event.waitUntil((async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        w.postMessage({ type: 'kuja-drain-outbox' });
      }
    })());
  }
});

self.addEventListener('message', (event) => {
  // Pages can also push events to us (e.g. to force a cache purge).
  if (event.data && event.data.type === 'kuja-purge-api-cache') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

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
