'use client';

/**
 * Phase 95 — useAiStatus hook.
 *
 * Polls /api/ai/service-status (cached server-side for 60s) and returns
 * { status, ready, isUnavailable }. AI surfaces consume this to hide
 * AI buttons or show a global notice when the service is known-down,
 * instead of letting the user record a 5-min voice memo only to discover
 * Claude is unreachable.
 *
 * Cache TTL matches the server cache so we don't re-poll within the
 * server's freshness window.
 */

import useSWR from 'swr';
import { api } from '@/lib/api';

interface AiStatusResp {
  success: boolean;
  status: 'ok' | 'no_key' | 'no_sdk';
  cached?: boolean;
  ttl_seconds?: number;
}

export function useAiStatus() {
  const { data, isLoading } = useSWR<AiStatusResp>(
    '/ai/service-status',
    (url: string) => api.get<AiStatusResp>(url),
    {
      refreshInterval: 60_000,        // poll every 60s
      revalidateOnFocus: false,       // don't hammer on tab switch
      dedupingInterval: 30_000,       // dedupe within 30s
    },
  );

  const status = data?.status ?? 'ok'; // optimistic default
  return {
    status,
    ready: !isLoading && !!data,
    isUnavailable: status !== 'ok',
    isMissingKey: status === 'no_key',
    isMissingSdk: status === 'no_sdk',
  };
}
