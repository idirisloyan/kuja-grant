'use client';

import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
  grant_id?: number;
  grant_title?: string | null;
}

export function MostActiveGrantStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-most-active-grant').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;
  const title = data.grant_title || `Grant #${data.grant_id}`;
  const trimmed = title.length > 28 ? title.slice(0, 26) + '…' : title;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Repeat className="w-3 h-3 text-sky-600" />
        Most-applied grant
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">×{data.count}</span>
        <span className="text-muted-foreground"> {trimmed}</span>
      </span>
    </div>
  );
}
