'use client';

import { useEffect, useState } from 'react';
import { Equal } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  median: number | null;
  sample: number;
}

export function MedianScoreStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-median-score').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.median == null || data.sample < 5) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Equal className="w-3 h-3 text-sky-600" />
        Last 30 days
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.median}</span> median score
        <span className="text-muted-foreground"> ({data.sample})</span>
      </span>
    </div>
  );
}
