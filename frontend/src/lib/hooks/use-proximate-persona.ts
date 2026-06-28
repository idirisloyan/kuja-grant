/**
 * useProximatePersona — Phase 696.
 *
 * Donor and OB users on the Proximate tenant are seeded with
 * User.role='ngo' for platform compatibility. This hook resolves their
 * actual Proximate-side persona so the shell can swap nav, header
 * label, and role-driven chrome.
 *
 * Cached via SWR with a 5-minute revalidation. Returns null on any
 * non-Proximate network (the call won't fire) so callers can treat
 * `persona === null` as "fall back to platform role" universally.
 */

import useSWR from 'swr';
import { useNetworkStore } from '@/stores/network-store';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

export type ProximatePersona = 'donor' | 'ob' | 'admin' | 'none';

interface PersonaResp {
  success: boolean;
  persona: ProximatePersona;
  display_name?: string;
  network_id?: number;
  network_slug?: string;
}

export function useProximatePersona(): {
  persona: ProximatePersona | null;
  displayName: string | null;
  isProximate: boolean;
  isLoading: boolean;
} {
  const network = useNetworkStore((s) => s.network);
  const user = useAuthStore((s) => s.user);
  const isProximate = network?.slug === 'proximate';
  const shouldFetch = isProximate && !!user;

  // Phase 697 v3 — include user.id in the SWR key so the cache can't
  // leak across sessions. Reviewer saw the previous donor's display
  // name in the header right after logging in as OB; that's stale
  // persona cache keyed on the URL alone.
  const { data, isLoading } = useSWR<PersonaResp>(
    shouldFetch ? ['/proximate/persona/me', user?.id] : null,
    ([url]) => api.get<PersonaResp>(url),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 },
  );

  if (!isProximate) {
    return { persona: null, displayName: null, isProximate: false, isLoading: false };
  }

  return {
    persona: (data?.persona as ProximatePersona) ?? null,
    displayName: data?.display_name ?? null,
    isProximate: true,
    isLoading,
  };
}
