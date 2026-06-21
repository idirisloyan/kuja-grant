'use client';

import { useEffect, useState } from 'react';
import { BellOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  stale_unread: number;
  older_than_days: number;
}

export function StaleNotificationsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/stale-notifications').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.stale_unread === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <BellOff className="w-4 h-4 text-amber-600" />
          Stale notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.stale_unread}</div>
        <p className="text-xs text-muted-foreground">
          Unread notifications older than {data.older_than_days} days. Inbox triage needed.
        </p>
      </CardContent>
    </Card>
  );
}
