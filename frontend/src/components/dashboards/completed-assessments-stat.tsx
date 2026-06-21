'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  completed: number;
  most_recent: string | null;
}

export function CompletedAssessmentsStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-completed-assessments').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.completed === 0) return null;
  const recentLabel = data.most_recent
    ? new Date(data.most_recent).toLocaleDateString()
    : null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <ShieldCheck className="w-3 h-3 text-emerald-600" />
        Capacity assessments
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.completed}</span> completed
        {recentLabel && <span className="text-muted-foreground"> · last {recentLabel}</span>}
      </span>
    </div>
  );
}
