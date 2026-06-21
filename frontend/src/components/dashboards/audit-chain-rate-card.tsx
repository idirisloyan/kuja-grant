'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  recent_per_day: number;
  prior_per_day: number | null;
  recent_total: number;
  prior_total: number;
}

export function AuditChainRateCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/audit-chain-rate').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.recent_total === 0) return null;
  const dropped = data.prior_per_day != null && data.prior_per_day > 0 &&
    data.recent_per_day < data.prior_per_day * 0.7;

  return (
    <Card className={dropped ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <ShieldCheck className={`w-4 h-4 ${dropped ? 'text-amber-600' : 'text-emerald-700'}`} />
          Audit chain rate
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.recent_per_day}/d</div>
        <p className="text-xs text-muted-foreground">
          {data.recent_total} entries over the last 7 days
          {data.prior_per_day != null && (
            <> · prior 7 days {data.prior_per_day}/d ({data.prior_total} total)</>
          )}
          {dropped && <span className="text-amber-700"> — sharp drop, check audit hooks.</span>}
        </p>
      </CardContent>
    </Card>
  );
}
