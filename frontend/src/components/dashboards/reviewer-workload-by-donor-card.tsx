'use client';

/**
 * Phase 299 — Donor "applications by reviewer" rollup.
 *
 * Shows which reviewer covers what share of the donor's review workload
 * + their avg pace (days to complete). Self-gates when no rows.
 */

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Row {
  reviewer_user_id: number;
  reviewer_name: string;
  total: number;
  completed: number;
  share_pct: number;
  avg_days_to_complete: number | null;
}

interface Resp {
  reviewers: Row[];
  total: number;
  window_days: number;
}

export function ReviewerWorkloadByDonorCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/reviewer-workload-by-donor').then((r) => {
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
          Review workload by reviewer
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          Across {data.total} reviews in the last {data.window_days} days.
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.reviewers.slice(0, 6).map((r) => (
            <li key={r.reviewer_user_id} className="flex items-baseline justify-between gap-2">
              <span className="truncate">{r.reviewer_name}</span>
              <span className="text-muted-foreground tabular-nums">
                {r.total} ({r.share_pct}%)
                {r.avg_days_to_complete != null && ` · ~${r.avg_days_to_complete}d`}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
