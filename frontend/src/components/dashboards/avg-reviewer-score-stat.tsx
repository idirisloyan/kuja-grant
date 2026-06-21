'use client';

import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  mean_score: number | null;
  sample: number;
}

export function AvgReviewerScoreStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-avg-reviewer-score').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.mean_score == null || data.sample < 5) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Award className="w-3 h-3 text-sky-600" />
        Last 90 days
      </span>
      <span className="tabular-nums">
        Mean reviewer score <span className="font-semibold">{data.mean_score}</span>
        <span className="text-muted-foreground"> ({data.sample} reviews)</span>
      </span>
    </div>
  );
}
