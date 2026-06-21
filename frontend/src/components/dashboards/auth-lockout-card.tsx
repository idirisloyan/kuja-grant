'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_hours: number;
  total_attempts: number;
  hot_emails: number;
}

export function AuthLockoutCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/auth-lockout-rate').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.hot_emails === 0) return null;

  return (
    <Card className="border-rose-200">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          Login lockout signals
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.hot_emails}</div>
        <p className="text-xs text-muted-foreground">
          {data.hot_emails} email{data.hot_emails === 1 ? '' : 's'} hit &gt;=5 failed login attempts in the last {data.window_hours}h
          ({data.total_attempts} attempts total).
        </p>
      </CardContent>
    </Card>
  );
}
