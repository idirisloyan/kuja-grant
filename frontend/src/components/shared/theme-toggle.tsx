'use client';

/**
 * Phase 111 — App-wide dark mode toggle.
 *
 * Phase 98 components shipped with `dark:` Tailwind variants. This is
 * the missing 5%: a toggle in the header that applies/removes
 * `class="dark"` on `<html>`, persists the choice in localStorage, and
 * respects `prefers-color-scheme` on first paint.
 *
 * Tailwind config: `darkMode: 'class'` (already set).
 *
 * Three states cycle on click: system → light → dark → system.
 */

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'kuja_theme_v1';
type Mode = 'system' | 'light' | 'dark';

function readStored(): Mode {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

function effectiveDark(mode: Mode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(mode: Mode) {
  if (typeof document === 'undefined') return;
  const dark = effectiveDark(mode);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    const m = readStored();
    setMode(m);
    apply(m);
    // Re-apply when the OS theme changes (only matters when mode === 'system').
    const media = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    const onChange = () => { if (mode === 'system') apply('system'); };
    media?.addEventListener?.('change', onChange);
    return () => { media?.removeEventListener?.('change', onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycle = () => {
    const next: Mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
    setMode(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    apply(next);
  };

  const Icon = mode === 'system' ? Monitor : mode === 'light' ? Sun : Moon;
  const label = mode === 'system' ? 'System theme' : mode === 'light' ? 'Light theme' : 'Dark theme';

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${label} (click to switch)`}
      title={`${label} — click to switch`}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
