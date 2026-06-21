'use client';

/**
 * Phase 333 — Admin per-reviewer scoreboard tile.
 *
 * Per-reviewer rollup: total assigned, completed, completion %, mean
 * score. Sorted by completion % ascending so the worst performers
 * surface first.
 */

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Row {
  reviewer_user_id: number;
  name: string;
  total: number;
  completed: number;
  completion_pct: number;
  mean_score: number | null;
}

interface Resp {
  reviewers: Row[];
}

export function ReviewerScoreboardCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/reviewer-scoreboard').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.reviewers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Users className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Reviewer scoreboard
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <ul className="space-y-1 text-xs">
          {data.reviewers.slice(0, 8).map((r) => {
            const tone = r.completion_pct >= 80 ? 'text-emerald-700'
              : r.completion_pct >= 50 ? 'text-amber-700'
              : 'text-rose-700';
            return (
              <li key={r.reviewer_user_id} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className="tabular-nums shrink-0">
                  <span className={tone}>{r.completion_pct}%</span>
                  <span className="text-muted-foreground"> · {r.completed}/{r.total}</span>
                  {r.mean_score != null && (
                    <span className="text-muted-foreground"> · μ{r.mean_score}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
