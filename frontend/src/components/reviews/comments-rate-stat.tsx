'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  rate: number | null;
  sample: number;
}

export function CommentsRateStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-comments-rate').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.rate == null || data.sample < 3) return null;
  const low = data.rate < 50;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <MessageCircle className={`w-3 h-3 ${low ? 'text-amber-600' : 'text-sky-600'}`} />
        With comments (30d)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.rate}%</span>
        <span className="text-muted-foreground"> of {data.sample}</span>
      </span>
    </div>
  );
}
