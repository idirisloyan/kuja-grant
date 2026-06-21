'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface StalledRow {
  application_id: number;
  grant_title: string | null;
  status: string;
  days_stalled: number;
}

interface Resp {
  stalled: StalledRow[];
  total: number;
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  scored: 'Scored',
  revision_requested: 'Revision requested',
};

export function NgoStalledApplicationsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-stalled-applications').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          Stalled applications
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-2">
          {data.stalled.map((row) => (
            <li key={row.application_id} className="flex items-baseline justify-between gap-3">
              <Link
                href={`/applications/${row.application_id}`}
                className="truncate hover:underline"
              >
                {row.grant_title || `Application #${row.application_id}`}
              </Link>
              <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                {STATUS_LABEL[row.status] || row.status} · {row.days_stalled}d
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
