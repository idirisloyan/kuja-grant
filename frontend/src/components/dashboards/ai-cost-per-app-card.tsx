'use client';

import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_days: number;
  total_ai_cost_usd: number;
  applications_submitted: number;
  avg_cost_per_app_usd: number | null;
}

export function AiCostPerAppCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ai-cost-per-app').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || !data.applications_submitted || data.avg_cost_per_app_usd == null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Receipt className="w-4 h-4 text-emerald-700" />
          AI cost per app
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">
          ${data.avg_cost_per_app_usd.toFixed(4)}
        </div>
        <p className="text-xs text-muted-foreground">
          ${data.total_ai_cost_usd.toFixed(2)} across {data.applications_submitted} submitted apps (last {data.window_days} days).
        </p>
      </CardContent>
    </Card>
  );
}
