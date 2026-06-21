'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  grants_count: number;
  total_funded: number;
  currency: string | null;
}

export function GrantsFundedYtdCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-grants-funded-ytd').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.grants_count === 0) return null;
  const cur = data.currency || 'USD';
  const total = data.total_funded.toLocaleString();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          Grants funded year-to-date
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{data.grants_count}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {cur} {total} total funding budget.
        </p>
      </CardContent>
    </Card>
  );
}
