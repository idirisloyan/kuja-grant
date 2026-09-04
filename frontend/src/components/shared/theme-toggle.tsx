'use client';

/**
 * Phase 111 — App-wide dark mode.
 *
 * Applies/removes `class="dark"` on <html>, persists the choice in
 * localStorage, and respects `prefers-color-scheme` on first paint.
 * Tailwind config: `darkMode: 'class'`.
 *
 * PFX-04SEP-MOBILE-003 (4 Sep 2026): the mode now lives in one place —
 * `useThemeMode()` — and every control (the header's cycling ThemeToggle, the
 * Appearance segment in the drawer footer and in the account sheet) reads and
 * writes the same state. A change in one instance is broadcast to the others
 * via a window event, so two controls never disagree about the current mode.
 */

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/hooks/use-translation';

const STORAGE_KEY = 'kuja_theme_v1';
const CHANGE_EVENT = 'kuja:theme';
export type ThemeMode = 'system' | 'light' | 'dark';

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

function effectiveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const dark = effectiveDark(mode);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setThemeMode(mode: ThemeMode) {
  try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(CHANGE_EVENT, { detail: mode }));
}

/** The one source of truth for the appearance mode, shared by every control. */
export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>('system');
  useEffect(() => {
    const m = readStored();
    setMode(m);
    applyTheme(m);
    const onChange = (e: Event) => setMode((e as CustomEvent<ThemeMode>).detail);
    window.addEventListener(CHANGE_EVENT, onChange);
    // Re-apply when the OS theme changes (only matters when mode === 'system').
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => { if (readStored() === 'system') applyTheme('system'); };
    media.addEventListener?.('change', onMedia);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      media.removeEventListener?.('change', onMedia);
    };
  }, []);
  return [mode, setThemeMode];
}

/** Compact cycling button (desktop header): system → light → dark → system. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [mode, set] = useThemeMode();
  const cycle = () => set(mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system');
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

/**
 * Appearance [ System | Light | Dark ] — the selected state is always visible
 * and a tap applies instantly. `onDark` styles it for the dark drawer.
 */
export function AppearanceSegment({
  className = '',
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  const { t } = useTranslation();
  const [mode, set] = useThemeMode();
  const options: { key: ThemeMode; icon: typeof Sun; label: string }[] = [
    { key: 'system', icon: Monitor, label: t('theme.system') },
    { key: 'light', icon: Sun, label: t('theme.light') },
    { key: 'dark', icon: Moon, label: t('theme.dark') },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('header.appearance')}
      className={cn(
        'inline-flex rounded-md border p-0.5',
        onDark ? 'border-white/15 bg-white/5' : 'border-border bg-muted/40',
        className,
      )}
    >
      {options.map((o) => {
        const selected = mode === o.key;
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => set(o.key)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1 rounded px-2.5 text-xs font-medium transition-colors',
              selected
                ? (onDark ? 'bg-white/15 text-white' : 'bg-background text-foreground shadow-sm')
                : (onDark ? 'text-white/70 hover:text-white' : 'text-muted-foreground hover:text-foreground'),
            )}
            style={{ minHeight: 32 }}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
