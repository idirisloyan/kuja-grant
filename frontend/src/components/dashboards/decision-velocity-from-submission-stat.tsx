'use client';

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  avg_days: number | null;
  sample: number;
}

export function DecisionVelocityFromSubmissionStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-decision-velocity-from-submission').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.avg_days == null || data.sample < 3) return null;
  const slow = data.avg_days > 60;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Gauge className={`w-3 h-3 ${slow ? 'text-amber-600' : 'text-sky-600'}`} />
        Avg wait for decision
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.avg_days}d</span>
        <span className="text-muted-foreground"> across {data.sample}</span>
      </span>
    </div>
  );
}
