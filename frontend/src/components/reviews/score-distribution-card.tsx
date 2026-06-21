'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  window_days: number;
  buckets: number[];
  total: number;
}

const LABELS = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80–89', '90+'];

export function ScoreDistributionCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-score-distribution').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || !data || data.total < 5) return null;
  const max = Math.max(1, ...data.buckets);

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-sky-600" />
        <span className="font-medium">Score distribution</span>
        <span className="text-muted-foreground">
          · {data.total} reviews in last {data.window_days}d
        </span>
      </div>
      <div className="flex items-end gap-0.5 h-12">
        {data.buckets.map((count, i) => (
          <div key={LABELS[i]} className="flex-1 flex flex-col items-center justify-end">
            <div
              className="w-full bg-sky-500"
              style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
              title={`${LABELS[i]}: ${count}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}
