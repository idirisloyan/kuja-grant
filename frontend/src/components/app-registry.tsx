'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { PWAInstallBanner } from './shared/pwa-install-banner';
import { NetworkProvider } from './network-provider';
import { useTranslation } from '@/lib/hooks/use-translation';

// ---------------------------------------------------------------------------
// AppRegistry — thin client wrapper.
//
// Previously wrapped children in an MUI <ThemeProvider> + <CssBaseline>.
// With the migration to shadcn/Tailwind complete, we no longer need MUI's
// theme engine. Design tokens now live in globals.css (Kuja-Studio CSS
// custom properties) and Tailwind utility classes.
// ---------------------------------------------------------------------------

// Phase 10.11 — RSC fallback console silencer (safety net).
// Even with the server-side `0:null\n` minimal-Flight-payload fix, some
// browsers / Next.js versions still occasionally log "Failed to fetch
// RSC payload" because the Flight parser had a transient parse hiccup.
// The page renders correctly via hard navigation either way. This
// silencer scopes a single, specific console.error message — every
// other error keeps logging normally.
function installRSCConsoleSilencer() {
  if (typeof window === 'undefined') return;
  // Idempotent: don't double-wrap if already installed.
  const w = window as unknown as { __rscSilencerInstalled?: boolean };
  if (w.__rscSilencerInstalled) return;
  w.__rscSilencerInstalled = true;

  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === 'string' &&
      first.includes('Failed to fetch RSC payload') &&
      first.includes('Falling back to browser navigation')
    ) {
      // Static-export-mode noise; the hard nav fallback is by design.
      return;
    }
    originalError.apply(console, args);
  };
}

// Phase 12 — stale-build auto-reload.
// The team's Apr 28 retest hit a stale browser cache: their HTML was
// pinned to build yA8uSRLL while the live deploy was already on
// w3iyZdrPc. The HTML headers correctly say `cache-control: no-store`,
// but Playwright/persistent browser sessions can still hold the parsed
// document. To guarantee that fresh deploys land instantly without the
// user clicking "hard refresh," we poll the index HTML on visibility
// change + focus and force a reload when the server's buildId differs
// from the buildId baked into our currently-loaded page.
//
// The check uses HEAD-equivalent fetch with `cache: 'no-store'`. Tiny
// payload, fires only when the user returns to the tab — never during
// active interaction.
function installStaleBuildDetector() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    __staleBuildDetectorInstalled?: boolean;
    __NEXT_DATA__?: { buildId?: string };
  };
  if (w.__staleBuildDetectorInstalled) return;
  w.__staleBuildDetectorInstalled = true;

  const ourBuildId = w.__NEXT_DATA__?.buildId;
  if (!ourBuildId) return;

  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== 'visible') return;
    checking = true;
    try {
      const res = await fetch('/?_buildcheck=1', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) return;
      const text = await res.text();
      // The buildId appears in __NEXT_DATA__ as `"buildId":"<id>"`
      const match = /"buildId":"([^"]+)"/.exec(text);
      if (match && match[1] && match[1] !== ourBuildId) {
        // Reload bypassing the cache. Use a query string to defeat any
        // intermediate caching layer and force a clean fetch.
        const url = new URL(window.location.href);
        url.searchParams.set('_v', match[1].slice(0, 8));
        window.location.replace(url.toString());
      }
    } catch {
      // Network blip; try again next visibility change.
    } finally {
      checking = false;
    }
  };

  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  // Also check 90 seconds after first paint to catch users who never
  // tab away — captures the case where the user is mid-session when
  // a deploy lands.
  window.setTimeout(check, 90_000);
}

// Phase 4 — eager service worker registration so the offline cache layer
// kicks in for everyone (not only users who grant push permission).
// Idempotent: navigator.serviceWorker.register returns the existing
// registration if /sw.js is already controlling this scope.
function installServiceWorker(onUpdate: () => void) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Fire `onUpdate` once when a NEW build's service worker has installed while
  // an old one still controls the page — that's an update the user hasn't
  // picked up yet. (The stale-build detector auto-reloads on tab focus, but a
  // PWA kept open and focused can sit on an old build; this surfaces a manual
  // "Refresh" so the user is never stuck on a stale version.)
  let prompted = false;
  const fire = () => { if (!prompted) { prompted = true; onUpdate(); } };
  const watch = (reg: ServiceWorkerRegistration) => {
    if (reg.waiting && navigator.serviceWorker.controller) fire();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) fire();
      });
    });
    // Proactively re-check for a new build when the user returns to the tab.
    window.addEventListener('focus', () => { reg.update().catch(() => undefined); });
  };

  // Defer to after first paint so it never competes with the initial render.
  const register = () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => { if (reg) watch(reg); })
      .catch(() => {
        // Silent — SW failure shouldn't block the app. The user just loses
        // offline shell + caching benefits, not core functionality.
      });
  };
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

export function AppRegistry({ children }: { children: ReactNode }) {
  // Keep the latest translator in a ref so the SW-update toast (fired from an
  // async event, possibly much later) speaks the user's CURRENT language.
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    installRSCConsoleSilencer();
    installStaleBuildDetector();
    installServiceWorker(() => {
      toast(tRef.current('sw.update_available'), {
        duration: Infinity,
        action: {
          label: tRef.current('sw.refresh'),
          onClick: () => window.location.reload(),
        },
      });
    });
  }, []);

  return (
    <NetworkProvider>
      {children}
      <Toaster richColors position="top-right" />
      <PWAInstallBanner />
    </NetworkProvider>
  );
}
