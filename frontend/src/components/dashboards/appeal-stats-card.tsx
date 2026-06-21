'use client';

/**
 * Phase 316 — Admin appeal resolution stats tile.
 *
 * 30-day rollup of approved / declined / pending appeals + median days
 * to resolve. Self-gates when total is zero.
 */

import { useEffect, useState } from 'react';
import { Scale, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_days: number;
  total: number;
  approved: number;
  declined: number;
  pending: number;
  median_days_to_resolve: number | null;
}

export function AppealStatsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/appeal-stats').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Scale className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Appeals (30d)
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          <div className="rounded-md border border-border p-2">
            <CheckCircle className="w-3 h-3 inline text-emerald-700" />
            <p className="font-semibold tabular-nums pt-0.5">{data.approved}</p>
            <p className="text-muted-foreground">approved</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <XCircle className="w-3 h-3 inline text-rose-700" />
            <p className="font-semibold tabular-nums pt-0.5">{data.declined}</p>
            <p className="text-muted-foreground">declined</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <Clock className="w-3 h-3 inline text-amber-700" />
            <p className="font-semibold tabular-nums pt-0.5">{data.pending}</p>
            <p className="text-muted-foreground">pending</p>
          </div>
        </div>
        {data.median_days_to_resolve != null && (
          <p className="text-xs text-muted-foreground pt-1">
            Median <span className="text-foreground font-semibold">{data.median_days_to_resolve}d</span> to resolve.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
