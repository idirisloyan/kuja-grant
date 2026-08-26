// ============================================================================
// Hard app reset — the escape hatch for a stuck client.
//
// A PWA can wedge in ways a normal reload doesn't fix: a stale service worker
// still controlling the page, a poisoned cache, a half-valid session, an old
// build pinned in the tab. When a user is stuck (e.g. bounced back to /login
// with no way forward), this clears ALL of that and returns them to a clean
// login:
//   1. best-effort server logout (so the session is genuinely cleared)
//   2. unregister every service worker controlling this origin
//   3. delete every Cache Storage bucket (shell + static + api)
//   4. clear local/session storage (preserving only the tenant, so a branded
//      tenant returns to its OWN login rather than the neutral Kuja one)
//   5. hard-reload to /login, cache-busted
//
// Every step is wrapped so one failure never blocks the rest — the reload at
// the end always runs.
// ============================================================================

const TENANT_KEY = 'kuja_network_override';

export async function hardResetApp(): Promise<void> {
  // 1. Server logout — best effort. X-Requested-With satisfies the CSRF guard
  //    for bodyless fetches; a failure here still proceeds to the local wipe.
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
  } catch {
    /* offline or already logged out — keep going */
  }

  // Remember the tenant so a branded tenant lands back on its own login.
  let tenant: string | null = null;
  try {
    tenant = window.localStorage.getItem(TENANT_KEY);
  } catch {
    /* storage unavailable */
  }

  // 2. Unregister service workers.
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
    }
  } catch {
    /* SW API unavailable */
  }

  // 3. Delete all caches.
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => undefined)));
    }
  } catch {
    /* Cache API unavailable */
  }

  // 4. Clear storage, then restore only the tenant hint.
  try { window.localStorage.clear(); } catch { /* noop */ }
  try { window.sessionStorage.clear(); } catch { /* noop */ }
  if (tenant) {
    try { window.localStorage.setItem(TENANT_KEY, tenant); } catch { /* noop */ }
  }

  // 5. Hard reload to a clean, cache-busted login on this same host.
  try {
    const url = new URL('/login', window.location.origin);
    if (tenant) url.searchParams.set('network', tenant);
    url.searchParams.set('_reset', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.href = '/login';
  }
}
