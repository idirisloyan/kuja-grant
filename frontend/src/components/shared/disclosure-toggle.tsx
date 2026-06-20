'use client';

/**
 * Phase 130 — Beginner / expert progressive disclosure.
 *
 * Two-state toggle wired to localStorage. Pages can consume the value
 * via the exported `useDisclosureMode()` hook and conditionally render
 * advanced panels.
 *
 *   Beginner: hide AI guidance + advanced panels, surface the recommended
 *             next action only. Used by first-time NGOs who get
 *             overwhelmed by every helper showing at once.
 *   Expert  : everything visible (default; current behavior).
 *
 * The team review flagged that the apply page presents too many panels
 * simultaneously, especially to NGOs new to grant writing. Beginner mode
 * reduces visual load without removing capability.
 */

import { useEffect, useState } from 'react';
import { GraduationCap, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'kuja_disclosure_v1';
export type DisclosureMode = 'beginner' | 'expert';

function readStored(): DisclosureMode {
  if (typeof window === 'undefined') return 'expert';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'beginner' || v === 'expert') return v;
  } catch { /* ignore */ }
  return 'expert';
}

/** Shared hook: returns current mode + setter that persists to localStorage. */
export function useDisclosureMode(): [DisclosureMode, (next: DisclosureMode) => void] {
  const [mode, setMode] = useState<DisclosureMode>('expert');
  useEffect(() => {
    setMode(readStored());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'beginner' || e.newValue === 'expert')) {
        setMode(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const update = (next: DisclosureMode) => {
    setMode(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    // Synthesize a storage event for same-tab listeners.
    try {
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY, newValue: next, oldValue: mode,
      }));
    } catch { /* ignore */ }
  };
  return [mode, update];
}

export function DisclosureToggle({ className }: { className?: string }) {
  const [mode, setMode] = useDisclosureMode();
  const isBeginner = mode === 'beginner';

  return (
    <div
      role="group"
      aria-label="Display mode"
      className={cn(
        'inline-flex items-center gap-0 rounded-md border border-border bg-card text-xs overflow-hidden',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setMode('beginner')}
        title="Hide advanced panels; show recommended next action"
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 font-medium',
          isBeginner
            ? 'bg-[hsl(var(--kuja-clay))] text-white'
            : 'text-muted-foreground hover:bg-muted',
        )}
      >
        <GraduationCap className="w-3 h-3" />
        Beginner
      </button>
      <button
        type="button"
        onClick={() => setMode('expert')}
        title="Show every panel + AI helper"
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 font-medium border-l border-border',
          !isBeginner
            ? 'bg-[hsl(var(--kuja-clay))] text-white'
            : 'text-muted-foreground hover:bg-muted',
        )}
      >
        <Sparkles className="w-3 h-3" />
        Expert
      </button>
    </div>
  );
}
