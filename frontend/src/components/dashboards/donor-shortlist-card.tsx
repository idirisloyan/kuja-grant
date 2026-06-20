'use client';

/**
 * Phase 213 — Donor starred shortlist tile.
 *
 * Reads /api/applications?starred=1 and lists the applications the
 * donor (or someone on their team) has flagged. Hidden when empty.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AppRow {
  id: number;
  grant_id: number;
  grant_title?: string;
  org_name?: string;
  status: string;
  ai_score: number | null;
}

interface Resp {
  applications: AppRow[];
}

export function DonorShortlistCard() {
  const [rows, setRows] = useState<AppRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/applications?starred=1&per_page=10').then((r) => {
      if (cancelled) return;
      setRows(Array.isArray(r?.applications) ? r.applications : []);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Star className="w-4 h-4 fill-[hsl(var(--kuja-clay))] text-[hsl(var(--kuja-clay))]" />
          Shortlisted ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((a) => (
          <Link
            key={a.id}
            href={`/applications/${a.id}`}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <div className="min-w-0 mr-2">
              <div className="font-medium truncate">{a.org_name ?? `Application #${a.id}`}</div>
              <div className="text-xs text-muted-foreground truncate">
                {a.grant_title ?? `Grant #${a.grant_id}`}
              </div>
            </div>
            <span className="text-xs tabular-nums whitespace-nowrap">
              {a.ai_score != null ? `${Math.round(a.ai_score)}` : a.status}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
