'use client';

/**
 * App shell layout — shadcn + Tailwind rewrite.
 * Replaces the MUI Box/Container shell with semantic HTML + Tailwind.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { useUIStore } from '@/stores/ui-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CopilotRail } from '@/components/copilot/copilot-rail';
import { OnboardingTourProvider } from '@/components/onboarding/tour-provider';
import { TwoFactorNagBanner } from '@/components/security/TwoFactorNagBanner';
import { KeyboardShortcutOverlay } from '@/components/shared/KeyboardShortcutOverlay';
import { CommandPalette } from '@/components/layout/command-palette';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { JourneyRail } from '@/components/dashboards/journey-rail';
import { WhatsNewBanner } from '@/components/layout/whats-new-banner';
import { OfflineQueuePanel } from '@/components/layout/offline-queue-panel';

const SIDEBAR_WIDTH = 280;
const COLLAPSED_WIDTH = 72;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, checkSession } = useAuthStore();
  const network = useNetworkStore((s) => s.network);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  useTranslation();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!loading && !user) {
      // RBAC/UX fix (2026-07-09): a bare /login makes NetworkProvider CLEAR
      // the tenant override (it must never default to a tenant), so a
      // logged-out Proximate user would land on the neutral Kuja "K" login
      // with the wrong brand. Preserve the current tenant so they return to
      // their own branded login (e.g. /login?network=proximate).
      let target = '/login';
      try {
        const override = window.localStorage.getItem('kuja_network_override');
        if (override) target = `/login?network=${encodeURIComponent(override)}`;
      } catch {
        // localStorage unavailable — fall back to bare /login.
      }
      router.replace(target);
    }
  }, [user, loading, router]);

  if (loading) {
    // Network-aware loading placeholder. Falls back to the neutral Kuja "K"
    // when no tenant is resolved yet; on Proximate/NEAR it shows that
    // network's initial + brand colour instead of flashing the wrong brand.
    const brandInitial = (network?.name?.trim()?.[0] || 'K').toUpperCase();
    const brandColor = network?.brand_color_hex || '#C2410C';
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--kuja-quartz))]">
        <div className="flex flex-col items-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-xl shadow-lg"
            style={{ background: `linear-gradient(to bottom right, ${brandColor}, #1f1205)` }}
          >
            <span className="kuja-display text-2xl text-white">{brandInitial}</span>
          </div>
          <div
            className="h-1 w-24 rounded animate-pulse"
            style={{ background: `linear-gradient(to right, ${brandColor}, #F97316, ${brandColor})` }}
          />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const currentWidth = sidebarCollapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <OnboardingTourProvider>
      {/* Phase 4 — offline indicator. Slim amber banner when navigator.onLine
          is false; green "back online" flash on reconnect. Sits above the
          2FA banner since "the app can't reach the server" is more urgent. */}
      <OfflineBanner />
      {/* Phase 13.15 — 2FA nag banner above the app shell. Self-gated:
          renders only for admin users without TOTP enrolled. Dismissible
          per-day via localStorage. */}
      <TwoFactorNagBanner />
      {/* Phase 2 — Skip-to-main link for keyboard / screen-reader users.
          Hidden until focused, jumps past the sidebar to the main content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-md focus:bg-[hsl(var(--kuja-clay))] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>
      <div className="relative min-h-screen bg-[hsl(var(--kuja-quartz))]">
        <Sidebar width={SIDEBAR_WIDTH} collapsedWidth={COLLAPSED_WIDTH} />
        {/* Sidebar is `hidden lg:block`, so only pad for it at lg+. On
            mobile the content needs the full viewport width — applying
            the desktop padding unconditionally caused horizontal overflow
            (633px doc on a 390px screen). */}
        <div
          className="flex flex-col min-h-screen transition-[padding-left] duration-200 ease-in-out lg:[padding-left:var(--sidebar-w)]"
          style={{ ['--sidebar-w' as string]: `${currentWidth}px` }}
        >
          <Header />
          {/* Phase 99 — persistent NGO journey rail above main content.
              Self-gated to user.role==='ngo' and hidden on /dashboard
              where the full <JourneyTracker> renders. Dismissible per
              session. */}
          <JourneyRail />
          {/* Phase 99 — "what's new since you last visited" digest.
              Self-gated: only shows if the digest has items AND the user
              has visited before (localStorage marker). Dismissible. */}
          <WhatsNewBanner />
          <main
            id="main-content"
            role="main"
            aria-label="Main content"
            tabIndex={-1}
            className="flex-1 py-6 px-4 sm:px-6 lg:px-8 focus:outline-none"
          >
            <div className="mx-auto max-w-[1400px]">
              {children}
            </div>
          </main>
        </div>
        <CopilotRail />
        {/* Phase 100 — offline outbox manual-review panel. Self-gated:
            only renders if there are queued mutations the server
            rejected on reconnect. Dismissible. */}
        <OfflineQueuePanel />
        {/* Phase 13.17 — global keyboard shortcut overlay. Cmd/? opens.
            Self-gated: only listens for keydown events; no UI when closed. */}
        <KeyboardShortcutOverlay />
        {/* Phase 2 — Cmd+K command palette. Listens for Cmd/Ctrl+K and "/"
            anywhere in the app. */}
        <CommandPalette />
      </div>
    </OnboardingTourProvider>
  );
}
