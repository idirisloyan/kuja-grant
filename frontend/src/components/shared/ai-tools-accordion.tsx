'use client';

/**
 * Phase 83 — AI tools accordion.
 *
 * Response to the team's review: the apply and reports pages stacked
 * 6-7 AI buttons each. Cognitive load is real. This wraps the legacy
 * helpers (DraftCoAuthor, AutofillPanel, ReportReadiness, etc.) in
 * a single collapsed "More AI tools" disclosure so the primary AI
 * action (Voice draft / Photo evidence / Smart Draft) is the only
 * one visible by default.
 *
 * Power users still get access — they just need one click to expand.
 * Non-technical users no longer see a wall of AI cards.
 */

import { useState, type ReactNode } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  /** Plain-language label for the accordion */
  label?: string;
  /** Optional 1-line hint shown next to the chevron */
  hint?: string;
  /** Number of tools inside — shown as a badge */
  toolCount?: number;
  /** Default-open state. Default: false (collapsed) */
  defaultOpen?: boolean;
  /** The legacy AI panels */
  children: ReactNode;
  className?: string;
}

export function AIToolsAccordion({
  label = 'More AI tools',
  hint = 'Additional AI helpers for advanced users',
  toolCount,
  defaultOpen = false,
  children,
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`border border-border rounded-lg bg-card ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/30 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-spark))] shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold flex items-center gap-2">
              {label}
              {toolCount != null && toolCount > 0 && (
                <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                  {toolCount}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">{hint}</div>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/50">
          {children}
        </div>
      )}
    </section>
  );
}
