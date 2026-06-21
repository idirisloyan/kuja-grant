'use client';

/**
 * Phase 347 — Admin 14-day usage trend tile.
 *
 * Three tiny SVG sparklines: applications created, AI calls, decisions
 * recorded. Self-gates when total volume across all three is zero.
 */

import { useEffect, useState } from 'react';
import { LineChart } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Day {
  date: string;
  applications: number;
  ai_calls: number;
  decisions: number;
}

interface Resp {
  series: Day[];
}

function spark(values: number[], color: string) {
  const max = Math.max(...values, 1);
  const w = 100; const h = 20; const pad = 1;
  const step = (w - 2 * pad) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={color}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UsageTrendCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/usage-trend').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data) return null;
  const apps = data.series.map((d) => d.applications);
  const ai = data.series.map((d) => d.ai_calls);
  const dec = data.series.map((d) => d.decisions);
  const total = [...apps, ...ai, ...dec].reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <LineChart className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          14-day usage
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs">Applications</span>
          {spark(apps, 'text-sky-600')}
          <span className="text-xs tabular-nums text-muted-foreground">{sum(apps)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs">AI calls</span>
          {spark(ai, 'text-violet-600')}
          <span className="text-xs tabular-nums text-muted-foreground">{sum(ai)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs">Decisions</span>
          {spark(dec, 'text-emerald-600')}
          <span className="text-xs tabular-nums text-muted-foreground">{sum(dec)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
