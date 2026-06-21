'use client';

/**
 * Phase 313 — Donor "pending appeals" inbox tile.
 *
 * Mirrors the admin queue but is donor-scoped (backend filters by
 * grant.donor_org_id when the caller is a donor). Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Row {
  application_id: number;
  ngo_org_name: string | null;
  grant_title: string | null;
  days_pending: number | null;
  reason_excerpt: string | null;
}

interface Resp {
  appeals: Row[];
  total: number;
}

export function DonorAppealsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/applications/appeals').then((r) => {
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
          <Scale className="w-4 h-4 text-amber-700" />
          Appeals awaiting your decision
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          {data.total} re-review request{data.total === 1 ? '' : 's'} on your grants.
        </p>
        <ul className="space-y-1 text-xs">
          {data.appeals.slice(0, 3).map((a) => (
            <li key={a.application_id} className="border-l-2 border-amber-300 pl-2">
              <Link href={`/applications/${a.application_id}`} className="text-[hsl(var(--kuja-clay))] hover:underline">
                {a.ngo_org_name || `App #${a.application_id}`}
              </Link>
              {' · '}
              <span className="text-muted-foreground">{a.grant_title || 'grant'}</span>
              {a.days_pending != null && (
                <>
                  {' · '}
                  <span className="text-amber-700">{a.days_pending}d pending</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
