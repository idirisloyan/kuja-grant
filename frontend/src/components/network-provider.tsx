'use client';

// ============================================================================
// NetworkProvider — Phase 32 (May 2026).
//
// Boots the network store on mount and applies the resolved brand colour
// to the document root as CSS custom properties. Components that already
// consume --primary / --kuja-clay via Tailwind/shadcn will reskin
// automatically without any further changes.
//
// We translate the hex from /api/network/current into the HSL components
// used by the shadcn tokens (--primary, --ring, --kuja-clay) so the swap
// is seamless. Light/dark mode is unaffected.
//
// On failure we leave the defaults in place — the system still renders.
// ============================================================================

import { ReactNode, useEffect } from 'react';
import { useNetworkStore } from '@/stores/network-store';

/** Convert '#RRGGBB' to 'H S% L%' string for shadcn-style hsl(var(--x)). */
function hexToHslComponents(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const intVal = parseInt(m[1], 16);
  const r = ((intVal >> 16) & 0xff) / 255;
  const g = ((intVal >> 8) & 0xff) / 255;
  const b = (intVal & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  const H = Math.round(h * 360);
  const S = Math.round(s * 100);
  const L = Math.round(l * 100);
  return `${H} ${S}% ${L}%`;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const network = useNetworkStore((s) => s.network);
  const loadNetwork = useNetworkStore((s) => s.loadNetwork);

  // Load on mount. The store coalesces concurrent calls so multiple
  // providers / pages mounting at once is safe.
  useEffect(() => {
    loadNetwork();
  }, [loadNetwork]);

  // Apply brand colour to the document root whenever it changes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const hex = network?.brand_color_hex;
    const root = document.documentElement;

    // Always expose the raw hex too — useful for non-Tailwind surfaces
    // (favicon dynamic generators, OG cards, etc.).
    if (hex) {
      root.style.setProperty('--network-brand-hex', hex);
      const hsl = hexToHslComponents(hex);
      if (hsl) {
        // Reskin the shadcn primary + ring tokens, plus the Kuja-specific
        // --kuja-clay so any component that opted into that token reskins
        // too. We deliberately do NOT touch destructive / accent colours —
        // semantic meaning stays consistent across networks.
        root.style.setProperty('--primary', hsl);
        root.style.setProperty('--ring', hsl);
        root.style.setProperty('--kuja-clay', hsl);
      }
    }

    // Set <html lang="..."> so screen readers + the browser pick up
    // the network's default language before the user authenticates.
    if (network?.default_language) {
      root.setAttribute('lang', network.default_language);
    }
  }, [network]);

  return <>{children}</>;
}
