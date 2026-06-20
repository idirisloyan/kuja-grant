'use client';

/**
 * PreSubmitPreview — Phase 98.7 (design backlog Wave 3 "Foresight")
 *
 * Before the NGO submits an application or report, AI shows a 30-second
 * preview of how it will likely be scored and the 1-2 cheapest fixes.
 *
 * Turns reactive AI (the existing auto-rubric + why-rejected) into
 * forward-looking coaching, so rejection is rarer.
 *
 * Renders one of three states:
 *   - 'loading'  — AI is computing preview
 *   - 'ready'    — show predicted score + top 2 fixes
 *   - 'low-conf' — AI didn't have enough to predict; show what's missing
 *
 * The component itself is dumb. The parent calls /api/applications/X/pre-submit
 * (or similar) and passes the result here.
 */

import { Sparkles, TrendingUp, Wrench, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIConfidenceBadge } from './ai-confidence-badge';
import { AIFallbackNotice } from './ai-fallback-notice';
import { AIFeedbackChip } from './ai-feedback-chip';
import { cn } from '@/lib/utils';

export interface Fix {
  /** Short imperative: "Add a budget line for travel". */
  label: string;
  /** Field id the fix should jump to. */
  fieldId?: string;
  /** Estimated minutes to apply this fix. */
  estimatedMinutes?: number;
}

type Status = 'loading' | 'ready' | 'low-conf';

interface Props {
  status: Status;
  /** Predicted score band; e.g. "Likely strong" or "Borderline". */
  predictedBand?: string;
  /** AI's confidence in this prediction. */
  confidence?: 'high' | 'medium' | 'low';
  /** Top 1-2 cheap fixes that would move the score. */
  fixes?: Fix[];
  /** Optional rationale sentence from the AI prediction (Phase 103). */
  rationale?: string | null;
  /** AI call meta — used to render the fallback notice. */
  meta?: { fallback_used?: boolean; model?: string | null; fallback_from?: string | null } | null;
  /** Phase 125 — AI call id for the helpfulness chip. */
  callId?: number | null;
  /** Called when the user clicks "Submit anyway" / "I'll fix first". */
  onSubmitAnyway?: () => void;
  onFixIt?: (fix: Fix) => void;
  className?: string;
}

export function PreSubmitPreview({
  status,
  predictedBand,
  confidence,
  fixes,
  rationale,
  meta,
  callId,
  onSubmitAnyway,
  onFixIt,
  className,
}: Props) {
  if (status === 'loading') {
    return (
      <div
        className={cn(
          'animate-pulse rounded-lg border border-border bg-muted/40 p-4',
          className,
        )}
      >
        <div className="mb-2 h-4 w-32 rounded bg-muted" />
        <div className="h-3 w-56 rounded bg-muted" />
      </div>
    );
  }

  if (status === 'low-conf') {
    return (
      <div
        className={cn(
          'rounded-lg border border-amber-200 bg-amber-50/60 p-4',
          className,
        )}
      >
        <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-900">
          <AlertCircle className="h-4 w-4" />
          Not enough to preview yet
        </div>
        <p className="text-xs text-amber-900/80">
          Finish a few more fields and we&apos;ll show you what the reviewer will likely see.
        </p>
      </div>
    );
  }

  // 'ready'
  return (
    <div
      className={cn(
        'rounded-lg border border-emerald-200 bg-emerald-50/50 p-4',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-emerald-700" />
          <span className="text-sm font-medium text-emerald-900">
            What a reviewer will likely see
          </span>
        </div>
        {confidence && <AIConfidenceBadge confidence={confidence} variant="inline" />}
      </div>

      {predictedBand && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <TrendingUp className="h-5 w-5 text-emerald-700" />
          <span className="font-serif text-xl font-medium text-emerald-900">
            {predictedBand}
          </span>
          {meta?.fallback_used && (
            <AIFallbackNotice meta={meta} compact />
          )}
        </div>
      )}

      {/* Phase 103 — AI rationale ("reviewer's-eye view"). Optional. */}
      {rationale && (
        <p className="mb-3 text-xs italic text-emerald-900/80 border-l-2 border-emerald-300 pl-2">
          {rationale}
        </p>
      )}

      {/* Phase 104 — full-banner fallback notice when there is no
          predictedBand row to attach the compact chip to. */}
      {meta?.fallback_used && !predictedBand && (
        <div className="mb-3">
          <AIFallbackNotice meta={meta} />
        </div>
      )}

      {fixes && fixes.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Wrench className="h-3 w-3" />
            Two quick fixes that would move the score
          </div>
          <ul className="space-y-1">
            {fixes.slice(0, 2).map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5">
                <div className="flex-1">
                  <span className="text-xs">{f.label}</span>
                  {f.estimatedMinutes != null && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ~{f.estimatedMinutes} min
                    </span>
                  )}
                </div>
                {onFixIt && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onFixIt(f)}
                    className="h-6 text-[10px]"
                  >
                    Fix it
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {onSubmitAnyway && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onSubmitAnyway}
            className="h-7 text-xs text-muted-foreground"
          >
            Submit anyway
          </Button>
        )}
        {/* Phase 125 — AI feedback chip on pre-submit predictions. */}
        {callId != null && (
          <AIFeedbackChip callId={callId} surfaceLabel="pre-submit preview" />
        )}
      </div>
    </div>
  );
}
