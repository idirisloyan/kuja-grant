'use client';

/**
 * Phase 291 — NGO mirror of donor decision velocity.
 *
 * Shows median days submission → decision for this NGO's apps over the
 * last 90 days + a count of currently pending decisions. Self-gates
 * when no decisions yet.
 */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_days: number;
  decided_count: number;
  median_days: number | null;
  pending_count: number;
}

function fmt(d: number | null): string {
  if (d == null) return '—';
  if (d < 1) return '<1d';
  return `${d}d`;
}

export function NgoDecisionVelocityCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-decision-velocity').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.decided_count === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Clock className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Decision wait time
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{fmt(data.median_days)}</span>
          <span className="text-xs text-muted-foreground">
            median across your last {data.decided_count} decision{data.decided_count === 1 ? '' : 's'}
          </span>
        </div>
        {data.pending_count > 0 && (
          <p className="text-xs text-muted-foreground">
            {data.pending_count} application{data.pending_count === 1 ? '' : 's'} currently awaiting a decision.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
