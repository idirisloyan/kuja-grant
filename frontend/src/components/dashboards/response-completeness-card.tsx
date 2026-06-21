'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  completeness_pct: number | null;
  with_responses?: number;
  total: number;
  window_days?: number;
  reason?: string;
}

export function ResponseCompletenessCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-response-completeness').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.completeness_pct == null) return null;
  const low = data.completeness_pct < 80;

  return (
    <Card className={low ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <ClipboardCheck className={`w-4 h-4 ${low ? 'text-amber-600' : 'text-emerald-700'}`} />
          Response completeness
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.completeness_pct}%</div>
        <p className="text-xs text-muted-foreground">
          {data.with_responses} of {data.total} submitted apps have completed response fields (last {data.window_days || 90}d).
        </p>
      </CardContent>
    </Card>
  );
}
