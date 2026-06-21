'use client';

import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  drafts_30d: number;
  submitted_30d: number;
  conversion_pct: number;
}

export function DraftFunnelStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-draft-funnel').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.drafts_30d === 0) return null;
  const tone = data.conversion_pct >= 70 ? 'text-emerald-700' : data.conversion_pct >= 40 ? 'text-amber-700' : 'text-rose-700';

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">Last 30 days</span>
      <span className="tabular-nums inline-flex items-center gap-1">
        <GitBranch className="w-3 h-3 text-sky-600" />
        {data.submitted_30d} of {data.drafts_30d} drafts submitted
        <span className={`font-semibold ${tone}`}>({data.conversion_pct}%)</span>
      </span>
    </div>
  );
}
