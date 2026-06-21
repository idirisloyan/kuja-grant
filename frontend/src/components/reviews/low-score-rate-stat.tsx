'use client';

import { useEffect, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  low_score_pct: number | null;
  low_count?: number;
  sample: number;
}

export function LowScoreRateStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-low-score-rate').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.low_score_pct == null || data.sample < 5) return null;
  const pct = data.low_score_pct;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <TrendingDown className="w-3 h-3 text-rose-600" />
        Last 90 days
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{pct}%</span> scored {'<'} 50
        <span className="text-muted-foreground"> ({data.low_count ?? 0} of {data.sample})</span>
      </span>
    </div>
  );
}
