'use client';

/**
 * Phase 225 — NGO peer-relative score tile.
 *
 * Shown on the NGO's application detail page after submission. Pulls
 * `/api/applications/<id>/peer-score` (compares vs median ai_score of
 * accepted peers on similar grants). Hidden when pool < 5 or no AI
 * score yet.
 */

import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  your_score?: number;
  peer_median_accepted?: number;
  delta?: number;
  pool_size?: number;
  reason?: string;
}

export function PeerScoreCard({ applicationId }: { applicationId: number }) {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/applications/${applicationId}/peer-score`).then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, [applicationId]);

  if (!data || data.your_score == null || data.peer_median_accepted == null) return null;

  const positive = (data.delta ?? 0) >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Scale className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          How you compare
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span>Your AI score</span>
          <span className="tabular-nums font-semibold">{Math.round(data.your_score)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Median, accepted peers</span>
          <span className="tabular-nums text-muted-foreground">{data.peer_median_accepted}</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-border">
          <span>Delta</span>
          <span className={`tabular-nums font-semibold ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {positive ? '+' : ''}{data.delta}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground pt-2">
          Based on {data.pool_size} accepted peer application{data.pool_size === 1 ? '' : 's'} on grants with overlapping sectors. Anonymised.
        </p>
      </CardContent>
    </Card>
  );
}
