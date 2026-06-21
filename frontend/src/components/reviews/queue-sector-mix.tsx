'use client';

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  sectors: Array<{ sector: string; count: number }>;
  total: number;
}

export function QueueSectorMix() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-queue-sector-mix').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.total === 0 || data.sectors.length === 0) return null;
  const topThree = data.sectors.slice(0, 3).map((s) => `${s.sector} (${s.count})`).join(' · ');

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center gap-2">
      <Layers className="w-4 h-4 text-sky-600" />
      <span>
        <span className="font-semibold">{data.total}</span> in queue · {topThree}
      </span>
    </div>
  );
}
