'use client';

/**
 * CollapseSection — Phase 98.9 (design backlog Wave 1)
 *
 * Wraps secondary detail (decision audit drawer, compliance detail, AI
 * rationale, document lists) in a default-collapsed disclosure pattern
 * with a single "Show details" affordance.
 *
 * Rule: secondary content collapsed by default. If a user needs it
 * to do their job, it's not secondary — promote it. If they only need
 * it sometimes, collapse it.
 *
 * The 5-field compliance explainer already does this; this component
 * makes the same affordance reusable everywhere.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** What's hidden, e.g. "Decision audit", "Document list". */
  title: string;
  /** Optional small count badge: "(3)". */
  count?: number | null;
  /** Optional caption shown next to the title. */
  caption?: string;
  /** What's hidden. */
  children: ReactNode;
  /** Whether to start expanded. Default false. */
  defaultOpen?: boolean;
  /** Persist state in localStorage under this key. */
  storageKey?: string;
  className?: string;
}

export function CollapseSection({
  title,
  count,
  caption,
  children,
  defaultOpen = false,
  storageKey,
  className,
}: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && storageKey) {
      const v = window.localStorage.getItem(`collapse:${storageKey}`);
      if (v === '1') return true;
      if (v === '0') return false;
    }
    return defaultOpen;
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(`collapse:${storageKey}`, next ? '1' : '0');
    }
  };

  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="flex-1 text-foreground">{title}</span>
        {count != null && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
        {caption && !open && (
          <span className="hidden truncate text-xs font-normal text-muted-foreground sm:inline">
            {caption}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5">{children}</div>
      )}
    </div>
  );
}
