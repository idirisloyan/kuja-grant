'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  reviewer: {
    user_id: number;
    name: string | null;
    median_days: number;
    reviews_completed: number;
  } | null;
  reason?: string;
}

export function FastestReviewerCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-fastest-reviewer').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || !data.reviewer) return null;
  const r = data.reviewer;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          Fastest reviewer this month
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-lg font-medium">{r.name || `User #${r.user_id}`}</div>
        <p className="text-xs text-muted-foreground">
          Median {r.median_days}d turnaround across {r.reviews_completed} completed reviews (last 30 days).
        </p>
      </CardContent>
    </Card>
  );
}
