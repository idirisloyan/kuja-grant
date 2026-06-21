'use client';

import { useEffect, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  applications: number;
  with_amount: number;
  totals: Array<{ currency: string; amount: number }>;
}

function fmt(amount: number) {
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1) + 'M';
  if (amount >= 1_000) return (amount / 1_000).toFixed(0) + 'K';
  return amount.toFixed(0);
}

export function NgoPipelineValueCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-pipeline-value').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.with_amount === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-sky-600" />
          Pipeline value
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex flex-wrap items-baseline gap-3">
          {data.totals.map((t) => (
            <span key={t.currency} className="text-lg font-semibold tabular-nums">
              {t.currency} {fmt(t.amount)}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Across {data.with_amount} pending application{data.with_amount === 1 ? '' : 's'}.
        </p>
      </CardContent>
    </Card>
  );
}
