'use client';

import { useEffect, useState } from 'react';
import { FilePlus } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  published_this_month: number;
  month_start: string;
}

export function GrantsPublishedMonthStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-grants-published-this-month').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.published_this_month === 0) return null;
  const monthLabel = new Date(data.month_start).toLocaleString(undefined, { month: 'long' });

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <FilePlus className="w-3 h-3 text-sky-600" />
        {monthLabel}
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.published_this_month}</span> grant
        {data.published_this_month === 1 ? '' : 's'} published
      </span>
    </div>
  );
}
