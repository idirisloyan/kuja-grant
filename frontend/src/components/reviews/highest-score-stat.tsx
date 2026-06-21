'use client';

import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  score: number | null;
  application_id?: number;
}

export function HighestScoreStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-highest-score').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.score == null) return null;

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10 p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Award className="w-3 h-3 text-emerald-600" />
        Top score (90d)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.score}</span>
        {data.application_id ? (
          <span className="text-muted-foreground"> on App #{data.application_id}</span>
        ) : null}
      </span>
    </div>
  );
}
