'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  this_year: number;
  prior_year: number;
  delta: number;
  pct_change: number | null;
  year: number;
}

export function AppsYoyStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-apps-year-over-year').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || (data.this_year === 0 && data.prior_year === 0)) return null;
  const Icon = data.delta >= 0 ? TrendingUp : TrendingDown;
  const tone = data.delta > 0 ? 'text-emerald-700' : data.delta < 0 ? 'text-rose-700' : 'text-muted-foreground';

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">{data.year} YTD vs {data.year - 1}</span>
      <span className="tabular-nums inline-flex items-center gap-1">
        <Icon className={`w-3 h-3 ${tone}`} />
        <span className="font-semibold">{data.this_year}</span>
        <span className="text-muted-foreground"> vs {data.prior_year}</span>
        {data.pct_change != null && (
          <span className={tone}> ({data.pct_change >= 0 ? '+' : ''}{data.pct_change}%)</span>
        )}
      </span>
    </div>
  );
}
