'use client';

/**
 * Phase 322 — Admin AI cost forecast tile.
 *
 * Projects month-end AI cost from the trailing 7-day daily rate.
 * Self-gates when the 7-day sample is zero (cold-start guard).
 */

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_days: number;
  total_7d: number;
  daily_avg: number;
  projected_monthly: number;
}

export function AiCostForecastCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ai-cost-forecast').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total_7d === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          AI cost forecast
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">${data.projected_monthly}</span>
          <span className="text-xs text-muted-foreground">projected this month</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Based on last 7 days: ${data.total_7d} (~${data.daily_avg}/day).
        </p>
      </CardContent>
    </Card>
  );
}
