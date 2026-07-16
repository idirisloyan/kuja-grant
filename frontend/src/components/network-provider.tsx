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

  // Phase 32 demo override: on mount, read ?network=<slug> from the URL
  // and persist it to localStorage so every subsequent API call carries
  // X-Network-Override. Empty `?network=` clears the override.
  //
  // If the slug *changed* (vs what was previously stored), clear any
  // stale auth session and redirect to /login. UAT lesson: people
  // bookmark the URL with ?network=near, click it, and find themselves
  // already logged in as some user from a previous Kuja session — they
  // see the wrong tenant's experience pre-rendered with the right
  // tenant's brand. Forcing a logout when the tenant changes makes the
  // bookmark a true "enter this tenant" link.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      // Normalise trailing slashes so '/login' and '/login/' (static export)
      // both match.
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      if (params.has('network')) {
        const slug = (params.get('network') || '').trim().toLowerCase();
        const prev = (window.localStorage.getItem('kuja_network_override') || '').toLowerCase();
        const isTenantSwitch = slug !== prev;

        if (slug) {
          window.localStorage.setItem('kuja_network_override', slug);
        } else {
          window.localStorage.removeItem('kuja_network_override');
        }
        // Strip the query param from the URL to keep things tidy.
        params.delete('network');
        const newSearch = params.toString();
        const newUrl =
          window.location.pathname +
          (newSearch ? '?' + newSearch : '') +
          window.location.hash;
        window.history.replaceState({}, '', newUrl);
        // Force a network re-fetch so brand context updates immediately.
        useNetworkStore.setState({ network: null, loading: true });

        // On tenant switch, force re-auth so the user explicitly chooses
        // identity within the new tenant. POST /api/auth/logout is
        // tolerant of being called without an active session.
        if (isTenantSwitch && path !== '/login') {
          (async () => {
            try {
              await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
              });
            } catch {
              // ignore — proceed to login anyway
            }
            window.location.replace('/login');
          })();
        }
      } else if (path === '/login') {
        // No explicit ?network= signal AND we're on the login screen.
        // The login must NEVER default to a tenant: multiple teams test
        // different tenants on the same shared host, and a persisted
        // override from a previous ?network= visit (or switcher click)
        // would otherwise silently theme the login as that tenant — e.g.
        // "Welcome back to Proximate Fund" showing for a Kuja tester.
        //
        // Clearing the demo override here makes a bare /login start
        // neutral (default Kuja marketplace, resolved by host). Testers
        // then pick their tenant explicitly via the on-page switcher or
        // a ?network=<slug> link. Host-based resolution (real subdomains
        // like near.kuja.org) is untouched — it never wrote this key.
        const stale = window.localStorage.getItem('kuja_network_override');
        if (stale) {
          window.localStorage.removeItem('kuja_network_override');
          // Drop the stale-branded network so loadNetwork() re-resolves
          // from the host on this same mount (neutral base).
          useNetworkStore.setState({ network: null, loading: true });
        }
      }
    } catch {
      // localStorage / URL parsing failed — silently skip.
    }
  }, []);

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

    // Tenant app identity (2026-07-16, PF brand guide): favicon,
    // apple-touch icon and PWA manifest all swap to the active
    // tenant's asset set under /tenants/<slug>/. Every tenant ships
    // its own icons — Proximate's is the official brand-guide mark;
    // Kuja/NEAR get brand-colored letter tiles until they have marks.
    if (network?.slug) {
      const setLink = (rel: string, href: string, type?: string) => {
        let el = document.querySelector(
          `link[rel="${rel}"]`,
        ) as HTMLLinkElement | null;
        if (!el) {
          el = document.createElement('link');
          el.rel = rel;
          document.head.appendChild(el);
        }
        if (type) el.type = type;
        if (el.getAttribute('href') !== href) el.setAttribute('href', href);
      };
      setLink('icon', `/tenants/${network.slug}/favicon-32.png`, 'image/png');
      setLink('apple-touch-icon', `/tenants/${network.slug}/icon-180.png`);
      setLink('manifest', `/tenants/${network.slug}/manifest.webmanifest`);
      const themeMeta = document.querySelector(
        'meta[name="theme-color"]',
      ) as HTMLMetaElement | null;
      if (themeMeta && network.brand_color_hex) {
        themeMeta.content = network.brand_color_hex;
      }
    }

    // Set <html lang="..."> so screen readers + the browser pick up
    // the network's default language before the user authenticates.
    if (network?.default_language) {
      root.setAttribute('lang', network.default_language);
    }

    // Update the document.title so the browser tab shows the tenant
    // name — important for visual confirmation during multi-tenant UAT.
    if (network?.name) {
      const suffix = network.slug === 'kuja'
        ? ' — Grant intelligence'
        : ' — Network fund operations';
      document.title = network.name + suffix;
    }
  }, [network]);

  return <>{children}</>;
}
