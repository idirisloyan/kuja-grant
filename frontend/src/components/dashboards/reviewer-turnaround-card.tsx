'use client';

/**
 * Phase 328 — Donor reviewer-turnaround tile.
 *
 * Top 5 slowest reviewers across this donor's grants over the trailing
 * 90 days, by average days from assignment to completion. Self-gates
 * when no qualified reviewers (need 3+ completed each).
 */

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Row {
  reviewer_user_id: number;
  reviewer_name: string;
  avg_days: number;
  n: number;
}

interface Resp {
  slowest: Row[];
  window_days: number;
}

export function ReviewerTurnaroundCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/reviewer-turnaround').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.slowest.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Timer className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Slowest reviewers
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          Avg days from assignment to completion (last {data.window_days}d).
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.slowest.map((r) => (
            <li key={r.reviewer_user_id} className="flex items-baseline justify-between gap-2">
              <span className="truncate">{r.reviewer_name}</span>
              <span className="tabular-nums text-muted-foreground">
                {r.avg_days}d <span className="text-muted-foreground/70">({r.n})</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
