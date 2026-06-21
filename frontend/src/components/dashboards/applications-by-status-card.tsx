'use client';

/**
 * Phase 337 — Admin "applications by status" tile.
 *
 * Stacked horizontal bar of current applications across all statuses,
 * with counts. Self-gates when total is zero.
 */

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  by_status: Record<string, number>;
  total: number;
}

const ORDER = ['draft', 'submitted', 'under_review', 'scored', 'awarded', 'declined', 'rejected', 'withdrawn'];
const COLORS: Record<string, string> = {
  draft: 'bg-muted',
  submitted: 'bg-sky-500',
  under_review: 'bg-amber-500',
  scored: 'bg-violet-500',
  awarded: 'bg-emerald-500',
  declined: 'bg-rose-500',
  rejected: 'bg-rose-700',
  withdrawn: 'bg-slate-400',
};

export function ApplicationsByStatusCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/applications-by-status').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  const present = ORDER.filter((k) => (data.by_status[k] ?? 0) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Layers className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Applications by status
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div className="flex h-3 rounded-full overflow-hidden border border-border">
          {present.map((k) => {
            const n = data.by_status[k];
            const pct = (n / data.total) * 100;
            return (
              <div
                key={k}
                className={COLORS[k] || 'bg-muted'}
                style={{ width: `${pct}%` }}
                title={`${k}: ${n}`}
              />
            );
          })}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-1">
          {present.map((k) => (
            <li key={k} className="flex items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 ${COLORS[k] || 'bg-muted'}`} />
                {k.replace('_', ' ')}
              </span>
              <span className="tabular-nums text-muted-foreground">{data.by_status[k]}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
