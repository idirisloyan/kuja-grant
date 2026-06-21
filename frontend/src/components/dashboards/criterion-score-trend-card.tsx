'use client';

import { useEffect, useState } from 'react';
import { LineChart } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  criteria: Array<{ criterion_id: string; avg_score: number; samples: number }>;
  sample_apps: number;
}

export function CriterionScoreTrendCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-criterion-score-trend').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.criteria.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <LineChart className="w-4 h-4 text-sky-600" />
          AI scores by criterion
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1.5">
          {data.criteria.slice(0, 5).map((c) => (
            <li key={c.criterion_id} className="flex items-center gap-2">
              <span className="w-32 truncate text-xs text-muted-foreground">
                {c.criterion_id}
              </span>
              <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                <div
                  className={`h-full ${c.avg_score >= 70 ? 'bg-emerald-500' : c.avg_score >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, c.avg_score)}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums text-xs font-medium">
                {c.avg_score}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Averaged across your last {data.sample_apps} submitted application{data.sample_apps === 1 ? '' : 's'}.
        </p>
      </CardContent>
    </Card>
  );
}
