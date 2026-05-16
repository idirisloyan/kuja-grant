'use client';

/**
 * useUrlState — sync a filter/search piece to a URL query param.
 *
 * Returns [value, setValue] with the same shape as useState, but persisted
 * to the URL so:
 *   - the page state is bookmarkable
 *   - back/forward navigation restores the filters
 *   - users can share a filtered view by copying the address bar
 *
 * Implementation notes:
 *   - Uses Next.js useSearchParams + window.history.replaceState (not router.push)
 *     so we don't add a navigation entry on every keystroke.
 *   - Serialiser/deserialiser are pluggable; default is identity for strings
 *     and JSON for everything else.
 *
 * Usage:
 *   const [q, setQ] = useUrlState('q', '');
 *   const [sectors, setSectors] = useUrlSetState('sector');   // Set<string>
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function readFromUrl<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(key);
  if (raw === null) return fallback;
  try {
    return parse(raw);
  } catch {
    return fallback;
  }
}

function writeToUrl(key: string, raw: string | null) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (raw === null || raw === '') {
    params.delete(key);
  } else {
    params.set(key, raw);
  }
  const search = params.toString();
  const next = `${window.location.pathname}${search ? '?' + search : ''}`;
  window.history.replaceState(window.history.state, '', next);
}

/** Generic URL-synced state. */
export function useUrlState<T>(
  key: string,
  defaultValue: T,
  options: {
    parse?: (raw: string) => T;
    serialise?: (value: T) => string | null;
  } = {},
): [T, (value: T) => void] {
  const parse = options.parse ?? ((raw: string) => raw as unknown as T);
  const serialise = options.serialise ?? ((value: T) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value || null;
    return JSON.stringify(value);
  });

  const [value, setValueState] = useState<T>(() => readFromUrl(key, defaultValue, parse));

  // Watch for back/forward navigation
  const searchParams = useSearchParams();
  useEffect(() => {
    setValueState(readFromUrl(key, defaultValue, parse));
    // We intentionally only react to searchParams changes — the URL is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setValue = useCallback((next: T) => {
    setValueState(next);
    writeToUrl(key, serialise(next));
  }, [key, serialise]);

  return [value, setValue];
}

/** Convenience wrapper for Set<string> filters (comma-separated). */
export function useUrlSetState(key: string): [Set<string>, (value: Set<string>) => void] {
  return useUrlState<Set<string>>(
    key,
    new Set(),
    {
      parse: (raw) => new Set(raw.split(',').filter(Boolean)),
      serialise: (set) => set.size === 0 ? null : Array.from(set).join(','),
    },
  );
}
