'use client';

import { useEffect, useState } from 'react';
import { Medal } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  lifetime_completed: number;
}

export function LifetimeCompletedStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-lifetime-completed').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.lifetime_completed === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Medal className="w-3 h-3 text-amber-500" />
        Lifetime
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.lifetime_completed.toLocaleString()}</span> review
        {data.lifetime_completed === 1 ? '' : 's'} completed
      </span>
    </div>
  );
}
