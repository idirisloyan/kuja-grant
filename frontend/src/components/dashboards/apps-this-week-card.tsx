'use client';

import { useEffect, useState } from 'react';
import { Inbox, TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  this_week: number;
  prior_week: number;
  delta: number;
}

export function AppsThisWeekCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-apps-this-week').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || (data.this_week === 0 && data.prior_week === 0)) return null;
  const Icon = data.delta >= 0 ? TrendingUp : TrendingDown;
  const tone = data.delta > 0 ? 'text-emerald-600' : data.delta < 0 ? 'text-rose-600' : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Inbox className="w-4 h-4 text-sky-600" />
          Applications this week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{data.this_week}</div>
        <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
          <Icon className={`w-3 h-3 ${tone}`} />
          <span className={tone}>{data.delta >= 0 ? '+' : ''}{data.delta}</span>
          <span>vs prior week ({data.prior_week})</span>
        </p>
      </CardContent>
    </Card>
  );
}
