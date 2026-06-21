'use client';

import { useEffect, useState } from 'react';
import { MessageSquareHeart } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  total: number;
  buckets: { promoter: number; passive: number; detractor: number };
}

export function FeedbackThisWeekCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-feedback-this-week').then((r) => {
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
          <MessageSquareHeart className="w-4 h-4 text-rose-600" />
          Feedback this week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{data.total}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div className="text-emerald-700">
            <span className="font-semibold tabular-nums">{data.buckets.promoter}</span> promoter
          </div>
          <div className="text-muted-foreground">
            <span className="font-semibold tabular-nums">{data.buckets.passive}</span> passive
          </div>
          <div className="text-rose-700">
            <span className="font-semibold tabular-nums">{data.buckets.detractor}</span> detractor
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
