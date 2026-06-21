'use client';

import { useEffect, useState } from 'react';
import { PieChart } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  concentration_pct: number | null;
  unique_grantees: number;
  top_third_size?: number;
  top_third_fundings?: number;
  total_fundings?: number;
  reason?: string;
}

export function DecisionConcentrationCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-decision-concentration').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.concentration_pct == null) return null;
  const high = data.concentration_pct >= 70;

  return (
    <Card className={high ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <PieChart className={`w-4 h-4 ${high ? 'text-amber-600' : 'text-sky-600'}`} />
          Portfolio concentration
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">
          {data.concentration_pct}%
        </div>
        <p className="text-xs text-muted-foreground">
          Of {data.total_fundings} funded decisions go to the top {data.top_third_size} of {data.unique_grantees} grantees.
          {high ? ' Heavy concentration — consider diversifying.' : ''}
        </p>
      </CardContent>
    </Card>
  );
}
