'use client';

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  streak_days: number;
  days_with_reviews: number;
}

export function ReviewStreakTile() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/reviewer-review-streak').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.streak_days < 2) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-xs flex items-center justify-between">
      <span className="text-amber-900 dark:text-amber-200 inline-flex items-center gap-1">
        <Flame className="w-3 h-3 text-amber-600" />
        Review streak
      </span>
      <span className="tabular-nums">
        <span className="font-semibold text-amber-900 dark:text-amber-200">{data.streak_days}</span> day
        {data.streak_days === 1 ? '' : 's'} in a row
      </span>
    </div>
  );
}
