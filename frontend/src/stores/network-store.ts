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
        const res = await fetch(`${API_BASE}/network/current`, {
          credentials: 'include',
          // No CSRF header needed for a public GET.
        });
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
