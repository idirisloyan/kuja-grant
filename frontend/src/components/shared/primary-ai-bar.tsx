'use client';

/**
 * PrimaryAiBar — Phase 98.11 (design backlog Wave 1)
 *
 * Universal "one primary AI verb per surface" affordance.
 *
 * Every screen exposes exactly ONE primary AI verb in this bar:
 *   "Draft this for me"
 *   "Check before I submit"
 *   "Explain this flag"
 *   "Summarise this declaration"
 *
 * Everything else collapses behind "More AI tools" (extends Phase 83
 * consolidation pattern).
 *
 * Rendering: a single calm row with the verb, a short hint, and the
 * optional secondary menu. Use at the top of the primary content area.
 */

import { useState, type ReactNode } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
// Note: Button import retained even if Primary uses it; DropdownMenuTrigger
// in Base UI doesn't support asChild, so the secondary trigger is rendered
// as a styled native button inside the trigger itself.

export interface SecondaryTool {
  label: string;
  onClick: () => void;
  /** Optional short description. */
  hint?: string;
}

interface Props {
  /** The single primary AI verb shown as the headline action. */
  verb: string;
  /** Short hint shown next to the verb when there's room. */
  hint?: string;
  /** Called when the primary action is invoked. */
  onPrimary: () => void;
  /** State: 'idle' | 'loading' | 'done' — drives loading affordance. */
  state?: 'idle' | 'loading' | 'done';
  /** Optional secondary tools, surfaced under "More AI tools" dropdown. */
  secondary?: SecondaryTool[];
  /** Optional badge slot (e.g. confidence badge for the last run). */
  trailing?: ReactNode;
  /** Surface tag for telemetry / Phase 83 consolidation tracking. */
  surface?: string;
  className?: string;
}

export function PrimaryAiBar({
  verb,
  hint,
  onPrimary,
  state = 'idle',
  secondary,
  trailing,
  surface,
  className,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const disabled = state === 'loading';

  return (
    <div
      data-ai-surface={surface}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-[hsl(var(--kuja-clay)/0.2)] bg-[hsl(var(--kuja-sand-50))] px-3 py-2',
        className,
      )}
    >
      <Button
        type="button"
        onClick={onPrimary}
        disabled={disabled}
        size="sm"
        className="bg-[hsl(var(--kuja-clay))] text-white hover:bg-[hsl(var(--kuja-clay))]/90"
      >
        <Sparkles className={cn('mr-1.5 h-3.5 w-3.5', state === 'loading' && 'animate-pulse')} />
        {verb}
      </Button>
      {hint && (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {hint}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {trailing}
        {secondary && secondary.length > 0 && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              className={cn(
                'inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              )}
            >
              More AI tools
              <ChevronDown className="ml-1 h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {secondary.map((t, i) => (
                <DropdownMenuItem
                  key={i}
                  onClick={() => {
                    t.onClick();
                    setMenuOpen(false);
                  }}
                  className="flex flex-col items-start"
                >
                  <span className="text-sm">{t.label}</span>
                  {t.hint && (
                    <span className="text-[10px] text-muted-foreground">
                      {t.hint}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
