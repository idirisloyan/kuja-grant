'use client';

/**
 * Phase 220 — Donor "median decision time" stat.
 *
 * Reads `/api/dashboard/stats` and renders the median days from
 * submitted_at → decision_recorded_at across the donor's grants.
 * Hidden when no decisions have been recorded yet.
 */

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  median_decision_days?: number | null;
  decisions_counted?: number;
}

export function DecisionTimeCard() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/stats').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.median_decision_days == null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Timer className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Median decision time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">
          {data.median_decision_days} <span className="text-base font-normal">days</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          across {data.decisions_counted ?? 0} decision{data.decisions_counted === 1 ? '' : 's'} on your grants
        </div>
      </CardContent>
    </Card>
  );
}
