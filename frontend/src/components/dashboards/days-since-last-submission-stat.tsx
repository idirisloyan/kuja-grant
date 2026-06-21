'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  days: number | null;
  last_submitted_at?: string;
}

export function DaysSinceLastSubmissionStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-days-since-last-submission').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.days == null) return null;
  const stale = data.days > 60;
  const tone = stale ? 'text-amber-700' : 'text-muted-foreground';

  return (
    <div className={`rounded-md border ${stale ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/10' : 'border-border bg-card'} p-3 text-xs flex items-center justify-between`}>
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Calendar className={`w-3 h-3 ${stale ? 'text-amber-600' : 'text-sky-600'}`} />
        Last submission
      </span>
      <span className="tabular-nums">
        <span className={`font-semibold ${tone}`}>{data.days}d ago</span>
      </span>
    </div>
  );
}
