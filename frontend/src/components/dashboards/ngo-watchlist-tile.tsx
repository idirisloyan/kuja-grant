'use client';

/**
 * Phase 314 — NGO dashboard watchlist tile.
 *
 * Shows the NGO's starred grants with a quick deadline countdown so
 * they can see what's closing soon. Self-gates when empty. Uses the
 * existing /api/watchlist endpoint.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  kind: string;
  target_id: number;
  target: { id: number; title?: string; name?: string; deadline?: string | null };
}

interface Resp {
  items: Item[];
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.round(ms / 86400000);
}

export function NgoWatchlistTile() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/watchlist').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data) return null;
  const grants = data.items.filter((i) => i.kind === 'grant');
  if (grants.length === 0) return null;

  // Sort by deadline ascending (nulls last).
  const sorted = grants.slice().sort((a, b) => {
    const da = daysUntil(a.target.deadline);
    const db = daysUntil(b.target.deadline);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Star className="w-4 h-4 text-[hsl(var(--kuja-sun))]" />
          Watching
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <ul className="space-y-1 text-xs">
          {sorted.slice(0, 5).map((it) => {
            const d = daysUntil(it.target.deadline);
            const overdue = d != null && d < 0;
            return (
              <li key={it.target_id} className="flex items-baseline justify-between gap-2">
                <Link href={`/grants/${it.target_id}`} className="truncate text-[hsl(var(--kuja-clay))] hover:underline">
                  {it.target.title || `Grant #${it.target_id}`}
                </Link>
                {d != null && (
                  <span className={overdue ? 'text-rose-700 shrink-0' : (d <= 7 ? 'text-amber-700 shrink-0' : 'text-muted-foreground shrink-0')}>
                    {overdue ? 'past' : d === 0 ? 'today' : `${d}d`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {grants.length > 5 && (
          <p className="text-xs text-muted-foreground pt-1">+{grants.length - 5} more</p>
        )}
      </CardContent>
    </Card>
  );
}
