'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  median_days: number | null;
  sample: number;
}

export function DecisionAgingCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-decision-aging').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.median_days == null) return null;
  const slow = data.median_days >= 30;

  return (
    <Card className={slow ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Timer className={`w-4 h-4 ${slow ? 'text-amber-600' : 'text-emerald-700'}`} />
          Decision aging
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.median_days}d</div>
        <p className="text-xs text-muted-foreground">
          Median submitted-to-decision across your last {data.sample} decisions.
        </p>
      </CardContent>
    </Card>
  );
}
