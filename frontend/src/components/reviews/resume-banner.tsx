'use client';

/**
 * Phase 275 — Reviewer "session resume" banner.
 *
 * When the reviewer returns to /reviews with reviews still in
 * 'in_progress' status, show a banner listing them so they can
 * jump straight back in. Hidden when no in-progress reviews.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface ReviewRow {
  id: number;
  org_name?: string;
  ngo_org_name?: string;
  grant_title?: string;
  overall_score?: number | null;
}

interface Resp { reviews: ReviewRow[] }

export function ReviewerResumeBanner() {
  const [rows, setRows] = useState<ReviewRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/reviews/?status=in_progress&limit=3').then((r) => {
      if (cancelled) return;
      setRows(Array.isArray(r?.reviews) ? r.reviews.slice(0, 3) : []);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-3 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-spark))] inline-flex items-center gap-1.5">
        <PlayCircle className="w-3.5 h-3.5" />
        Resume in progress
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/reviews/${r.id}`}
            className="block rounded-md px-2 py-1.5 text-sm hover:bg-background/60"
          >
            <span className="font-medium truncate mr-2">
              {r.org_name ?? r.ngo_org_name ?? `Review #${r.id}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {r.grant_title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
