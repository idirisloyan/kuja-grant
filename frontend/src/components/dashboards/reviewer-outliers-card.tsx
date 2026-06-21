'use client';

/**
 * Phase 298 — Admin reviewer scoring outlier alert.
 *
 * Surfaces reviewers whose mean human score is > 1.5σ from the platform
 * mean (over 5+ completed reviews). Calibration drift signal — self-
 * gates when no outliers.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Outlier {
  reviewer_user_id: number;
  reviewer_name?: string | null;
  reviewer_email?: string | null;
  mean_score: number;
  n: number;
  delta_vs_platform: number;
}

interface Resp {
  platform_mean: number;
  platform_stdev: number;
  outliers: Outlier[];
  sample_size: number;
}

export function ReviewerOutliersCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/reviews/scoring-outliers').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.outliers.length === 0) return null;

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-700" />
          Reviewer calibration drift
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          Platform mean is {data.platform_mean}% across {data.sample_size} completed reviews.
          These reviewers are &gt; 1.5σ from that:
        </p>
        <ul className="space-y-1 text-xs">
          {data.outliers.map((o) => (
            <li key={o.reviewer_user_id} className="border-l-2 border-amber-300 pl-2">
              <span className="font-medium">{o.reviewer_name || o.reviewer_email || `Reviewer ${o.reviewer_user_id}`}</span>
              <span className="text-muted-foreground">
                {' · '}
                mean {o.mean_score}% (n={o.n})
              </span>
              {' '}
              <span className={o.delta_vs_platform > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {o.delta_vs_platform > 0 ? (
                  <TrendingUp className="w-3 h-3 inline" />
                ) : (
                  <TrendingDown className="w-3 h-3 inline" />
                )}
                {' '}
                {o.delta_vs_platform > 0 ? '+' : ''}{o.delta_vs_platform}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/admin/reviewers-workload" className="block text-xs text-[hsl(var(--kuja-clay))] hover:underline">
          Open reviewer workload →
        </Link>
      </CardContent>
    </Card>
  );
}
