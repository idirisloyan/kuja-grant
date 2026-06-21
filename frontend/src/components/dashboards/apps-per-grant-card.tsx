'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  mean_apps_per_grant: number | null;
  grants: number;
  apps: number;
}

export function AppsPerGrantCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-apps-per-grant').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.mean_apps_per_grant == null) return null;
  const low = data.mean_apps_per_grant < 3;

  return (
    <Card className={low ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Users className={`w-4 h-4 ${low ? 'text-amber-600' : 'text-sky-600'}`} />
          Apps per grant
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.mean_apps_per_grant}</div>
        <p className="text-xs text-muted-foreground">
          Mean across {data.grants} grants published in the last 90 days ({data.apps} apps).
        </p>
      </CardContent>
    </Card>
  );
}
