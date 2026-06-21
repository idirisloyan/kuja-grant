'use client';

/**
 * Phase 293 — Donor outreach rollup tile.
 *
 * For declines in the trailing 30 days, counts how many have had donor
 * outreach started vs how many are still pending. Surfaces a calm
 * progress signal alongside the Phase 287 nudge — shows work done,
 * not just shame.
 */

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_days: number;
  total: number;
  outreach_started: number;
  outreach_pending: number;
}

export function DonorOutreachRollupCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-outreach-rollup').then((r) => {
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
          <Send className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Follow-up on declines
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          Across {data.total} decline{data.total === 1 ? '' : 's'} in the last {data.window_days} days:
        </p>
        <div className="flex gap-3 text-xs pt-1">
          <span className="text-emerald-700">
            {data.outreach_started} contacted
          </span>
          {data.outreach_pending > 0 && (
            <span className="text-amber-700">
              {data.outreach_pending} still pending
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
