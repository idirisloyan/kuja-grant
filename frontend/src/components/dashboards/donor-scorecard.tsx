'use client';

/**
 * Phase 274 — Donor scorecard tile.
 *
 * Reads /api/dashboard/donor-scorecard and renders two short lists:
 * top 5 strongest and top 5 weakest criteria across all of the
 * donor's applications in the last 90 days.
 */

import { useEffect, useState } from 'react';
import { Award, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Row { key: string; label: string; mean: number; n: number }
interface Resp { strong: Row[]; weak: Row[]; window_days: number }

export function DonorScorecardCard() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-scorecard').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || (data.strong.length === 0 && data.weak.length === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Award className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Scorecard (last {data.window_days} days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.strong.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1.5">
              Strongest criteria
            </div>
            {data.strong.map((r) => (
              <div key={`s_${r.key}`} className="flex items-center justify-between text-sm">
                <span className="truncate mr-2">{r.label}</span>
                <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                  {r.mean} · n={r.n}
                </span>
              </div>
            ))}
          </div>
        )}
        {data.weak.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700 mb-1.5 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Weakest criteria
            </div>
            {data.weak.map((r) => (
              <div key={`w_${r.key}`} className="flex items-center justify-between text-sm">
                <span className="truncate mr-2">{r.label}</span>
                <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                  {r.mean} · n={r.n}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
