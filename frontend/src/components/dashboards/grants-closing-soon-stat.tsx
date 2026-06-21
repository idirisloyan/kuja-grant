'use client';

import { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function GrantsClosingSoonStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-grants-closing-7d').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Hourglass className="w-3 h-3 text-amber-600" />
        Closing in 7 days
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> grant{data.count === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}
