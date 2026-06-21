'use client';

/**
 * Phase 292 — Admin reviewer COI rollup tile.
 *
 * Surfaces the count of reviewer COI disclosures over the last 30 days
 * + the 3 most recent (reviewer name, kind, application id). Self-gates
 * when count is zero. Reads from the hash-chained audit log via
 * /api/reviews/coi-rollup.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  created_at: string | null;
  reviewer_email: string | null;
  reviewer_name: string | null;
  kind: string | null;
  application_id: number | null;
}

interface Resp {
  window_days: number;
  total: number;
  recent: Item[];
}

const KIND_LABEL: Record<string, string> = {
  employer_overlap: 'employer overlap',
  prior_consulting: 'prior consulting',
  family: 'family',
  other: 'other',
};

export function ReviewerCoiRollupCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/reviews/coi-rollup').then((r) => {
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
          Reviewer COI disclosures
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          {data.total} disclosure{data.total === 1 ? '' : 's'} in the last {data.window_days} days.
        </p>
        <ul className="space-y-1 text-xs">
          {data.recent.map((it, i) => (
            <li key={i} className="border-l-2 border-amber-300 pl-2">
              <span className="font-medium">{it.reviewer_name || it.reviewer_email || 'Reviewer'}</span>
              {' · '}
              <span>{it.kind ? (KIND_LABEL[it.kind] || it.kind) : '—'}</span>
              {it.application_id != null && (
                <>
                  {' · '}
                  <Link href={`/applications/${it.application_id}`} className="text-[hsl(var(--kuja-clay))] hover:underline">
                    app #{it.application_id}
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
        <Link href="/admin/reviewers-workload" className="block text-xs text-[hsl(var(--kuja-clay))] hover:underline">
          Open reviewer workload →
        </Link>
      </CardContent>
    </Card>
  );
}
