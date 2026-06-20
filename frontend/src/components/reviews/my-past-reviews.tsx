'use client';

/**
 * Phase 244 — Reviewer "your past reviews" sidebar.
 *
 * Lists the 5 most recent completed reviews. Hidden when none.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface ReviewRow {
  id: number;
  org_name?: string;
  ngo_org_name?: string;
  grant_title?: string;
  overall_score?: number | null;
  completed_at?: string | null;
}

interface Resp {
  reviews: ReviewRow[];
}

export function MyPastReviews() {
  const [rows, setRows] = useState<ReviewRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/reviews/?status=completed&limit=5').then((r) => {
      if (cancelled) return;
      const list = Array.isArray(r?.reviews) ? r.reviews : [];
      list.sort((a, b) => {
        const ta = a.completed_at ? Date.parse(a.completed_at) : 0;
        const tb = b.completed_at ? Date.parse(b.completed_at) : 0;
        return tb - ta;
      });
      setRows(list.slice(0, 5));
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5 mb-2">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
        Your recent reviews
      </div>
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/reviews/${r.id}`}
          className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          <span className="truncate mr-2">
            {r.org_name ?? r.ngo_org_name ?? `Review #${r.id}`}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
            {r.overall_score != null ? Math.round(r.overall_score) : '—'}
          </span>
        </Link>
      ))}
    </div>
  );
}
