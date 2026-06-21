'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  mean_hours: number | null;
  sample: number;
}

export function ScoringTimeAvgStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-scoring-time-avg').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.mean_hours == null || data.sample < 3) return null;
  const h = data.mean_hours;
  const label = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Timer className="w-3 h-3 text-sky-600" />
        Last 30 days
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{label}</span> mean per review
        <span className="text-muted-foreground"> ({data.sample})</span>
      </span>
    </div>
  );
}
