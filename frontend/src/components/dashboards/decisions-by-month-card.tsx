'use client';

/**
 * Phase 332 — Donor "decisions by month" mini bar chart.
 *
 * 6-month stacked bars (funded + declined). Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Bucket {
  month: string;
  funded: number;
  declined: number;
  total: number;
}

interface Resp {
  months: Bucket[];
}

export function DecisionsByMonthCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/decisions-by-month').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.months.length === 0) return null;
  const max = Math.max(...data.months.map((m) => m.total), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Decisions by month
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <div className="flex items-end gap-2 h-20 pt-1">
          {data.months.map((m) => {
            const fH = (m.funded / max) * 100;
            const dH = (m.declined / max) * 100;
            return (
              <div key={m.month} className="flex-1 flex flex-col items-stretch gap-0.5">
                <div className="flex-1 flex flex-col justify-end">
                  {m.declined > 0 && (
                    <div className="bg-rose-500" style={{ height: `${dH}%`, minHeight: m.declined > 0 ? 2 : 0 }} />
                  )}
                  {m.funded > 0 && (
                    <div className="bg-emerald-500" style={{ height: `${fH}%`, minHeight: m.funded > 0 ? 2 : 0 }} />
                  )}
                </div>
                <p className="text-[9px] text-center text-muted-foreground">{m.month.slice(5)}</p>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-3 text-[10px] text-muted-foreground pt-1">
          <span><span className="inline-block w-2 h-2 bg-emerald-500 mr-1" /> funded</span>
          <span><span className="inline-block w-2 h-2 bg-rose-500 mr-1" /> declined</span>
        </div>
      </CardContent>
    </Card>
  );
}
