'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  total: number;
  failed: number;
  failure_pct: number | null;
}

export function CronFailureRateCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/cron-failure-rate').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || !data.total || data.failure_pct == null) return null;
  const high = data.failure_pct >= 10;

  return (
    <Card className={high ? 'border-rose-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${high ? 'text-rose-600' : 'text-emerald-700'}`} />
          Cron failure rate
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.failure_pct}%</div>
        <p className="text-xs text-muted-foreground">
          {data.failed} of {data.total} cron runs failed in the last 24h.
        </p>
      </CardContent>
    </Card>
  );
}
