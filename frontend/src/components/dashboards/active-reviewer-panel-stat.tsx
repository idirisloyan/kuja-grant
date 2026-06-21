'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  active_reviewers: number;
}

export function ActiveReviewerPanelStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-active-reviewer-panel').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.active_reviewers === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Users className="w-3 h-3 text-sky-600" />
        Last 30 days
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.active_reviewers}</span> active reviewer
        {data.active_reviewers === 1 ? '' : 's'}
      </span>
    </div>
  );
}
