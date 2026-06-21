'use client';

import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  std_dev: number | null;
  sample: number;
}

export function ScoringTightnessStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-scoring-tightness').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.std_dev == null || data.sample < 3) return null;
  const label =
    data.std_dev < 5 ? 'tight' : data.std_dev < 15 ? 'moderate' : 'spread';

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Target className="w-3 h-3 text-sky-600" />
        Score spread (30d)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">σ {data.std_dev}</span>
        <span className="text-muted-foreground"> {label} ({data.sample})</span>
      </span>
    </div>
  );
}
