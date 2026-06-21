'use client';

import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function CompletedTodayStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-completed-today').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10 p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <CheckCircle className="w-3 h-3 text-emerald-600" />
        Completed (24h)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> review{data.count === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}
