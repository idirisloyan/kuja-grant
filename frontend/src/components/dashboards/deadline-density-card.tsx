'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  buckets: {
    next_7d: number;
    next_30d: number;
    next_90d: number;
  };
  total_watching: number;
}

export function DeadlineDensityCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-deadline-density').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total_watching === 0) return null;
  const urgent = data.buckets.next_7d > 0;

  return (
    <Card className={urgent ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <CalendarRange className={`w-4 h-4 ${urgent ? 'text-amber-600' : 'text-sky-600'}`} />
          Watchlist deadline density
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1">
          <li className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">This week</span>
            <span className="tabular-nums font-medium">{data.buckets.next_7d}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">This month</span>
            <span className="tabular-nums font-medium">{data.buckets.next_30d}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Next 90 days</span>
            <span className="tabular-nums font-medium">{data.buckets.next_90d}</span>
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.total_watching} grant{data.total_watching === 1 ? '' : 's'} on your watchlist.{' '}
          <Link href="/grants?watching=1" className="text-sky-700 hover:underline">
            Open
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
