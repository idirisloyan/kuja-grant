'use client';

/**
 * Phase 356 — Donor "repeat funded NGOs" tile.
 *
 * NGOs this donor has funded 2+ times. Highlights committed partnership
 * candidates. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  org_id: number;
  org_name: string;
  fundings: number;
}

interface Resp {
  grantees: Item[];
  total: number;
}

export function RepeatGranteesCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-repeat-grantees').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.grantees.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Award className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Repeat grantees
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.total} NGO{data.total === 1 ? '' : 's'} you&rsquo;ve funded 2+ times.
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.grantees.map((g) => (
            <li key={g.org_id} className="flex items-baseline justify-between gap-2">
              <Link href={`/ngo/${g.org_id}`} className="truncate text-[hsl(var(--kuja-clay))] hover:underline">
                {g.org_name}
              </Link>
              <span className="tabular-nums text-muted-foreground shrink-0">×{g.fundings}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
