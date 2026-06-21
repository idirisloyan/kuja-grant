'use client';

/**
 * Phase 338 — Donor "first-time vs repeat" NGO tile.
 *
 * Shows the share of recent applicant NGOs who have previously been
 * funded by this donor vs first-time applicants. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import { Users2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  total: number;
  repeat: number;
  first_time: number;
  window_days: number;
}

export function FirstTimeVsRepeatCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/first-time-vs-repeat').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;
  const repeatPct = Math.round(100 * data.repeat / data.total);
  const firstPct = 100 - repeatPct;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Users2 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Applicant mix
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          {data.total} unique NGOs in the last {data.window_days} days.
        </p>
        <div className="flex h-3 rounded-full overflow-hidden border border-border">
          {data.repeat > 0 && (
            <div className="bg-emerald-500" style={{ width: `${repeatPct}%` }} title={`repeat: ${data.repeat}`} />
          )}
          {data.first_time > 0 && (
            <div className="bg-sky-500" style={{ width: `${firstPct}%` }} title={`first-time: ${data.first_time}`} />
          )}
        </div>
        <div className="flex justify-between text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-emerald-500" /> repeat ({data.repeat})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-sky-500" /> first-time ({data.first_time})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
