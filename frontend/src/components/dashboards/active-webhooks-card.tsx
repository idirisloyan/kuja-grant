'use client';

import { useEffect, useState } from 'react';
import { Webhook } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  active: number;
  total: number;
}

export function ActiveWebhooksCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-active-webhooks').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;
  const inactive = data.total - data.active;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Webhook className="w-4 h-4 text-sky-600" />
          Active webhooks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">
          {data.active}
          <span className="text-base text-muted-foreground font-normal"> / {data.total}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {inactive > 0 ? `${inactive} inactive` : 'All webhooks enabled'}.
        </p>
      </CardContent>
    </Card>
  );
}
