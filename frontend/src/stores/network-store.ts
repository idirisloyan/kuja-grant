// ============================================================================
// Kuja Grant Management System — Network Store (Zustand)
// Phase 32 (May 2026).
//
// Holds the resolved Network for this browser session. Loaded once on app
// boot from `/api/network/current`. Used by:
//   - <NetworkProvider> to apply the brand colour as CSS custom properties
//   - The login page to show the right product name + logo
//   - The chrome (nav, footer) to swap branding
//
// We do NOT cache cross-session — the backend resolution is host-aware and
// can change if the user navigates between subdomains.
// ============================================================================

import { create } from 'zustand';

export interface NetworkBrand {
  id: number | null;
  slug: string;
  name: string;
  mission_short?: string | null;
  brand_logo_url?: string | null;
  /** Raw hex like '#C2410C'. Use hexToHsl() to convert for shadcn tokens. */
  brand_color_hex?: string | null;
  default_language: string;
  home_url?: string | null;
  default_currency: string;
  is_default: boolean;
  is_active: boolean;
  assessment_framework_display?: string | null;
  features: Record<string, unknown>;
}

interface NetworkState {
  network: NetworkBrand | null;
  loading: boolean;
  /** Hit /api/network/current once on boot. Idempotent; safe to call repeatedly. */
  loadNetwork: () => Promise<void>;
}

const API_BASE =
  // Match the same env used by lib/api.ts. Falls back to same-origin.
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE) ||
  '/api';

let inflight: Promise<void> | null = null;

export const useNetworkStore = create<NetworkState>((set, get) => ({
  network: null,
  loading: true,

  loadNetwork: async () => {
    // Coalesce concurrent callers (provider mounts + login page mounts).
    if (inflight) return inflight;
    if (get().network && !get().loading) return;

    inflight = (async () => {
      try {
        // Read the localStorage tenant override (set by NetworkProvider
        // when ?network=<slug> is present in the URL). The centralized
        // api.ts client injects this header automatically, but this
        // store uses raw fetch() for its bootstrap call, so we mirror
        // the logic here.
        const headers: Record<string, string> = {};
        if (typeof window !== 'undefined') {
          try {
            const override = window.localStorage.getItem('kuja_network_override');
            if (override) headers['X-Network-Override'] = override;
          } catch {
            // localStorage unavailable — skip silently.
          }
        }
        // Phase 614 — never block /login on a slow API call. If the
        // bootstrap can't return in 5s the page falls back to the
        // default Kuja brand (which is what `network: null` already
        // renders). UAT timeouts on Railway cold-start were repeatedly
        // ~60s; capping at 5s makes /login interactive immediately.
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = ctrl
          ? window.setTimeout(() => ctrl.abort(), 5000)
          : null;
        const res = await fetch(`${API_BASE}/network/current`, {
          credentials: 'include',
          headers,
          signal: ctrl?.signal,
          // No CSRF header needed for a public GET.
        });
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        if (!res.ok) {
          set({ loading: false });
          return;
        }
        const data = (await res.json()) as { success: boolean; network: NetworkBrand };
        if (data?.success && data.network) {
          set({ network: data.network, loading: false });
        } else {
          set({ loading: false });
        }
      } catch {
        // Network/CORS hiccup — render with defaults rather than crashing.
        set({ loading: false });
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  },
}));
