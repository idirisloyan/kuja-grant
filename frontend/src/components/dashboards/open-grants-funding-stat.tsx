'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  total: number;
  open_count: number;
  currency: string | null;
}

export function OpenGrantsFundingStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-open-grants-funding').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.open_count === 0 || data.total === 0) return null;
  const cur = data.currency || 'USD';
  const value = data.total.toLocaleString();

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Wallet className="w-3 h-3 text-emerald-600" />
        Open pipeline
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{cur} {value}</span>
        <span className="text-muted-foreground"> across {data.open_count} open grants</span>
      </span>
    </div>
  );
}
