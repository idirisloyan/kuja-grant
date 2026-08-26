// ============================================================================
// Tenant classification — the single source of truth for "what kind of tenant
// is this browser session in".
//
// WHY THIS EXISTS
// The app historically inferred "is this a NEAR-style network?" from
// `network.slug !== 'kuja'`. That check FAILS OPEN: every non-Kuja tenant
// (Proximate, Saxansaxo, and any future tenant) was treated as a network and
// silently inherited network-only vocabulary and behaviour — the "you are part
// of a network" onboarding wizard, the "Network fund operations" login copy,
// the "Network fund" sidebar tagline. Proximate is a community fund, NOT a
// network; Saxansaxo is an ops console, NOT a network.
//
// Classify tenants EXPLICITLY here, and default anything unrecognised to a
// neutral 'branded' kind — never 'network' — so network framing can never leak
// into a tenant that isn't one. A per-network `features.tenant_kind` value
// (served by the backend in /api/network/current) overrides the slug map, so a
// genuinely-new network can be onboarded by setting a flag rather than editing
// this file.
// ============================================================================

export type TenantKind = 'hub' | 'network' | 'fund' | 'ops' | 'branded';

interface TenantLike {
  slug?: string | null;
  features?: Record<string, unknown> | null;
}

// Known tenants, classified by what they actually are.
const KNOWN_KINDS: Record<string, TenantKind> = {
  kuja: 'hub', // the multi-tenant marketplace / hub
  near: 'network', // NEAR — a genuine closed network of member NGOs
  proximate: 'fund', // Proximate — a community fund (NOT a network)
  saxansaxo: 'ops', // Saxansaxo (SCLR) — an ops-run response console
};

const VALID_KINDS: TenantKind[] = ['hub', 'network', 'fund', 'ops', 'branded'];

/**
 * Resolve a tenant's kind. A backend `features.tenant_kind` override wins so a
 * new tenant can be reclassified without a code change; otherwise we fall back
 * to the explicit slug map, and unknown slugs resolve to 'branded' —
 * deliberately NOT 'network' — so network-only vocabulary never leaks into an
 * unclassified tenant.
 */
export function tenantKind(network?: TenantLike | null): TenantKind {
  const override = network?.features?.['tenant_kind'];
  if (typeof override === 'string' && VALID_KINDS.includes(override as TenantKind)) {
    return override as TenantKind;
  }
  const slug = (network?.slug || 'kuja').toLowerCase();
  return KNOWN_KINDS[slug] ?? 'branded';
}

/**
 * True ONLY for genuine NEAR-style closed networks. Use this to gate network
 * vocabulary (the onboarding tour, "member of this network" copy, etc.).
 * Proximate and Saxansaxo are NOT networks and return false here.
 */
export function isNetworkTenant(network?: TenantLike | null): boolean {
  return tenantKind(network) === 'network';
}

/**
 * True for any branded single-tenant instance — i.e. anything that is not the
 * Kuja marketplace hub. Use this to gate hub-only affordances (the "apply to
 * join" CTA, the generic demo trio, etc.), NOT network vocabulary.
 */
export function isBrandedTenant(network?: TenantLike | null): boolean {
  return tenantKind(network) !== 'hub';
}
