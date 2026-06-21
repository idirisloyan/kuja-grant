'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  starred_pending: number;
}

export function StarredQueueCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-starred-queue').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.starred_pending === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" />
          Starred queue
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.starred_pending}</div>
        <p className="text-xs text-muted-foreground">
          Starred applications awaiting your decision.{' '}
          <Link href="/applications?shortlist=1" className="text-sky-700 hover:underline">
            Open shortlist
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
