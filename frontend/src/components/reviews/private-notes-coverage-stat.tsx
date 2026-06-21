'use client';

import { useEffect, useState } from 'react';
import { ClipboardEdit } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  coverage_pct: number | null;
  with_notes?: number;
  sample: number;
}

export function PrivateNotesCoverageStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-private-notes-coverage').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.coverage_pct == null || data.sample < 5) return null;
  const pct = data.coverage_pct;
  const tone = pct >= 50 ? 'text-emerald-700' : pct >= 25 ? 'text-amber-700' : 'text-muted-foreground';

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <ClipboardEdit className="w-3 h-3 text-sky-600" />
        Last 90 days
      </span>
      <span className="tabular-nums">
        <span className={`font-semibold ${tone}`}>{pct}%</span> included private notes
        <span className="text-muted-foreground"> ({data.with_notes ?? 0} of {data.sample})</span>
      </span>
    </div>
  );
}
