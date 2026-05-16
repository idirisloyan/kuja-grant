'use client';

/**
 * TrustGapInsightsCard — Phase 18A (May 2026).
 *
 * Sits below the TrustProfileCard. Pulls /api/trust-profile/<id>/gap-insights
 * (AI-narrated) and renders:
 *   - Current vs projected score
 *   - 3-5 prioritized actions with effort + estimated lift
 *   - 1-paragraph summary of where the gaps are
 *
 * Empty / sparse / unavailable states all render quietly — never block
 * the page if AI is down.
 */

import { useEffect, useState } from 'react';
import {
  Lightbulb, ChevronRight, Loader2, Zap, Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface GapAction {
  title: string;
  detail?: string;
  target_component?: string;
  estimated_pillar: 'capacity' | 'diligence';
  estimated_lift_points: number;
  effort: 'low' | 'medium' | 'high';
}

interface GapInsights {
  success: boolean;
  source: 'ai' | 'unavailable';
  current_overall?: number;
  projected_overall?: number;
  gap_summary?: string | null;
  total_estimated_lift?: number;
  actions?: GapAction[];
}

const EFFORT_META: Record<string, { cls: string; label: string }> = {
  low:    { cls: 'text-[hsl(var(--kuja-grow))]', label: 'Low effort' },
  medium: { cls: 'text-[hsl(var(--kuja-sun))]',  label: 'Medium effort' },
  high:   { cls: 'text-[hsl(var(--kuja-flag))]', label: 'High effort' },
};

const PILLAR_META: Record<string, { cls: string; label: string }> = {
  capacity:  { cls: 'border-[hsl(var(--kuja-clay))]', label: 'Capacity' },
  diligence: { cls: 'border-[hsl(var(--kuja-spark))]', label: 'Diligence' },
};

interface Props {
  orgId: number;
}

export function TrustGapInsightsCard({ orgId }: Props) {
  const [data, setData] = useState<GapInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    api.get<GapInsights>(`/api/trust-profile/${orgId}/gap-insights`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Computing gap analysis…
        </div>
      </Card>
    );
  }

  if (!data || !data.success || data.source !== 'ai' || !data.actions?.length) {
    return null;
  }

  const lift = data.total_estimated_lift ?? 0;
  const current = data.current_overall ?? 0;
  const projected = data.projected_overall ?? current;

  return (
    <Card className="p-4 sm:p-5 border-[hsl(var(--kuja-spark))]/30">
      <div className="mb-3 flex items-start gap-2 flex-wrap">
        <Lightbulb className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-spark))]" aria-hidden="true" />
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Close the gap
            <Sparkles className="h-3 w-3" />
          </div>
          <h3 className="kuja-display text-lg">How to lift your trust score</h3>
          <p className="text-xs text-muted-foreground">
            AI reads your two pillars + sub-components and prioritises the highest-leverage actions.
          </p>
        </div>
        {lift > 0 && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Projection
            </div>
            <div className="flex items-center gap-1.5 font-semibold tabular-nums">
              <span className="text-muted-foreground">{current}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-[hsl(var(--kuja-grow))]">{projected}</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                (+{lift})
              </span>
            </div>
          </div>
        )}
      </div>

      {data.gap_summary && (
        <div className="mb-3 rounded-md border-l-2 border-[hsl(var(--kuja-spark))] bg-[hsl(var(--kuja-sand))]/40 p-3">
          <p className="text-sm leading-relaxed">{data.gap_summary}</p>
        </div>
      )}

      <div className="space-y-2">
        {data.actions.map((a, i) => {
          const effort = EFFORT_META[a.effort] ?? EFFORT_META.medium;
          const pillar = PILLAR_META[a.estimated_pillar] ?? PILLAR_META.capacity;
          return (
            <div
              key={i}
              className={cn(
                'rounded-md border border-l-4 border-[hsl(var(--border))] p-3',
                pillar.cls,
              )}
            >
              <div className="flex items-start gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                  {i + 1}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{a.title}</span>
                    <Badge variant="outline" className="text-[10px]">{pillar.label}</Badge>
                  </div>
                  {a.detail && (
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {a.detail}
                    </p>
                  )}
                  {a.target_component && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Targets: <code className="px-1 py-0.5 rounded bg-[hsl(var(--kuja-sand))]/40">{a.target_component}</code>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={cn('text-[10px] font-semibold', effort.cls)}>
                    {effort.label}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs font-semibold text-[hsl(var(--kuja-grow))]">
                    <Zap className="h-3 w-3" />
                    +{a.estimated_lift_points} pts
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Lift estimates are AI projections, not guarantees. Quick wins first.
      </p>
    </Card>
  );
}
