'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  fastest_hours: number | null;
  sample: number;
}

export function FastestSubmissionStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-fastest-submission').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.fastest_hours == null || data.sample < 3) return null;
  const h = data.fastest_hours;
  const label = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">Last 90 days</span>
      <span className="tabular-nums inline-flex items-center gap-1">
        <Zap className="w-3 h-3 text-amber-500" />
        <span className="font-semibold">{label}</span> fastest draft-to-submit
        <span className="text-muted-foreground"> ({data.sample} apps)</span>
      </span>
    </div>
  );
}
