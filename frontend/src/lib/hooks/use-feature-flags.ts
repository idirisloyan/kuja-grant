// ============================================================================
// useFeatureFlags — Phase 9.1 + Phase 10 hardening
// ----------------------------------------------------------------------------
// Reads `/api/admin/flags/me` once per session and caches the result. Returns
// a synchronous `isEnabled(key)` predicate that components can use to gate
// new surfaces. The endpoint is available to all logged-in users — the values
// returned are scoped to the caller (per-user > per-org > global).
//
// Phase 10 hardening: ships a client-side mirror of the server's DEFAULT_FLAGS
// so flag-gated surfaces render instantly during the brief SWR fetch window.
// Without this, browser automation (and slow networks) sees a blank space
// where the new Phase 10 surfaces should be — exactly what the team's Apr 28
// retest flagged. Once SWR resolves, the live values replace the defaults.
//
// Cache invalidation: re-read on user change. Manual `refresh()` exposed for
// the admin flag-management UI.
// ============================================================================

import { useCallback } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';

interface FlagsResponse {
  success: boolean;
  flags: Record<string, boolean>;
}

const FLAG_ENDPOINT = '/admin/flags/me';

// Client-side mirror of the server's DEFAULT_FLAGS for the Phase 10 set.
// MUST stay in sync with app/utils/feature_flags.py DEFAULT_FLAGS. This lets
// flag-gated UI render correctly in the brief window before /admin/flags/me
// resolves. Once SWR responds, the server's authoritative values replace
// these defaults — including any per-user / per-org overrides.
const CLIENT_DEFAULT_FLAGS: Record<string, boolean> = {
  // Phase 1 — NGO co-author
  'ai.draft_application': true,
  'ai.draft_report': true,
  // Phase 2 — donor side
  'ai.match_engine': false,
  'ai.median_ngo_preview': false,
  'ai.grant_brief_generator': false,
  // Phase 8 — patterns + compliance
  'ai.cross_grant_patterns': false,
  'ai.compliance_preempt': false,
  // Phase 10 — category-defining surfaces (all default ON as of Apr 28)
  'ai.submission_readiness': true,
  'ai.report_readiness': true,
  'ai.reviewer_summary': true,
  'ai.burden_estimator': true,
  'ai.org_memory': true,
  'ui.preview_as_reviewer': false,
  'ui.live_drafters_pill': false,
  'ui.audit_trail_tab': false,
  'ui.submission_readiness': true,
  'ui.report_readiness': true,
  'ui.reviewer_summary': true,
  'ui.burden_estimator': true,
  'ui.this_week_home': true,
  'ui.compliance_4state': true,
  'ui.decision_audit': true,
};

export function useFeatureFlags() {
  const { data, error, mutate, isLoading } = useSWR<FlagsResponse>(
    FLAG_ENDPOINT,
    (url: string) => api.get<FlagsResponse>(url),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Flags rarely change mid-session; refresh every 5 minutes is plenty.
      refreshInterval: 5 * 60 * 1000,
      // Treat 401/403 as "no flags available" rather than a hard error so
      // unauthenticated render paths (e.g. the login page) don't blow up.
      shouldRetryOnError: false,
    },
  );

  const isEnabled = useCallback(
    (key: string): boolean => {
      // Live server values take precedence once they've resolved.
      if (data?.flags && key in data.flags) {
        return Boolean(data.flags[key]);
      }
      // Otherwise fall back to the client-side default mirror — this is the
      // Phase 10 hardening that keeps flag-gated UI visible during the
      // brief flag-fetch window.
      return Boolean(CLIENT_DEFAULT_FLAGS[key]);
    },
    [data],
  );

  return {
    /** Map of all flag values for the current user. */
    flags: data?.flags ?? CLIENT_DEFAULT_FLAGS,
    /** True once the first fetch resolved (success or error). */
    ready: !isLoading && !!data,
    /** Synchronous predicate — uses live data when available, defaults otherwise. */
    isEnabled,
    /** True if we couldn't load flags. Treats failed loads as defaults. */
    error: !!error,
    /** Force a refetch (used by admin flag UI after toggling). */
    refresh: () => mutate(),
  };
}

/**
 * Convenience: gate a single flag without destructuring. Returns
 * { enabled, ready } where `enabled` reflects the live value when available
 * and the client-side default otherwise — so flag-gated UI renders
 * immediately on the first paint, then refines when SWR resolves.
 */
export function useFlag(key: string) {
  const { isEnabled, ready, error } = useFeatureFlags();
  return { enabled: isEnabled(key), ready, error };
}
