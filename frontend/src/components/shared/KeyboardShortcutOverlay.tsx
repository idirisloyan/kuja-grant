'use client';

/**
 * KeyboardShortcutOverlay — Phase 13.17
 *
 * Cmd/Ctrl+? opens a dialog listing global keyboard shortcuts.
 * PMO's pattern: skip when the user is typing in inputs so the
 * shortcut doesn't fire while someone types "?" into a textarea.
 *
 * Shortcuts list is static — update SHORTCUTS when adding new ones.
 */

import { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

interface ShortcutGroup {
  title: string;
  items: { keys: string[]; description: string }[];
}

function buildShortcuts(t: (k: string) => string): ShortcutGroup[] {
  return [
    {
      title: t('shortcuts.group.global'),
      items: [
        { keys: ['?'], description: t('shortcuts.show_overlay') },
        { keys: ['Esc'], description: t('shortcuts.close_dialog') },
      ],
    },
    {
      title: t('shortcuts.group.navigation'),
      items: [
        { keys: ['g', 'd'], description: t('shortcuts.go_dashboard') },
        { keys: ['g', 'a'], description: t('shortcuts.go_applications') },
        { keys: ['g', 'r'], description: t('shortcuts.go_reports') },
        { keys: ['g', 'g'], description: t('shortcuts.go_grants') },
      ],
    },
  ];
}

function isTypingInInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function KeyboardShortcutOverlay() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Phase 13.45 — diagnostic marker so automated certs can verify
    // mount without depending on i18n text. Stable across i18n changes.
    try {
      (window as unknown as Record<string, unknown>).__kuja_kbd_overlay_mounted = true;
    } catch {}
    const handler = (e: KeyboardEvent) => {
      // Trigger on '?' OR Shift+/ (some non-US layouts emit '/' with shiftKey).
      const isQuestion = e.key === '?' || (e.key === '/' && e.shiftKey);
      if (isQuestion && !isTypingInInput(e.target)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        // Use functional setter so we don't need `open` in deps.
        setOpen((v) => (v ? false : v));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // Empty deps so the listener attaches once and stays. Prior `[open]`
    // dep tore down + re-attached on every toggle, which was racy on
    // rapid presses and made the cert script's synthetic dispatch miss
    // the brief window the listener was unbound between renders.
  }, []);

  if (!open) return null;

  const groups = buildShortcuts(t);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            <h2 className="kuja-display text-base">{t('shortcuts.title')}</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 space-y-3">
          {groups.map((g, i) => (
            <section key={i}>
              <h3 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                {g.title}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((item, j) => (
                  <li key={j} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground">{item.description}</span>
                    <span className="flex items-center gap-1">
                      {item.keys.map((k, ki) => (
                        <kbd
                          key={ki}
                          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="pt-2 border-t border-border">
            <button
              type="button"
              className="w-full text-left text-sm text-[hsl(var(--kuja-clay))] hover:text-[hsl(var(--kuja-clay-dark))] hover:underline"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event('kuja:replay-tour'));
              }}
            >
              {t('shortcuts.replay_tour')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
