'use client';

/**
 * Phase 99 — Inactivity-triggered help.
 *
 * After ~45 seconds of inactivity (no clicks / keypresses / scroll) on a
 * surface, a calm tooltip appears in the bottom-right corner:
 *
 *   "Stuck? Here's what most users do."
 *
 * with a single jump link. Disappears the moment the user moves again,
 * AND auto-dismisses after 15s if untouched. Per-surface dismissal is
 * stored in sessionStorage so the same nudge doesn't badger across page
 * navigations within a session.
 *
 * Usage:
 *
 *   <InactivityHelp
 *     surfaceKey="apply-form"
 *     hint="Most NGOs start with the budget section — it sets up the rest."
 *     nextHref="/applications/12345#budget"
 *     nextLabel="Jump to budget"
 *   />
 *
 * Trigger window is configurable via `idleMs` (default 45000).
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, X, ArrowRight } from 'lucide-react';

interface Props {
  /** Stable key per surface — used as the sessionStorage dismiss marker. */
  surfaceKey: string;
  /** The single sentence shown in the tooltip. */
  hint: string;
  /** Optional CTA href. */
  nextHref?: string;
  /** Optional CTA label. */
  nextLabel?: string;
  /** Optional click handler if the CTA is an action, not a link. */
  onCtaClick?: () => void;
  /** Idle threshold in milliseconds. Default 45_000 (45s). */
  idleMs?: number;
  /** Auto-dismiss the visible tooltip after this many ms. Default 15_000. */
  autoDismissMs?: number;
}

function dismissKey(surfaceKey: string) {
  return `kuja_inactivity_help_dismissed_${surfaceKey}_v1`;
}

export function InactivityHelp({
  surfaceKey,
  hint,
  nextHref,
  nextLabel,
  onCtaClick,
  idleMs = 45_000,
  autoDismissMs = 15_000,
}: Props) {
  const [visible, setVisible] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Per-session dismissal: don't re-fire on this surface.
    try {
      if (window.sessionStorage.getItem(dismissKey(surfaceKey)) === '1') return;
    } catch {
      /* ignore */
    }

    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setVisible(true);
        if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
        autoDismissTimer.current = setTimeout(() => setVisible(false), autoDismissMs);
      }, idleMs);
    };
    const onActivity = () => {
      // Activity also dismisses the currently-visible tooltip.
      if (visible) setVisible(false);
      reset();
    };

    reset();
    const events: (keyof DocumentEventMap)[] = [
      'mousemove', 'keydown', 'scroll', 'touchstart', 'click',
    ];
    events.forEach((evt) => document.addEventListener(evt, onActivity, { passive: true }));
    return () => {
      events.forEach((evt) => document.removeEventListener(evt, onActivity));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceKey, idleMs, autoDismissMs]);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    try {
      window.sessionStorage.setItem(dismissKey(surfaceKey), '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-[hsl(var(--kuja-clay)/0.3)] bg-card shadow-lg p-4 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex items-start gap-2">
        <Lightbulb className="w-4 h-4 text-[hsl(var(--kuja-clay))] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-semibold mb-1">Stuck? Here&apos;s what most users do.</div>
          <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
          {(nextHref || onCtaClick) && nextLabel && (
            <div className="mt-2">
              {nextHref ? (
                <Link
                  href={nextHref}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--kuja-clay))] hover:underline"
                  onClick={handleDismiss}
                >
                  {nextLabel} <ArrowRight className="w-3 h-3" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => { onCtaClick?.(); handleDismiss(); }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--kuja-clay))] hover:underline"
                >
                  {nextLabel} <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss this help"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
