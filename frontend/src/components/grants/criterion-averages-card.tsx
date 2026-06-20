'use client';

/**
 * Phase 224 — Donor per-criterion AI score average tile.
 *
 * Reads /api/grants/<id>/criterion-averages and renders a simple
 * sorted list (lowest mean first). Surfaces which rubric items the
 * application pool is collectively weak on.
 */

import { useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Row {
  key: string;
  label: string;
  mean: number;
  n: number;
}

interface Resp {
  rows: Row[];
}

export function CriterionAveragesCard({ grantId }: { grantId: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/grants/${grantId}/criterion-averages`).then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [grantId]);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2" /> Loading averages…
      </div>
    );
  }
  if (!data || data.rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          AI score by criterion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {data.rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between text-sm">
            <span className="truncate mr-2">{r.label}</span>
            <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
              {r.mean} · n={r.n}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
