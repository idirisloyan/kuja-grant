'use client';

import { useEffect, useState } from 'react';
import { Anchor } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  seconds: number | null;
  newest_at: string | null;
}

export function AuditChainAgeCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/audit-chain-newest-age').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.seconds == null) return null;
  const s = data.seconds;
  let label: string;
  if (s < 60) label = `${s}s`;
  else if (s < 3600) label = `${Math.round(s / 60)}m`;
  else if (s < 86400) label = `${Math.round(s / 3600)}h`;
  else label = `${Math.round(s / 86400)}d`;
  const stale = s > 6 * 3600;

  return (
    <Card className={stale ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Anchor className={`w-4 h-4 ${stale ? 'text-amber-600' : 'text-emerald-600'}`} />
          Audit chain freshness
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${stale ? 'text-amber-700' : ''}`}>
          {label} ago
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Most recent audit entry. {stale ? 'No activity in 6+ hours.' : 'Chain is recording.'}
        </p>
      </CardContent>
    </Card>
  );
}
