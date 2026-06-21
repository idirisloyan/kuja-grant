'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  name: string | null;
  duration_ms: number | null;
  ran_at?: string | null;
}

export function SlowestCronCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/slowest-cron').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || !data.name || data.duration_ms == null) return null;
  const slow = data.duration_ms >= 30_000;
  const seconds = (data.duration_ms / 1000).toFixed(1);

  return (
    <Card className={slow ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Activity className={`w-4 h-4 ${slow ? 'text-amber-600' : 'text-emerald-700'}`} />
          Slowest cron (24h)
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="font-medium truncate">{data.name}</div>
        <div className="text-2xl font-semibold tabular-nums">{seconds}s</div>
        <p className="text-xs text-muted-foreground">
          Longest cron run in the last 24 hours.
        </p>
      </CardContent>
    </Card>
  );
}
