'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  active_orgs: number;
  total_orgs: number;
}

export function ActiveOrgsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/active-orgs-7d').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data) return null;
  const pct = data.total_orgs > 0 ? Math.round((data.active_orgs / data.total_orgs) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" />
          Active organisations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">
          {data.active_orgs}
          <span className="text-base text-muted-foreground font-normal"> / {data.total_orgs}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {pct}% of tenants touched the platform in the last 7 days.
        </p>
      </CardContent>
    </Card>
  );
}
