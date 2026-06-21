'use client';

import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  tokens_in: number;
  tokens_out: number;
  total: number;
}

export function AiTokensTodayStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/admin-ai-tokens-today').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.total === 0) return null;
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Cpu className="w-3 h-3 text-violet-600" />
        AI tokens (24h)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{fmt(data.total)}</span>
        <span className="text-muted-foreground"> {fmt(data.tokens_in)} in / {fmt(data.tokens_out)} out</span>
      </span>
    </div>
  );
}
