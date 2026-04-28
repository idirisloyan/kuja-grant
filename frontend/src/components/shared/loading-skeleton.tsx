'use client';

/**
 * LoadingSkeleton — Phase 7.2
 *
 * Replaces spinners with content-shape skeletons. The team's feedback was
 * that "Loading…" without a hint of WHAT is loading feels infrastructural.
 * Skeletons are paired with optional descriptive copy so a slow AI call
 * surfaces "Reading your last 3 reports…" instead of an indeterminate spinner.
 *
 * Variants:
 *   row    — single line of activity (a row in a table)
 *   card   — 4-line skeleton card (most surfaces)
 *   chart  — wide bar shape for chart placeholders
 *   ai     — skeleton + descriptive copy + Sparkles icon for AI loads
 */

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  variant?: 'row' | 'card' | 'chart' | 'ai';
  rows?: number;
  /** AI-mode descriptive copy ("Reading your last 3 reports…"). */
  copy?: string;
  className?: string;
}

export function LoadingSkeleton({
  variant = 'card',
  rows = 3,
  copy,
  className = '',
}: Props) {
  if (variant === 'row') {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-8 w-full animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className={cn('h-48 w-full animate-pulse rounded-md bg-muted', className)} aria-busy="true" />
    );
  }

  if (variant === 'ai') {
    return (
      <div
        className={cn(
          'rounded-[10px] border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-4',
          className,
        )}
        aria-busy="true"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[hsl(var(--kuja-spark))]">
          <Sparkles className="h-4 w-4 animate-pulse" />
          {copy && <span>{copy}</span>}
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  // 'card' default
  return (
    <div className={cn('space-y-2 rounded-md border border-border bg-card p-4', className)} aria-busy="true">
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 w-full animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
