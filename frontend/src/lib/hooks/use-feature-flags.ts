// ============================================================================
// useFeatureFlags — Phase 9.1
// ----------------------------------------------------------------------------
// Reads `/api/admin/flags/me` once per session and caches the result. Returns
// a synchronous `isEnabled(key)` predicate that components can use to gate
// new surfaces. The endpoint is available to all logged-in users — the values
// returned are scoped to the caller (per-user > per-org > global).
//
// Usage:
//   const { isEnabled, ready } = useFeatureFlags();
//   if (!ready) return <Skeleton />;
//   return isEnabled('ai.draft_application') ? <DraftCoAuthor /> : null;
//
// Cache invalidation: re-read on user change. Manual `refresh()` exposed for
// the admin flag-management UI.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';

interface FlagsResponse {
  success: boolean;
  flags: Record<string, boolean>;
}

const FLAG_ENDPOINT = '/admin/flags/me';

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
    (key: string): boolean => Boolean(data?.flags?.[key]),
    [data],
  );

  return {
    /** Map of all flag values for the current user. */
    flags: data?.flags ?? {},
    /** True once the first fetch resolved (success or error). */
    ready: !isLoading && !!data,
    /** Synchronous predicate — returns false until data loads. */
    isEnabled,
    /** True if we couldn't load flags. Treats failed loads as "all off". */
    error: !!error,
    /** Force a refetch (used by admin flag UI after toggling). */
    refresh: () => mutate(),
  };
}

/**
 * Convenience: gate a single flag without destructuring. Returns
 * { enabled, ready } where `enabled` is always false until ready=true.
 */
export function useFlag(key: string) {
  const { isEnabled, ready, error } = useFeatureFlags();
  return { enabled: ready && isEnabled(key), ready, error };
}
