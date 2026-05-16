'use client';

/**
 * ScoreBreakdownCard — Phase 22A (May 2026).
 *
 * Decomposes the human-review overall score into per-criterion
 * contributions. Helps NGOs understand WHY they got a score, not just
 * the headline number. Privacy: aggregated mean per criterion + panel
 * comments tagged "from review panel" (no per-reviewer attribution).
 *
 * Quiet on no-reviews state — caller checks first.
 */

import { useEffect, useState } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, MessageSquare, Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CriterionBreakdown {
  key: string;
  label: string;
  weight: number;
  mean_score: number | null;
  reviewer_count: number;
  weighted_contribution: number | null;
  comments: string[];
}

interface BreakdownResp {
  success: boolean;
  reason?: string;
  criteria_breakdown: CriterionBreakdown[];
  overall_human_score: number | null;
  overall_human_score_computed: number | null;
  reviewer_count: number;
  strongest_criteria: string[];
  weakest_criteria: string[];
}

function scoreTone(s: number | null) {
  if (s == null) return 'text-[hsl(var(--kuja-ink-soft))]';
  if (s >= 80) return 'text-[hsl(var(--kuja-grow))]';
  if (s >= 60) return 'text-[hsl(var(--kuja-sun))]';
  return 'text-[hsl(var(--kuja-flag))]';
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const bg = pct >= 80
    ? 'bg-[hsl(var(--kuja-grow))]'
    : pct >= 60
      ? 'bg-[hsl(var(--kuja-sun))]'
      : 'bg-[hsl(var(--kuja-flag))]';
  return (
    <div className="h-1.5 w-full rounded-full bg-[hsl(var(--kuja-sand))]/40 overflow-hidden">
      <div className={cn('h-full rounded-full', bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface Props {
  applicationId: number;
}

export function ScoreBreakdownCard({ applicationId }: Props) {
  const [data, setData] = useState<BreakdownResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    api.get<BreakdownResp>(`/api/applications/${applicationId}/score-breakdown`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applicationId]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading score breakdown…
        </div>
      </Card>
    );
  }
  if (!data || !data.success || data.reviewer_count === 0) return null;

  const { criteria_breakdown, overall_human_score, overall_human_score_computed,
          reviewer_count, strongest_criteria, weakest_criteria } = data;

  // Sort criteria so weakest comes last (visual: gradient bottom = act here)
  const sorted = [...criteria_breakdown].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2 flex-wrap">
        <BarChart3 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Score breakdown
          </div>
          <h3 className="kuja-display text-lg">How your overall score is built</h3>
          <p className="text-xs text-muted-foreground">
            Per-criterion mean across {reviewer_count} reviewer{reviewer_count === 1 ? '' : 's'} · weighted contribution to your final.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Overall</div>
          <div className={cn('text-2xl font-semibold tabular-nums', scoreTone(overall_human_score ?? overall_human_score_computed))}>
            {overall_human_score ?? overall_human_score_computed ?? '—'}
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {sorted.map((c) => {
          const isStrong = strongest_criteria.includes(c.key);
          const isWeak = weakest_criteria.includes(c.key);
          return (
            <div
              key={c.key}
              className={cn(
                'rounded-md border p-3 space-y-1.5',
                isStrong && 'border-[hsl(var(--kuja-grow))]/40',
                isWeak && 'border-[hsl(var(--kuja-flag))]/40',
                !isStrong && !isWeak && 'border-[hsl(var(--border))]',
              )}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{c.label}</span>
                  <Badge variant="outline" className="text-[10px]">{c.weight}% weight</Badge>
                  {isStrong && (
                    <Badge variant="outline" className="text-[10px] border-[hsl(var(--kuja-grow))] text-[hsl(var(--kuja-grow))]">
                      <TrendingUp className="h-2.5 w-2.5 mr-1" /> Strongest
                    </Badge>
                  )}
                  {isWeak && (
                    <Badge variant="outline" className="text-[10px] border-[hsl(var(--kuja-flag))] text-[hsl(var(--kuja-flag))]">
                      <TrendingDown className="h-2.5 w-2.5 mr-1" /> Weakest
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {c.mean_score != null ? (
                    <>
                      <span className={cn('font-semibold tabular-nums', scoreTone(c.mean_score))}>
                        {c.mean_score}/100
                      </span>
                      {c.weighted_contribution != null && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          (+{c.weighted_contribution} to overall)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">not scored</span>
                  )}
                </div>
              </div>
              {c.mean_score != null && <ScoreBar value={c.mean_score} />}

              {c.comments.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {c.comments.length} panel comment{c.comments.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-1 space-y-1 pl-4">
                    {c.comments.map((cm, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground border-l-2 border-[hsl(var(--border))] pl-2">
                        {cm}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Mean per criterion · reviewer identities never shown · {reviewer_count} reviewer{reviewer_count === 1 ? '' : 's'} contributed.
      </p>
    </Card>
  );
}
