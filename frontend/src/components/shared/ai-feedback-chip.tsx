'use client';

/**
 * Phase 116 — AI acceptance / edit / dismiss feedback chip.
 *
 * Every AI surface that returns `meta.ai_call_id` (or `replay.ai_call_id`)
 * can drop this chip in to capture a one-tap signal:
 *
 *   used      — the user accepted the output without rewriting it
 *   edited    — the user used it as a starting point but rewrote
 *   dismissed — the user closed without using it
 *
 * The signal lands in ai_call_logs.helpfulness via the existing PATCH
 * endpoint and rolls up under /api/admin/observability/ai-cost.
 *
 * Self-gates: renders nothing if callId is null or already-submitted.
 */

import { useState } from 'react';
import { ThumbsUp, Pencil, X, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Signal = 'used' | 'edited' | 'dismissed';

interface Props {
  callId: number | null | undefined;
  /** Surface label for the screen reader (e.g. "compliance preempt"). */
  surfaceLabel?: string;
  className?: string;
}

export function AIFeedbackChip({ callId, surfaceLabel, className }: Props) {
  const [submitted, setSubmitted] = useState<Signal | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!callId || submitted === 'used' || submitted === 'edited') {
    // Once positively rated, drop out. Dismissed stays visible so the
    // user can still flip to used/edited if they change their mind.
    if (submitted) {
      return (
        <span className={cn('inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300', className)}>
          <Check className="h-3 w-3" />
          Thanks — feedback recorded.
        </span>
      );
    }
    return null;
  }

  const send = async (signal: Signal) => {
    if (!callId) return;
    setError(null);
    try {
      await api.patch(`/api/ai/calls/${callId}/feedback`, { helpfulness: signal });
      setSubmitted(signal);
    } catch {
      setError('Could not record feedback. Try again.');
    }
  };

  return (
    <div
      role="group"
      aria-label={surfaceLabel ? `Was the ${surfaceLabel} suggestion useful?` : 'Was this AI suggestion useful?'}
      className={cn('inline-flex items-center gap-1.5 text-[11px]', className)}
    >
      <span className="text-muted-foreground">Useful?</span>
      <button
        type="button"
        onClick={() => send('used')}
        title="I used this as-is"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950/40"
      >
        <ThumbsUp className="h-3 w-3" />
        Used
      </button>
      <button
        type="button"
        onClick={() => send('edited')}
        title="I edited it before using"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 hover:bg-amber-50 hover:border-amber-300 dark:hover:bg-amber-950/40"
      >
        <Pencil className="h-3 w-3" />
        Edited
      </button>
      <button
        type="button"
        onClick={() => send('dismissed')}
        title="I didn't use it"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 hover:bg-rose-50 hover:border-rose-300 dark:hover:bg-rose-950/40"
      >
        <X className="h-3 w-3" />
        Skip
      </button>
      {error && <span className="text-[10px] text-rose-600 ml-1">{error}</span>}
    </div>
  );
}
