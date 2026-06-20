'use client';

/**
 * Phase 104 — AI fallback user-visible notice.
 *
 * The Phase 99 copilot_service ships a Sonnet → Haiku fallback when the
 * primary model is unavailable. Without UI, this fallback is silent:
 * the user gets a B-tier response and doesn't know that "full review"
 * is briefly degraded. This component is the missing trust completion.
 *
 * Usage on any surface that consumes a meta-carrying AI response:
 *
 *   <AIFallbackNotice meta={result?.meta} />
 *
 * Self-gated: only renders when meta.fallback_used === true. No-op
 * otherwise.
 *
 * Calm gray banner with a single sentence + a "what does this mean?"
 * tooltip. Deliberately understated — we're being honest, not alarming.
 */

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetaLike {
  fallback_used?: boolean;
  model?: string | null;
  fallback_from?: string | null;
}

interface Props {
  meta?: MetaLike | null;
  className?: string;
  /**
   * Compact mode: small inline chip instead of a full banner. Use in
   * contexts where space matters (next to a button, inside a card
   * header, etc.).
   */
  compact?: boolean;
}

export function AIFallbackNotice({ meta, className = '', compact = false }: Props) {
  if (!meta || meta.fallback_used !== true) return null;
  const fromModel = meta.fallback_from || 'the primary model';

  if (compact) {
    return (
      <span
        role="status"
        aria-live="polite"
        title={`Using draft mode — ${fromModel} was unavailable. Re-run when the badge clears for the full review.`}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-muted text-muted-foreground border border-border',
          className,
        )}
      >
        <Info className="w-3 h-3" />
        Draft mode
      </span>
    );
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 rounded-md border border-border bg-muted/50 dark:bg-muted/20 px-3 py-2 text-xs',
        className,
      )}
    >
      <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">Using draft mode.</span>{' '}
        <span className="text-muted-foreground">
          {fromModel} was briefly unavailable so we delivered this with a faster fallback. Re-run in a moment for the full review.
        </span>
      </div>
    </aside>
  );
}
