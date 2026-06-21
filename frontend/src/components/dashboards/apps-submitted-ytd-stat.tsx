'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  submitted_ytd: number;
  year_start: string;
}

export function AppsSubmittedYtdStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-apps-submitted-ytd').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.submitted_ytd === 0) return null;
  const year = new Date(data.year_start).getFullYear();

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Send className="w-3 h-3 text-sky-600" />
        Year {year}
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.submitted_ytd}</span> application
        {data.submitted_ytd === 1 ? '' : 's'} submitted
      </span>
    </div>
  );
}
