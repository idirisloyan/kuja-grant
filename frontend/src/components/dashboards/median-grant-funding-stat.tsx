'use client';

import { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  median: number | null;
  sample: number;
  currency: string | null;
}

export function MedianGrantFundingStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-median-grant-funding').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.median == null || data.sample === 0) return null;
  const cur = data.currency || 'USD';
  const value = data.median.toLocaleString();

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <DollarSign className="w-3 h-3 text-emerald-600" />
        Across {data.sample} grants
      </span>
      <span className="tabular-nums">
        Median funding <span className="font-semibold">{cur} {value}</span>
      </span>
    </div>
  );
}
