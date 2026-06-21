'use client';

import { useEffect, useState } from 'react';
import { XCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function DeclinedThisMonthStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-declined-this-month').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <XCircle className="w-3 h-3 text-rose-500" />
        Declined this month
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> application{data.count === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}
