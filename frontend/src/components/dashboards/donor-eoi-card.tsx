'use client';

/**
 * Phase 349 — Donor "expressions of interest" rollup tile.
 *
 * Lists the 5 newest EOIs on the donor's grants so they can pre-engage
 * with prospective applicants. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  id: number;
  org_id: number;
  org_name: string | null;
  grant_id: number;
  grant_title: string | null;
  created_at: string | null;
}

interface Resp {
  expressions: Item[];
  total: number;
}

export function DonorEoiCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-expressions-of-interest').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Expressions of interest
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.total} NGO{data.total === 1 ? '' : 's'} have signaled interest.
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.expressions.map((e) => (
            <li key={e.id} className="border-l-2 border-[hsl(var(--kuja-spark-soft))] pl-2">
              <span className="font-medium">{e.org_name || `Org #${e.org_id}`}</span>
              <span className="text-muted-foreground"> on </span>
              <Link href={`/grants/${e.grant_id}`} className="text-[hsl(var(--kuja-clay))] hover:underline">
                {e.grant_title || `Grant #${e.grant_id}`}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
