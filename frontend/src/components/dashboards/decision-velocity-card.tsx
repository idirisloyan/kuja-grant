'use client';

/**
 * Phase 284 — Donor decision velocity card.
 *
 * Median days from app submission to decision over trailing 90 days,
 * split funded vs declined so the donor can see whether either path
 * drags. Backend: GET /api/dashboard/decision-velocity.
 */

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_days: number;
  total_decided: number;
  median_days: number | null;
  funded: { n: number; median_days: number | null };
  declined: { n: number; median_days: number | null };
}

function fmt(d: number | null): string {
  if (d == null) return '—';
  if (d < 1) return '<1d';
  return `${d}d`;
}

export function DecisionVelocityCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/decision-velocity').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total_decided === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Decision velocity
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{fmt(data.median_days)}</span>
          <span className="text-xs text-muted-foreground">
            median, {data.total_decided} decision{data.total_decided === 1 ? '' : 's'} in last {data.window_days} days
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs pt-1">
          <div className="rounded-md border border-border p-2">
            <p className="text-emerald-700 font-medium">Funded</p>
            <p>{fmt(data.funded.median_days)} median · {data.funded.n}</p>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="text-rose-700 font-medium">Declined</p>
            <p>{fmt(data.declined.median_days)} median · {data.declined.n}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
