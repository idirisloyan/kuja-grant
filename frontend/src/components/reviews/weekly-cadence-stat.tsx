'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';

interface WeekRow {
  week_offset: number;
  count: number;
}

interface Resp {
  weeks: WeekRow[];
  total: number;
}

export function WeeklyCadenceStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-weekly-cadence').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.total === 0) return null;
  const max = Math.max(...data.weeks.map((w) => w.count), 1);
  const ordered = [...data.weeks].sort((a, b) => b.week_offset - a.week_offset);

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <BarChart3 className="w-3 h-3 text-sky-600" />
          Weekly cadence (4w)
        </span>
        <span className="tabular-nums font-semibold">{data.total}</span>
      </div>
      <div className="flex items-end gap-1 h-8">
        {ordered.map((w) => (
          <div
            key={w.week_offset}
            className="flex-1 rounded-sm bg-sky-200 dark:bg-sky-800"
            style={{ height: `${Math.max((w.count / max) * 100, 8)}%` }}
            title={`${w.count} reviews`}
          />
        ))}
      </div>
    </div>
  );
}
