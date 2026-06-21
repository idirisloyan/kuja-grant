'use client';

/**
 * Phase 317 — Donor "appeal SLA" alert tile.
 *
 * Lists pending appeals on the donor's grants older than 7 days. Soft
 * accountability — quick resolve helps NGO trust.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  application_id: number;
  ngo_org_name: string | null;
  days_pending: number | null;
}

interface Resp {
  sla_days: number;
  total: number;
  oldest: Item[];
}

export function DonorAppealSlaCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-appeal-sla').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card className="border-rose-300">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <AlarmClock className="w-4 h-4 text-rose-700" />
          Appeals past {data.sla_days}d
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          {data.total} appeal{data.total === 1 ? '' : 's'} on your grants outstanding more than {data.sla_days} days.
        </p>
        <ul className="space-y-1 text-xs">
          {data.oldest.map((it) => (
            <li key={it.application_id} className="border-l-2 border-rose-300 pl-2">
              <Link href={`/applications/${it.application_id}`} className="text-[hsl(var(--kuja-clay))] hover:underline">
                {it.ngo_org_name || `App #${it.application_id}`}
              </Link>
              {it.days_pending != null && (
                <>
                  {' · '}
                  <span className="text-rose-700">{it.days_pending}d</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
