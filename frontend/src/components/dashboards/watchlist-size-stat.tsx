'use client';

import { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  watchlist_size: number;
}

export function WatchlistSizeStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-watchlist-size').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.watchlist_size === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Bookmark className="w-3 h-3 text-sky-600" />
        Watchlist
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.watchlist_size}</span> grant
        {data.watchlist_size === 1 ? '' : 's'} tracked
      </span>
    </div>
  );
}
