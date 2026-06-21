'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function CoiDisclosedCountStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-coi-disclosed-count').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <ShieldAlert className="w-3 h-3 text-amber-600" />
        COI disclosed
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> lifetime</span>
      </span>
    </div>
  );
}
