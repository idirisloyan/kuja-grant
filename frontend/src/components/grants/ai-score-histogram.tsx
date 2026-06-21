'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  bins: number[];
  sample: number;
}

export function AiScoreHistogram({ grantId }: { grantId: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>(`/api/dashboard/grant-ai-score-histogram/${grantId}`).then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, [grantId]);

  if (loading || !data || data.sample < 3) return null;
  const max = Math.max(1, ...data.bins);
  const labels = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-sky-600" />
          AI score distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-0.5 h-16">
          {data.bins.map((count, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full ${i >= 7 ? 'bg-emerald-500' : i >= 5 ? 'bg-sky-500' : 'bg-amber-400'}`}
                style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
                title={`${labels[i]}: ${count}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Across {data.sample} applications.
        </p>
      </CardContent>
    </Card>
  );
}
