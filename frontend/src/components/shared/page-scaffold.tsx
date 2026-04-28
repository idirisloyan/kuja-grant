'use client';

/**
 * PageScaffold — Phase 10.9
 *
 * Page anatomy primitive that enforces the team's standardized layout:
 *   1. PURPOSE     — what this page is for, in one line
 *   2. ATTENTION   — what needs attention now (urgent / blocking)
 *   3. NEXT ACTION — what action to take next (the primary CTA)
 *   4. DETAIL      — supporting detail below the fold
 *
 * The team's spec: "Every key page should follow the same structure...
 * The weakest SaaS products feel different page to page. Kuja should
 * make applications, reports, reviews, compliance, and profile pages
 * feel like one design language."
 *
 * Usage:
 *   <PageScaffold
 *     purpose="Submit your impact report for Q3 2024"
 *     attention={<Alert>3 sections still empty</Alert>}
 *     nextAction={<Button>Continue draft</Button>}
 *   >
 *     <ReportForm />
 *   </PageScaffold>
 *
 * Each slot is optional; only purpose+children render minimally. The
 * scaffold doesn't impose visual chrome beyond consistent spacing —
 * existing component visuals continue to work inside the detail slot.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** One-line page purpose (renders as h1). */
  title: string;
  /** Subtitle / one-line description of what this page does. */
  purpose?: string;
  /** Urgent or blocking signal (badge, alert, or status message). */
  attention?: ReactNode;
  /** Primary CTA — the next action the user is expected to take. */
  nextAction?: ReactNode;
  /** Supporting detail (the bulk of the page). */
  children: ReactNode;
  className?: string;
}

export function PageScaffold({ title, purpose, attention, nextAction, children, className }: Props) {
  return (
    <div className={cn('space-y-5', className)}>
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="kuja-display text-2xl text-foreground">{title}</h1>
            {purpose && (
              <p className="mt-1 text-sm text-muted-foreground">{purpose}</p>
            )}
          </div>
          {nextAction && (
            <div className="flex-shrink-0">{nextAction}</div>
          )}
        </div>
        {attention && (
          <div className="border-l-4 border-l-[hsl(var(--kuja-spark))] bg-[hsl(var(--kuja-spark-soft))]/30 pl-3 py-2 rounded-r-md">
            {attention}
          </div>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}
