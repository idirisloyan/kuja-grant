'use client';

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  distinct_sectors: number;
}

export function SectorBreadthStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-sector-breadth').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.distinct_sectors === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Layers className="w-3 h-3 text-sky-600" />
        Sector breadth
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.distinct_sectors}</span> distinct sector
        {data.distinct_sectors === 1 ? '' : 's'} across your apps
      </span>
    </div>
  );
}
