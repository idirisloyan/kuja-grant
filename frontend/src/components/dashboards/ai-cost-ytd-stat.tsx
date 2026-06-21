'use client';

import { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  usd_cost: number;
}

export function AiCostYtdStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-ai-cost-ytd').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.usd_cost < 0.01) return null;
  const label = data.usd_cost < 1 ? `$${data.usd_cost.toFixed(3)}` : `$${data.usd_cost.toFixed(2)}`;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <DollarSign className="w-3 h-3 text-violet-600" />
        AI cost (YTD)
      </span>
      <span className="tabular-nums font-semibold">{label}</span>
    </div>
  );
}
