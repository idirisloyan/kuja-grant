// ============================================================================
// Kuja Grant licensing — client-side gate helper (Phase 2, frontend half).
//
// The GRANT app is the source of record for donor entitlements. When licence
// enforcement is ON (server env GRANT_LICENSING_ENFORCED=true) an unlicensed
// donor who tries to publish a grant or award an application gets a
// 403 { error: 'license_required' }. Rather than surface that as a raw error
// toast, we show a clear "licence required / upgrade" prompt.
//
// This module is intentionally tiny and dependency-free (it duck-types the
// error so there is NO import cycle with lib/api.ts). The API client dispatches
// the window event centrally, so EVERY current and future call site is covered
// without per-site wiring. When enforcement is OFF (prod default today) the
// server never returns license_required, so this whole path stays inert.
// ============================================================================

/** Window event the API client fires when the server says a licence is needed. */
export const LICENSE_REQUIRED_EVENT = 'kuja:license-required';

export interface LicenseRequiredDetail {
  /** What the user was trying to do, if known ('publish' | 'award' | …). */
  action?: string;
  /** Server-provided localized message, when present. */
  message?: string;
}

/**
 * True when an error is the licensing 403. Duck-typed so this module never
 * imports the API client (avoids a require cycle). Matches both the structured
 * shape ({ code:'license_required' }) and the legacy flat shape
 * ({ message:'license_required' }).
 */
export function isLicenseRequired(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  return e.code === 'license_required' || e.message === 'license_required';
}

/** Fire the global prompt. No-op during SSR / static export prerender. */
export function promptLicenseRequired(detail: LicenseRequiredDetail = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<LicenseRequiredDetail>(LICENSE_REQUIRED_EVENT, { detail }),
  );
}
