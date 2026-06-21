'use client';

/**
 * Phase 345 — Donor month-end decision forecast tile.
 *
 * Projects expected decisions by month-end from trailing 90-day daily
 * rate + decisions already recorded this month. Self-gates when too
 * thin to project.
 */

import { useEffect, useState } from 'react';
import { Telescope } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  decided_so_far_this_month: number;
  projected_total_this_month: number;
  daily_rate_90d: number;
  days_left: number;
}

export function DecisionForecastCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/decision-forecast').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.daily_rate_90d < 0.05) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Telescope className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Month-end forecast
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{data.projected_total_this_month}</span>
          <span className="text-xs text-muted-foreground">decisions expected this month</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {data.decided_so_far_this_month} so far · {data.days_left}d left · ~{data.daily_rate_90d}/day pace.
        </p>
      </CardContent>
    </Card>
  );
}
