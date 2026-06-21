'use client';

import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
  total: number;
  currency: string | null;
}

export function FundingTotalYtdStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-funding-total-ytd').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;
  const cur = data.currency || 'USD';
  const total = data.total.toLocaleString();

  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/20 p-3 text-xs flex items-center justify-between">
      <span className="text-emerald-900 dark:text-emerald-200 inline-flex items-center gap-1">
        <Coins className="w-3 h-3 text-emerald-600" />
        Funding awarded YTD
      </span>
      <span className="tabular-nums text-emerald-900 dark:text-emerald-200">
        <span className="font-semibold">{cur} {total}</span>
        <span className="text-muted-foreground"> across {data.count} grant{data.count === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}
