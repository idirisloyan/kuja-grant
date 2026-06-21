'use client';

import { useEffect, useState } from 'react';
import { Gavel } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  resolved_30d: number;
  open: number;
}

export function ObThroughputCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-ob-throughput-30d').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || (data.resolved_30d === 0 && data.open === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Gavel className="w-4 h-4 text-sky-600" />
          OB throughput (30 days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{data.resolved_30d}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Declarations resolved · <span className="font-medium">{data.open}</span> still open.
        </p>
      </CardContent>
    </Card>
  );
}
