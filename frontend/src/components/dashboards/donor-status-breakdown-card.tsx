'use client';

/**
 * Phase 206 — Donor "applications by status" mini-tile.
 *
 * Reads `app_status_breakdown` from /api/dashboard/stats and renders
 * one click-through row per status. Hidden when there are no
 * applications yet.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  app_status_breakdown?: Record<string, number>;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  scored: 'Scored',
  awarded: 'Awarded',
  declined: 'Declined',
  rejected: 'Rejected',
  revision_requested: 'Revision requested',
  withdrawn: 'Withdrawn',
};

const STATUS_ORDER = [
  'submitted', 'under_review', 'scored', 'revision_requested',
  'awarded', 'declined', 'rejected', 'withdrawn',
];

export function DonorStatusBreakdownCard() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/stats').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  const breakdown = data?.app_status_breakdown ?? {};
  const entries = STATUS_ORDER
    .filter((s) => (breakdown[s] ?? 0) > 0)
    .map((s) => [s, breakdown[s]] as const);

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Applications by status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {entries.map(([status, count]) => (
          <Link
            key={status}
            href={`/applications?status=${encodeURIComponent(status)}`}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <span>{STATUS_LABEL[status] ?? status}</span>
            <span className="tabular-nums font-semibold">{count}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
