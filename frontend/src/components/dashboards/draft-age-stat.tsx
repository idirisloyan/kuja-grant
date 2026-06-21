'use client';

import { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  oldest_days: number | null;
  open_drafts: number;
}

export function DraftAgeStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-oldest-draft-age').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || !data.open_drafts || data.oldest_days == null) return null;
  const tone = data.oldest_days >= 14 ? 'text-rose-700' : data.oldest_days >= 7 ? 'text-amber-700' : 'text-muted-foreground';

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Hourglass className="w-3 h-3 text-sky-600" />
        Open drafts
      </span>
      <span className="tabular-nums">
        Oldest <span className={`font-semibold ${tone}`}>{data.oldest_days}d</span>
        <span className="text-muted-foreground"> · {data.open_drafts} draft{data.open_drafts === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}
