'use client';

import { useEffect, useState } from 'react';
import { UserMinus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  unassigned: number;
  total_open: number;
}

export function UnassignedReviewsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-unassigned-reviews').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.unassigned === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <UserMinus className="w-4 h-4 text-amber-600" />
          Awaiting reviewer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">
          {data.unassigned}
          <span className="text-base text-muted-foreground font-normal"> / {data.total_open}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Open applications without a reviewer assigned.
        </p>
      </CardContent>
    </Card>
  );
}
