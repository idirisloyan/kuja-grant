'use client';

import { useEffect, useState } from 'react';
import { Type } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  avg_words: number | null;
  sample: number;
}

export function AvgRationaleLengthStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-avg-rationale-length').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.avg_words == null || data.sample < 3) return null;
  const w = data.avg_words;
  const thin = w < 20;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Type className={`w-3 h-3 ${thin ? 'text-amber-600' : 'text-sky-600'}`} />
        Rationale depth (30d)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{w}</span>
        <span className="text-muted-foreground"> words/review ({data.sample})</span>
      </span>
    </div>
  );
}
