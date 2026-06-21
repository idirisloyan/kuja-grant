'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  points: Array<{ month: string; count: number }>;
}

export function AppsByMonthCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-apps-by-month').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data) return null;
  const total = data.points.reduce((s, p) => s + p.count, 0);
  if (total === 0) return null;
  const max = Math.max(1, ...data.points.map((p) => p.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Calendar className="w-4 h-4 text-sky-600" />
          Applications by month
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{total}</div>
        <div className="mt-2 flex items-end gap-0.5 h-10">
          {data.points.map((p) => (
            <div
              key={p.month}
              className="flex-1 bg-sky-300"
              style={{ height: `${(p.count / max) * 100}%`, minHeight: p.count > 0 ? 2 : 0 }}
              title={`${p.month}: ${p.count}`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Across the last 12 months.
        </p>
      </CardContent>
    </Card>
  );
}
