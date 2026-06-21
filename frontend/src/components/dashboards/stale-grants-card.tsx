'use client';

/**
 * Phase 353 — Admin "stale published grants" tile.
 *
 * Lists grants still 'open' whose deadline has passed by > 7 days.
 * Operational drift signal. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  grant_id: number;
  title: string;
  deadline: string | null;
}

interface Resp {
  total: number;
  oldest: Item[];
}

export function StaleGrantsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/stale-published-grants').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-700" />
          Stale published grants
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.total} grant{data.total === 1 ? '' : 's'} still &ldquo;open&rdquo; with a deadline more than 7 days ago.
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.oldest.map((g) => (
            <li key={g.grant_id} className="border-l-2 border-amber-300 pl-2">
              <Link href={`/grants/${g.grant_id}`} className="text-[hsl(var(--kuja-clay))] hover:underline">
                {g.title || `Grant #${g.grant_id}`}
              </Link>
              {g.deadline && (
                <span className="text-muted-foreground"> · deadline {new Date(g.deadline).toLocaleDateString()}</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
