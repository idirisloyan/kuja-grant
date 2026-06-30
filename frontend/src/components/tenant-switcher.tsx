'use client';

// ============================================================================
// TenantSwitcher — Phase 708 (2026-06-30).
//
// Three-button segmented control that flips the browser between the three
// live tenants on the same backend:
//
//   - Kuja      (default, multi-role marketplace)
//   - NEAR      (closed network — OB + NGO members)
//   - Proximate (Sudan humanitarian fund — OB + donor + partner)
//
// The selection writes `kuja_network_override` to localStorage; every
// subsequent API call's `X-Network-Override` header is set from that key by
// the centralized api client. The existing NetworkProvider already
// re-fetches /api/network/current on store reset, so brand colour and the
// login page's demo cards swap automatically.
//
// Behaviour matrix:
//   - On /login: in-place swap (no logout, no redirect). Just re-reads
//     the new tenant's branding + demo accounts.
//   - Elsewhere: forces logout + redirect to /login so the user explicitly
//     picks identity within the new tenant. This matches the
//     NetworkProvider's `?network=` URL-param behaviour for parity.
//
// Why a segmented control and not a dropdown: with only three options the
// menu adds a click for no benefit. Chips also make "which tenant am I in
// right now" answerable at a glance.
// ============================================================================

import { useNetworkStore } from '@/stores/network-store';

type TenantSlug = 'kuja' | 'near' | 'proximate';

const TENANTS: { slug: TenantSlug; label: string; sub: string }[] = [
  { slug: 'kuja', label: 'Kuja', sub: 'Marketplace' },
  { slug: 'near', label: 'NEAR', sub: 'Closed network' },
  { slug: 'proximate', label: 'Proximate', sub: 'Sudan fund' },
];

interface TenantSwitcherProps {
  /** When true (default) clicking a chip on a non-login page logs the
   *  user out + redirects to /login. On /login itself the swap is
   *  in-place. */
  redirectOnSwitch?: boolean;
  /** Visual density. 'compact' is the navbar variant; 'spacious' is the
   *  login-card variant. */
  size?: 'compact' | 'spacious';
}

export function TenantSwitcher({
  redirectOnSwitch = true,
  size = 'spacious',
}: TenantSwitcherProps) {
  const network = useNetworkStore((s) => s.network);

  // Resolve the current slug. The /api/network/current response sets it;
  // before the store has loaded we read straight from localStorage so the
  // chip highlight is correct on first paint.
  let current: TenantSlug = 'kuja';
  if (network?.slug && (network.slug === 'near' || network.slug === 'proximate')) {
    current = network.slug;
  } else if (typeof window !== 'undefined') {
    try {
      const stored = (window.localStorage.getItem('kuja_network_override') || '').toLowerCase();
      if (stored === 'near' || stored === 'proximate') current = stored;
    } catch {
      // localStorage unavailable — fall through to 'kuja'.
    }
  }

  const handleSwitch = (slug: TenantSlug) => {
    if (slug === current) return;
    if (typeof window === 'undefined') return;

    try {
      if (slug === 'kuja') {
        window.localStorage.removeItem('kuja_network_override');
      } else {
        window.localStorage.setItem('kuja_network_override', slug);
      }
    } catch {
      // localStorage blocked (private mode / strict cookie settings) —
      // fall back to URL-driven swap so the user can still switch.
      const url = new URL(window.location.href);
      url.searchParams.set('network', slug === 'kuja' ? '' : slug);
      window.location.href = url.toString();
      return;
    }

    const onLogin = window.location.pathname === '/login'
      || window.location.pathname.startsWith('/login/');

    if (!redirectOnSwitch || onLogin) {
      // In-place: reset the store and let NetworkProvider re-fetch.
      useNetworkStore.setState({ network: null, loading: true });
      void useNetworkStore.getState().loadNetwork();
      return;
    }

    // Off-login: logout + redirect so the user re-authenticates inside
    // the new tenant. Mirrors NetworkProvider's tenant-switch path.
    (async () => {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
      } catch {
        // ignore — proceed anyway
      }
      window.location.replace('/login');
    })();
  };

  const compact = size === 'compact';

  return (
    <div
      role="tablist"
      aria-label="Tenant"
      className={
        'inline-flex items-center rounded-lg bg-muted/60 p-1 ' +
        (compact ? 'gap-0.5' : 'gap-1')
      }
    >
      {TENANTS.map((t) => {
        const active = t.slug === current;
        return (
          <button
            key={t.slug}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => handleSwitch(t.slug)}
            className={
              'relative rounded-md transition-all ' +
              (compact
                ? 'px-2.5 py-1 text-xs '
                : 'px-3.5 py-2 text-sm ') +
              (active
                ? 'bg-background text-foreground shadow-sm font-semibold ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40')
            }
          >
            <span className={compact ? '' : 'block leading-tight'}>
              {t.label}
            </span>
            {!compact && (
              <span className="block text-[10px] uppercase tracking-wide opacity-70 leading-tight mt-0.5">
                {t.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
