'use client';

import { useEffect, useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  failed: number;
  total: number;
}

export function FailedCronsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-failed-cron-runs-7d').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;
  const pct = data.total > 0 ? Math.round((data.failed / data.total) * 100) : 0;
  const bad = data.failed > 0;

  return (
    <Card className={bad ? 'border-rose-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <AlertOctagon className={`w-4 h-4 ${bad ? 'text-rose-600' : 'text-emerald-600'}`} />
          Failed cron runs (7d)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${bad ? 'text-rose-700' : ''}`}>
          {data.failed}
          <span className="text-base text-muted-foreground font-normal"> / {data.total}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {pct}% failure rate across all cron runs in the window.
        </p>
      </CardContent>
    </Card>
  );
}
