'use client';

import { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function AiCalls7dStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-ai-calls-7d').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Brain className="w-3 h-3 text-violet-600" />
        AI calls (7d)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> by your team</span>
      </span>
    </div>
  );
}
