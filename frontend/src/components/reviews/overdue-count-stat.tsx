'use client';

import { useEffect, useState } from 'react';
import { AlarmClock } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  overdue: number;
  cutoff_days: number;
}

export function OverdueCountStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-overdue-count').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.overdue === 0) return null;

  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 inline-flex items-center gap-2">
      <AlarmClock className="w-4 h-4" />
      <span>
        <span className="font-semibold tabular-nums">{data.overdue}</span> review
        {data.overdue === 1 ? '' : 's'} overdue (assigned &gt;{data.cutoff_days}d ago, not started).
      </span>
    </div>
  );
}
