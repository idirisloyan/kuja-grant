'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  completed_this_month: number;
  month_start: string;
}

export function CompletedThisMonthStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-completed-this-month').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.completed_this_month === 0) return null;
  const monthLabel = new Date(data.month_start).toLocaleString(undefined, { month: 'long' });

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <CalendarCheck className="w-3 h-3 text-emerald-600" />
        {monthLabel} so far
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.completed_this_month}</span> review
        {data.completed_this_month === 1 ? '' : 's'} completed
      </span>
    </div>
  );
}
