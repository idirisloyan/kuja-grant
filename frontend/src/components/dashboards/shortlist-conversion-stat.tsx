'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  rate: number | null;
  sample: number;
  funded?: number;
}

export function ShortlistConversionStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-shortlist-conversion').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.rate == null || data.sample < 3) return null;
  const high = data.rate >= 70;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Trophy className={`w-3 h-3 ${high ? 'text-emerald-600' : 'text-sky-600'}`} />
        Shortlist conversion
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.rate}%</span>
        <span className="text-muted-foreground"> of {data.sample} starred</span>
      </span>
    </div>
  );
}
