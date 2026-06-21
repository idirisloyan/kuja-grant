'use client';

import { useEffect, useState } from 'react';
import { AlarmClock } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  days: number | null;
  deadline?: string;
}

export function NextDeadlineStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-next-deadline').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.days == null) return null;
  const overdue = data.days < 0;
  const tight = data.days >= 0 && data.days <= 3;
  const tone = overdue ? 'border-rose-200 bg-rose-50/40 dark:bg-rose-950/10' : tight ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/10' : 'border-border bg-card';
  const label = overdue
    ? `${Math.abs(data.days)}d overdue`
    : data.days === 0
      ? 'today'
      : `in ${data.days}d`;

  return (
    <div className={`rounded-md border ${tone} p-3 text-xs flex items-center justify-between`}>
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <AlarmClock className={`w-3 h-3 ${overdue ? 'text-rose-600' : tight ? 'text-amber-600' : 'text-sky-600'}`} />
        Next deadline
      </span>
      <span className="tabular-nums font-semibold">{label}</span>
    </div>
  );
}
