'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_days: number;
  total: number;
  replayable: number;
  coverage_pct: number | null;
}

export function AiReplayCoverageCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ai-replay-coverage').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || !data.total || data.coverage_pct == null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <History className="w-4 h-4 text-sky-600" />
          AI replay coverage
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.coverage_pct}%</div>
        <p className="text-xs text-muted-foreground">
          {data.replayable} of {data.total} AI calls auditable (last {data.window_days}d).
        </p>
      </CardContent>
    </Card>
  );
}
