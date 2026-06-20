'use client';

/**
 * PredictiveNudge — Phase 98.8 (design backlog Wave 3 "Foresight")
 *
 * Replaces "report due in 3 days" with a forward-looking nudge that
 * carries the estimate AND the exact next tap:
 *   "You're 80% done. About 6 minutes left. 2 fields to go."
 *
 * The component is read-only. The parent computes the prediction from
 * the autosave snapshot + the field schema + the historical median for
 * this user on similar forms.
 */

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { TimeEstimate } from './time-estimate';
import { cn } from '@/lib/utils';

interface Props {
  /** Percent complete, 0-100. */
  percentDone: number;
  /** Estimated minutes remaining. */
  minutesLeft: number;
  /** Optional fields-left progress. */
  fieldsLeft?: number;
  /** Optional fields-total. */
  fieldsTotal?: number;
  /** What the next action is — the exact tap. */
  nextTapLabel: string;
  /** Where the next tap goes. */
  nextTapHref?: string;
  /** Called when the next tap is clicked (if no href). */
  onNextTap?: () => void;
  /** Deadline date — used to phrase urgency. */
  deadlineISO?: string;
  className?: string;
}

function deadlineCopy(deadlineISO?: string): string | null {
  if (!deadlineISO) return null;
  const d = new Date(deadlineISO);
  const now = new Date();
  const days = Math.round((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'Past deadline';
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days <= 7) return `Closes in ${days} days`;
  return null; // Don't nag for distant deadlines.
}

export function PredictiveNudge({
  percentDone,
  minutesLeft,
  fieldsLeft,
  fieldsTotal,
  nextTapLabel,
  nextTapHref,
  onNextTap,
  deadlineISO,
  className,
}: Props) {
  const dl = deadlineCopy(deadlineISO);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-[hsl(var(--kuja-clay)/0.25)] bg-[hsl(var(--kuja-sand-50))] p-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--kuja-clay))]" />
        <div>
          <div className="text-sm font-medium text-foreground">
            You&apos;re {Math.round(percentDone)}% done.
            {dl && (
              <span className="ml-1 font-normal text-muted-foreground">· {dl}</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <TimeEstimate
              minutes={minutesLeft}
              progress={
                fieldsLeft != null && fieldsTotal != null
                  ? { done: fieldsTotal - fieldsLeft, total: fieldsTotal }
                  : null
              }
              trailingLabel="to finish"
            />
          </div>
        </div>
      </div>
      {(nextTapHref || onNextTap) && (
        nextTapHref ? (
          <Link
            href={nextTapHref}
            className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-medium text-white hover:bg-[hsl(var(--kuja-clay))]/90"
          >
            {nextTapLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onNextTap}
            className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-medium text-white hover:bg-[hsl(var(--kuja-clay))]/90"
          >
            {nextTapLabel}
            <ArrowRight className="h-3 w-3" />
          </button>
        )
      )}
    </div>
  );
}
