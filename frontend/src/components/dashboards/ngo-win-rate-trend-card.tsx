'use client';

/**
 * Phase 355 — NGO win rate trend tile.
 *
 * Award rate over last 3 months vs prior 3 months. Self-gates when
 * both windows have < 3 decisions.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  recent_total: number;
  recent_win_rate: number | null;
  prior_total: number;
  prior_win_rate: number | null;
}

export function NgoWinRateTrendCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-win-rate-trend').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.recent_total < 3 || data.prior_total < 3) return null;
  if (data.recent_win_rate == null || data.prior_win_rate == null) return null;
  const delta = Math.round((data.recent_win_rate - data.prior_win_rate) * 10) / 10;
  const tone = delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-700' : 'text-muted-foreground';
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : TrendingUp;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Icon className={`w-4 h-4 ${tone}`} />
          Win rate trend
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{data.recent_win_rate}%</span>
          <span className={`text-xs tabular-nums ${tone}`}>
            {delta > 0 ? '+' : ''}{delta}pp
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Last 90 days ({data.recent_total} decided) vs prior 90 days ({data.prior_total} decided).
        </p>
      </CardContent>
    </Card>
  );
}
