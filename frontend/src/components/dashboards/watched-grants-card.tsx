'use client';

/**
 * Phase 148 — Watched grants tile for the NGO dashboard.
 *
 * Reads from /api/watchlist (Phase 2 backend) filtered to kind=grant,
 * resolves each id to the grant detail, and shows the top 5 with
 * deadline + a quick "Apply" link. If the NGO has starred nothing, the
 * tile encourages them to bookmark grants on the /grants list page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, Calendar, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';

interface WatchEntry {
  kind: string;
  target_id: number;
  created_at: string;
}

interface GrantLite {
  id: number;
  title: string;
  deadline?: string | null;
  total_funding?: number | null;
  currency?: string | null;
  status?: string;
}

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (isNaN(d)) return null;
  return Math.round((d - Date.now()) / (1000 * 60 * 60 * 24));
}

export function WatchedGrantsCard() {
  const [items, setItems] = useState<GrantLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.get<{ items: WatchEntry[] }>('/api/watchlist?kind=grant');
        const ids = (list.items ?? [])
          .filter((i) => i.kind === 'grant')
          .map((i) => i.target_id)
          .slice(0, 5);
        if (ids.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }
        const grants = await Promise.all(
          ids.map((id) =>
            api.get<{ grant: GrantLite }>(`/api/grants/${id}`)
              .then((r) => r.grant)
              .catch(() => null),
          ),
        );
        if (!cancelled) {
          setItems(grants.filter((g): g is GrantLite => !!g));
        }
      } catch {
        // best effort
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-500" />
          Your watchlist
        </h3>
        <Link
          href="/grants"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Browse all
        </Link>
      </header>

      {loading && (
        <div className="text-xs text-muted-foreground py-4 text-center">
          <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" />
          Loading…
        </div>
      )}

      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground py-4">
          Star a grant on the{' '}
          <Link href="/grants" className="underline hover:text-foreground">
            grants list
          </Link>{' '}
          to bookmark it here.
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((g) => {
            const days = daysUntil(g.deadline);
            const urgent = days !== null && days >= 0 && days <= 7;
            const past = days !== null && days < 0;
            return (
              <li key={g.id}>
                <Link
                  href={`/apply/${g.id}`}
                  className="block rounded-md border border-border p-2 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{g.title}</div>
                      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        {g.deadline
                          ? new Date(g.deadline).toLocaleDateString()
                          : 'No deadline'}
                        {days !== null && (
                          <span className={
                            past
                              ? 'text-rose-700'
                              : urgent
                                ? 'text-amber-700'
                                : 'text-muted-foreground'
                          }>
                            {past ? '(closed)' : urgent ? `(${days}d left)` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
