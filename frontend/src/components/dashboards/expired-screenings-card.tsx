'use client';

/**
 * Phase 351 — Admin expired sanctions screening alert tile.
 *
 * Lists NGO orgs whose latest screening is > 6 months old. Surfaces 3
 * oldest. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  org_id: number;
  org_name: string | null;
  last_screened_at: string | null;
}

interface Resp {
  total: number;
  oldest: Item[];
}

export function ExpiredScreeningsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/expired-screenings').then((r) => {
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
          <ShieldAlert className="w-4 h-4 text-amber-700" />
          Stale screenings
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.total} NGO org{data.total === 1 ? '' : 's'} not screened in 6+ months.
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.oldest.map((o) => (
            <li key={o.org_id} className="border-l-2 border-amber-300 pl-2">
              <Link href={`/ngo/${o.org_id}`} className="text-[hsl(var(--kuja-clay))] hover:underline">
                {o.org_name || `Org #${o.org_id}`}
              </Link>
              {o.last_screened_at && (
                <span className="text-muted-foreground"> · last {new Date(o.last_screened_at).toLocaleDateString()}</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
