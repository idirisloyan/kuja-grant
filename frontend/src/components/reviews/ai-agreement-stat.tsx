'use client';

import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  agreement_pct: number | null;
  sample: number;
}

export function AiAgreementStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-ai-agreement').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.agreement_pct == null || data.sample < 5) return null;
  const pct = data.agreement_pct;
  const tone = pct >= 70 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-rose-700';

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">Last 90 days</span>
      <span className="tabular-nums inline-flex items-center gap-1">
        <Target className="w-3 h-3 text-sky-600" />
        Your score within ±5 of AI on{' '}
        <span className={`font-semibold ${tone}`}>{pct}%</span> of reviews
        <span className="text-muted-foreground"> ({data.sample})</span>
      </span>
    </div>
  );
}
