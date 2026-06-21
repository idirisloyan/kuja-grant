'use client';

import { useEffect, useState } from 'react';
import { Edit3 } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function RevisionRequestedStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-revision-requested-count').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Edit3 className="w-3 h-3 text-amber-600" />
        Revisions requested
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> awaiting your edit</span>
      </span>
    </div>
  );
}
