'use client';

import { useEffect, useState } from 'react';
import { Clock4 } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  median_days: number | null;
  pending: number;
}

export function PendingAgeStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-median-pending-age').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.median_days == null || data.pending < 3) return null;
  const tone = data.median_days >= 14 ? 'text-rose-700' : data.median_days >= 7 ? 'text-amber-700' : 'text-muted-foreground';

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Clock4 className="w-3 h-3 text-sky-600" />
        Pending reviews
      </span>
      <span className="tabular-nums">
        Median age <span className={`font-semibold ${tone}`}>{data.median_days}d</span>
        <span className="text-muted-foreground"> · {data.pending} open</span>
      </span>
    </div>
  );
}
