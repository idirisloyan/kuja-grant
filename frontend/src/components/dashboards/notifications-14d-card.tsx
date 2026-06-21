'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  buckets: number[];
  total: number;
}

export function Notifications14dCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-notifications-14d').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;
  const max = Math.max(1, ...data.buckets);
  const avg = Math.round(data.total / 14);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-600" />
          Notifications (14d)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm font-medium">{data.total.toLocaleString()} total · ~{avg}/day</div>
        <div className="mt-2 flex items-end gap-0.5 h-10">
          {data.buckets.map((count, i) => (
            <div
              key={i}
              className="flex-1 bg-sky-500"
              style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
              title={`Day -${13 - i}: ${count}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>14d ago</span>
          <span>today</span>
        </div>
      </CardContent>
    </Card>
  );
}
