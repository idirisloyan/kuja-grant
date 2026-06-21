'use client';

import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  this_week: number;
  last_week: number;
  delta: number;
}

export function NewSignupsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/new-signups-weekly').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.this_week === 0) return null;
  const tone = data.delta > 0 ? 'text-emerald-700' : data.delta < 0 ? 'text-rose-700' : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-sky-600" />
          New signups
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{data.this_week}</span>
          <span className={`text-xs tabular-nums ${tone}`}>
            {data.delta > 0 ? '+' : ''}{data.delta} vs last week
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          New user accounts created this week ({data.last_week} last week).
        </p>
      </CardContent>
    </Card>
  );
}
