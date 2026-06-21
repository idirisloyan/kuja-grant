'use client';

import { useEffect, useState } from 'react';
import { UserMinus } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function ApplicationsWithoutReviewerStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-applications-without-reviewer').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;
  const high = data.count >= 5;

  return (
    <div className={`rounded-md border ${high ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/10' : 'border-border bg-card'} p-3 text-xs flex items-center justify-between`}>
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <UserMinus className={`w-3 h-3 ${high ? 'text-amber-600' : 'text-sky-600'}`} />
        Awaiting reviewer
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> application{data.count === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}
