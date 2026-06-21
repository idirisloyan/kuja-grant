'use client';

/**
 * Phase 325 — Admin notification volume audit tile.
 *
 * Top 5 users by notification count in the last 7 days. Helps spot
 * notification spam or broken filtering. Self-gates when total is zero.
 */

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Row {
  user_id: number;
  name: string | null;
  email: string | null;
  count: number;
}

interface Resp {
  noisiest: Row[];
  total: number;
  window_days: number;
}

export function NotificationVolumeCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/notification-volume').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.noisiest.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Bell className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Noisiest inboxes (7d)
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.total.toLocaleString()} notifications fired in the last {data.window_days} days.
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.noisiest.map((r) => (
            <li key={r.user_id} className="flex items-baseline justify-between gap-2">
              <span className="truncate">{r.name || r.email || `User #${r.user_id}`}</span>
              <span className="tabular-nums text-muted-foreground">{r.count}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
