'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  counts: Record<string, number>;
  total: number;
}

const STATUS_ORDER = ['open', 'review', 'closed', 'awarded', 'draft'] as const;
const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  review: 'In review',
  closed: 'Closed',
  awarded: 'Awarded',
  draft: 'Draft',
};

export function GrantsByStatusCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-grants-by-status').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-sky-600" />
          Grants by status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1">
          {STATUS_ORDER.filter((s) => (data.counts[s] || 0) > 0).map((s) => (
            <li key={s} className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
              <span className="tabular-nums font-medium">{data.counts[s]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.total} grant{data.total === 1 ? '' : 's'} total.
        </p>
      </CardContent>
    </Card>
  );
}
