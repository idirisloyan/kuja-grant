'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  lift: number | null;
  sample: number;
}

export function AiScoreLiftStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-ai-score-lift').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.lift == null || data.sample < 3) return null;
  const positive = data.lift > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const sign = positive ? '+' : '';

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Icon className={`w-3 h-3 ${positive ? 'text-emerald-600' : 'text-amber-600'}`} />
        Score lift vs AI
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{sign}{data.lift}</span>
        <span className="text-muted-foreground"> avg ({data.sample})</span>
      </span>
    </div>
  );
}
