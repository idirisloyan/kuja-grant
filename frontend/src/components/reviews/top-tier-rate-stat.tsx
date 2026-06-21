'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  top_tier_pct: number | null;
  top_count?: number;
  sample: number;
}

export function TopTierRateStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-top-tier-rate').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.top_tier_pct == null || data.sample < 5) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-amber-500" />
        Last 90 days
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.top_tier_pct}%</span> scored ≥ 90
        <span className="text-muted-foreground"> ({data.top_count ?? 0} of {data.sample})</span>
      </span>
    </div>
  );
}
