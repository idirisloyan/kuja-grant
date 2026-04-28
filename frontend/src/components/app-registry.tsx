'use client';

import { ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';

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

export function AppRegistry({ children }: { children: ReactNode }) {
  useEffect(() => {
    installRSCConsoleSilencer();
    installStaleBuildDetector();
  }, []);

  return (
    <>
      {children}
      <Toaster richColors position="top-right" />
    </>
  );
}
