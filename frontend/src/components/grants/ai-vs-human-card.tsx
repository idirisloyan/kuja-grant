'use client';

/**
 * Phase 247 — Donor AI vs human calibration tile.
 *
 * Renders the mean (human - ai) score delta across applications on
 * a single grant. Positive = humans rate higher, negative = AI
 * rates higher. Hidden when pool < 1.
 */

import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  pool_size: number;
  mean_delta: number | null;
  mean_abs_delta?: number;
}

export function AiVsHumanCard({ grantId }: { grantId: number }) {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/grants/${grantId}/ai-vs-human`).then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, [grantId]);

  if (!data || data.pool_size === 0 || data.mean_delta == null) return null;

  const positive = data.mean_delta >= 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Scale className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          AI vs human calibration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Mean delta (human − AI)</span>
          <span className={`tabular-nums font-semibold ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {positive ? '+' : ''}{data.mean_delta}
          </span>
        </div>
        {data.mean_abs_delta != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mean absolute delta</span>
            <span className="tabular-nums text-muted-foreground">{data.mean_abs_delta}</span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground pt-2">
          Pool: {data.pool_size} application{data.pool_size === 1 ? '' : 's'} with both scores.
          {positive
            ? ' AI tends to under-rate vs humans on this grant.'
            : ' AI tends to over-rate vs humans on this grant.'}
        </p>
      </CardContent>
    </Card>
  );
}
