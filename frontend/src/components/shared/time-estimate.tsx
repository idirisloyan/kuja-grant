'use client';

/**
 * TimeEstimate — Phase 98.2 (design backlog Wave 1)
 *
 * Removes the "unknown" from every task by labelling effort and progress.
 *
 * Non-technical users decide whether to start a task based on perceived
 * effort. "~6 min · 3 of 5 fields" tells them: it's small, you're close.
 * "~20 min" tells them: block out time before you start.
 *
 * Use on: apply forms, report drafts, declaration wizards, signature
 * cards, anywhere the user might bounce on "how long will this take?"
 */

import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Estimated minutes remaining. Pass null to hide the time. */
  minutes?: number | null;
  /** Progress on the current task: e.g. {done: 3, total: 5}. */
  progress?: { done: number; total: number } | null;
  /** Optional verb: "to finish" / "to submit". Defaults to "left". */
  trailingLabel?: string;
  /** Visual size. */
  size?: 'sm' | 'md';
  className?: string;
}

function formatMinutes(m: number): string {
  if (m < 1) return '<1 min';
  if (m < 60) return `~${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m - h * 60);
  return rem === 0 ? `~${h}h` : `~${h}h ${rem}m`;
}

export function TimeEstimate({
  minutes,
  progress,
  trailingLabel = 'left',
  size = 'sm',
  className,
}: Props) {
  if (minutes == null && !progress) return null;

  const sizeCls = size === 'md' ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5';
  const iconCls = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 font-medium text-muted-foreground',
        sizeCls,
        className,
      )}
    >
      <Timer className={iconCls} />
      {minutes != null && (
        <span>
          {formatMinutes(minutes)} {trailingLabel}
        </span>
      )}
      {progress && (
        <>
          {minutes != null && <span className="text-border">·</span>}
          <span>
            {progress.done} of {progress.total}
          </span>
        </>
      )}
    </span>
  );
}
