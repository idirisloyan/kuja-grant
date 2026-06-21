'use client';

/**
 * Phase 350 — NGO application duration sparkline.
 *
 * Tiny SVG sparkline of submit→decision durations across the NGO's
 * last 6 decided applications. Self-gates when < 3 to avoid noise.
 */

import { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  application_id: number;
  days: number;
  status: string;
}

interface Resp {
  durations: Item[];
}

export function NgoApplicationDurationCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-application-duration').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.durations.length < 3) return null;
  const vals = data.durations.map((d) => d.days);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const w = 200; const h = 28; const pad = 2;
  const stepX = (w - 2 * pad) / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / Math.max(1, max - min)) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = vals[vals.length - 1];
  const first = vals[0];
  const delta = Math.round((last - first) * 10) / 10;
  const tone = delta < 0 ? 'text-emerald-700' : delta > 0 ? 'text-rose-700' : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Hourglass className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Time to decision
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Your last {vals.length} decisions</span>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-[hsl(var(--kuja-clay))]">
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {vals.map((v, i) => {
            const x = pad + i * stepX;
            const y = h - pad - ((v - min) / Math.max(1, max - min)) * (h - 2 * pad);
            return <circle key={i} cx={x} cy={y} r={1.5} fill="currentColor" />;
          })}
        </svg>
        <span className={`text-xs tabular-nums ${tone}`}>
          {delta > 0 ? '+' : ''}{delta}d
        </span>
      </CardContent>
    </Card>
  );
}
