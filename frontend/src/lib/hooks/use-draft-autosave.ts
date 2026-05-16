'use client';

/**
 * useDraftAutosave — local-storage form draft persistence (Phase 4).
 *
 * Pattern (PMO transfer): every long form (assessment wizard, application
 * draft, report draft) autosaves to localStorage AND, when online, to the
 * server. When offline, the local copy keeps the user's work safe; when
 * the connection comes back the SW + the server sync take over.
 *
 *   const [draft, setDraft, restoreLocal] = useDraftAutosave(
 *     `kuja.draft.assessment.${assessmentId}`,
 *     initial,
 *   );
 *
 * - Reads from localStorage on first render (so a returning user picks up
 *   where they left off, even without a network).
 * - Writes on every setDraft (debounced 600ms).
 * - Returns a `restoreLocal()` to manually re-read (used after a successful
 *   server save, to confirm local matches server).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 600;

export function useDraftAutosave<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void, () => T | null, () => void] {

  // Read initial from localStorage if present
  const readLocal = useCallback((): T | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch { return null; }
  }, [key]);

  const [state, setState] = useState<T>(() => readLocal() ?? initial);
  const timerRef = useRef<number | undefined>(undefined);

  // Persist on change (debounced)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
        // Stamp a "last saved" tick so other components can show "Saved 12s ago"
        localStorage.setItem(`${key}.savedAt`, String(Date.now()));
      } catch { /* quota exceeded — drop silently */ }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [key, state]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => typeof next === 'function' ? (next as (p: T) => T)(prev) : next);
  }, []);

  const clear = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}.savedAt`);
    } catch { /* ignore */ }
  }, [key]);

  return [state, set, readLocal, clear];
}

/** Read the "last saved" stamp written by useDraftAutosave. */
export function getDraftSavedAt(key: string): Date | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(`${key}.savedAt`);
    return v ? new Date(Number(v)) : null;
  } catch { return null; }
}
