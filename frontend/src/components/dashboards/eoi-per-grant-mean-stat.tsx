'use client';

import { useEffect, useState } from 'react';
import { HandHeart } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  mean: number | null;
  grants: number;
  eois?: number;
}

export function EoiPerGrantMeanStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-eoi-per-grant-mean').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.mean == null || data.grants === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <HandHeart className="w-3 h-3 text-sky-600" />
        EOI per grant
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.mean}</span>
        <span className="text-muted-foreground"> avg ({data.grants} grants)</span>
      </span>
    </div>
  );
}
