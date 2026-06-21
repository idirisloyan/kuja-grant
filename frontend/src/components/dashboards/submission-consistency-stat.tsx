'use client';

import { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  months_with_submission: number;
  sample: number;
}

export function SubmissionConsistencyStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-submission-consistency').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.months_with_submission === 0) return null;
  const n = data.months_with_submission;
  const steady = n >= 8;

  return (
    <div className={`rounded-md border ${steady ? 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10' : 'border-border bg-card'} p-3 text-xs flex items-center justify-between`}>
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <CalendarRange className={`w-3 h-3 ${steady ? 'text-emerald-600' : 'text-sky-600'}`} />
        Active months (12)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{n}/12</span>
      </span>
    </div>
  );
}
