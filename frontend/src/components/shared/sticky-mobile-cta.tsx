'use client';

/**
 * StickyMobileCta — Phase 98.5 (design backlog Wave 1)
 *
 * Pins the page's primary action to the bottom of the viewport on phones
 * (thumb zone), and behaves as inline below the fold on tablet+.
 *
 * Why: long forms on phones bury the submit button. Sticky pinning means
 * the user always knows what the next action is — pairs with one-question-
 * per-screen forms for lowest-literacy users.
 *
 * One per page max. Render at the end of <PageScaffold>'s content.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** The primary action — usually a Button. */
  children: ReactNode;
  /** Optional left-side hint, e.g. TimeEstimate. */
  hint?: ReactNode;
  /** When true, the bar disables instead of hiding above sm:. */
  alwaysVisible?: boolean;
  className?: string;
}

export function StickyMobileCta({ children, hint, alwaysVisible, className }: Props) {
  return (
    <>
      {/* Spacer so the page content can scroll past the sticky bar. */}
      <div className="h-16 sm:hidden" />

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          'shadow-[0_-2px_10px_rgba(0,0,0,0.04)]',
          alwaysVisible ? '' : 'sm:relative sm:inset-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none sm:backdrop-blur-0',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {hint && (
            <div className="hidden truncate text-xs text-muted-foreground sm:block">
              {hint}
            </div>
          )}
          {hint && (
            <div className="text-[10px] text-muted-foreground sm:hidden">
              {hint}
            </div>
          )}
          <div className="flex flex-1 justify-end sm:flex-initial">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
