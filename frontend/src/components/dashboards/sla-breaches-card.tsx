'use client';

/**
 * Phase 301 — Admin SLA breach tile.
 *
 * Counts applications past the expected decision deadline (default 30
 * days after submitted_at, status still pre-decision). Shows total +
 * the 3 most overdue. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  application_id: number;
  ngo_org_name: string | null;
  grant_title: string | null;
  days_overdue: number;
  status: string;
}

interface Resp {
  sla_days: number;
  total: number;
  most_overdue: Item[];
}

export function SlaBreachesCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/sla-breaches').then((r) => {
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
          SLA breaches
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          {data.total} application{data.total === 1 ? '' : 's'} still pre-decision past the {data.sla_days}-day mark.
        </p>
        <ul className="space-y-1 text-xs">
          {data.most_overdue.map((it) => (
            <li key={it.application_id} className="border-l-2 border-rose-300 pl-2">
              <Link href={`/applications/${it.application_id}`} className="text-[hsl(var(--kuja-clay))] hover:underline">
                {it.ngo_org_name || `App #${it.application_id}`}
              </Link>
              {' · '}
              <span className="text-muted-foreground">{it.grant_title || 'grant'}</span>
              {' · '}
              <span className="text-rose-700">{it.days_overdue}d overdue</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
