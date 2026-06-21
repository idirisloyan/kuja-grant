'use client';

import { useEffect, useState } from 'react';
import { Layers3 } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  distinct_grants: number;
}

export function ReviewVarietyStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-review-variety').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.distinct_grants === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Layers3 className="w-3 h-3 text-sky-600" />
        Variety (30d)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.distinct_grants}</span>
        <span className="text-muted-foreground"> distinct grant{data.distinct_grants === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}
