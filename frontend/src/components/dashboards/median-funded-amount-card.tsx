'use client';

import { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  median: number | null;
  sample: number;
  currency: string | null;
}

function fmt(amount: number) {
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(2) + 'M';
  if (amount >= 1_000) return (amount / 1_000).toFixed(0) + 'K';
  return amount.toFixed(0);
}

export function MedianFundedAmountCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-median-funded-amount').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.median == null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-700" />
          Median funded amount
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">
          {data.currency || 'USD'} {fmt(data.median)}
        </div>
        <p className="text-xs text-muted-foreground">
          Median grant size where you funded apps in the last 90 days ({data.sample} apps).
        </p>
      </CardContent>
    </Card>
  );
}
