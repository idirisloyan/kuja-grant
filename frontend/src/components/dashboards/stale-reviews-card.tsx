'use client';

/**
 * Phase 226 — Admin "stale reviews" alert tile.
 *
 * Reads /api/reviews/workload and surfaces reviewers with any
 * `overdue` count (assigned > 14 days). One row per reviewer who has
 * something stale. Hidden when nothing is overdue.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface ReviewerRow {
  reviewer_user_id: number;
  name: string | null;
  email: string;
  overdue: number;
}

interface Resp {
  reviewers: ReviewerRow[];
}

export function StaleReviewsCard() {
  const [rows, setRows] = useState<ReviewerRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/reviews/workload').then((r) => {
      if (cancelled) return;
      const stale = (r?.reviewers ?? []).filter((x) => (x.overdue ?? 0) > 0);
      setRows(stale);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + (r.overdue ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          Stale reviews ({total})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((r) => (
          <div key={r.reviewer_user_id} className="flex items-center justify-between text-sm rounded-md px-2 py-1.5 hover:bg-muted">
            <span className="truncate mr-2">{r.name ?? r.email}</span>
            <span className="tabular-nums text-xs text-rose-600 whitespace-nowrap">
              {r.overdue} overdue
            </span>
          </div>
        ))}
        <div className="pt-2 border-t border-border">
          <Link
            href="/admin/reviewers-workload"
            className="text-xs text-[hsl(var(--kuja-clay))] hover:underline"
          >
            Open workload dashboard →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
