'use client';

/**
 * ScoreBreakdown — Phase 5.2
 *
 * Renders any aggregate score with a click-to-expand component panel.
 * Used wherever the product surfaces a percentage (compliance %, readiness %,
 * application AI score, match score). Clicking the score reveals the
 * named components that produced it, so users can answer "why this number?"
 * without leaving the flow.
 *
 * Two modes:
 *   - 'pill'   small inline number with a chevron; expands inline
 *   - 'card'   larger badge that opens a drawer-style breakdown
 *
 * The component is presentation-only: callers pass the components as
 * { key, label, value, max?, tone? }. No fetching here.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { cn } from '@/lib/utils';

export interface ScoreComponent {
  key: string;
  label: string;
  value: number;
  /** Optional ceiling — when provided the row shows value/max + a bar. */
  max?: number;
  /** Optional tone override; otherwise we color from value/max. */
  tone?: 'success' | 'warn' | 'danger' | 'neutral';
  /** Optional one-line explainer shown below the row. */
  explainer?: string;
}

interface Props {
  /** The aggregate score (0–100 typical). */
  score: number;
  /** Display label for the score, e.g. "Compliance" or "Match score". */
  label: string;
  /** Components that summed/averaged to the score. */
  components: ScoreComponent[];
  /** Optional rationale shown above the components. */
  rationale?: string;
  variant?: 'pill' | 'card';
  /** Optional className applied to the outer wrapper. */
  className?: string;
}

const SCORE_TONE = (s: number) => {
  if (s >= 75) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (s >= 50) return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-800';
};

const COMP_TONE = (value: number, max?: number, tone?: ScoreComponent['tone']) => {
  if (tone === 'success') return 'bg-emerald-500';
  if (tone === 'warn') return 'bg-amber-500';
  if (tone === 'danger') return 'bg-rose-500';
  if (tone === 'neutral') return 'bg-muted-foreground/40';
  if (max && max > 0) {
    const pct = value / max;
    if (pct >= 0.75) return 'bg-emerald-500';
    if (pct >= 0.4) return 'bg-amber-500';
    return 'bg-rose-500';
  }
  return 'bg-[hsl(var(--kuja-clay))]';
};

export function ScoreBreakdown({
  score,
  label,
  components,
  rationale,
  variant = 'pill',
  className = '',
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tone = SCORE_TONE(score);
  const total = components.reduce((acc, c) => acc + (c.max ?? 0), 0);

  return (
    <div className={cn(variant === 'card' ? 'rounded-md border border-border bg-card p-3' : '', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium',
          variant === 'pill' ? 'rounded-full border px-2 py-0.5' : 'rounded-md px-2 py-1',
          variant === 'pill' ? tone : 'bg-transparent text-foreground hover:bg-muted',
        )}
        aria-expanded={open}
        title={t('score_breakdown.tooltip')}
      >
        {variant === 'card' && <Info className="h-3.5 w-3.5" />}
        <span className="kuja-numeric font-bold">{Math.round(score)}%</span>
        <span className="hidden sm:inline">{label}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className={cn(
          'mt-2 space-y-1.5',
          variant === 'pill' && 'rounded-md border border-border bg-card p-2',
        )}>
          {rationale && (
            <p className="text-[11px] text-muted-foreground">{rationale}</p>
          )}
          {components.length === 0 ? (
            <div className="text-[11px] italic text-muted-foreground">
              {t('score_breakdown.empty')}
            </div>
          ) : (
            <ul className="space-y-1">
              {components.map((c) => {
                const widthPct = c.max && c.max > 0
                  ? Math.round((c.value / c.max) * 100)
                  : Math.min(100, Math.round(c.value));
                const dot = COMP_TONE(c.value, c.max, c.tone);
                return (
                  <li key={c.key} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium">{c.label}</span>
                      <span className="kuja-numeric text-[11px] text-muted-foreground">
                        {c.max != null ? `${c.value}/${c.max}` : `${c.value}`}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full transition-all', dot)}
                        style={{ width: `${Math.max(2, widthPct)}%` }}
                      />
                    </div>
                    {c.explainer && (
                      <div className="text-[10px] text-muted-foreground">{c.explainer}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {total > 0 && (
            <div className="border-t border-border pt-1 text-[10px] text-muted-foreground">
              {t('score_breakdown.max_total', { n: total })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
