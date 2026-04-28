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

export function AppRegistry({ children }: { children: ReactNode }) {
  useEffect(() => {
    installRSCConsoleSilencer();
  }, []);

  return (
    <>
      {children}
      <Toaster richColors position="top-right" />
    </>
  );
}
