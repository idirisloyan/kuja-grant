'use client';

import { useEffect, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  points: Array<{ date: string; breached: number }>;
  sla_days: number;
}

export function SlaBreachTrendCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-sla-breach-trend').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data) return null;
  const total = data.points.reduce((s, p) => s + p.breached, 0);
  if (total === 0) return null;
  const max = Math.max(1, ...data.points.map((p) => p.breached));

  return (
    <Card className={total >= 7 ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <TrendingDown className={`w-4 h-4 ${total >= 7 ? 'text-amber-600' : 'text-sky-600'}`} />
          Review SLA breaches (14d)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{total}</div>
        <div className="mt-2 flex items-end gap-0.5 h-10">
          {data.points.map((p) => (
            <div
              key={p.date}
              className="flex-1 bg-amber-200"
              style={{ height: `${(p.breached / max) * 100}%`, minHeight: p.breached > 0 ? 2 : 0 }}
              title={`${p.date}: ${p.breached}`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Reviews completed past the {data.sla_days}-day SLA, by day.
        </p>
      </CardContent>
    </Card>
  );
}
