'use client';

/**
 * Phase 263 — Donor "next steps after grant closes" tile.
 *
 * Surfaces grants whose deadline has passed but still have
 * applications in 'submitted' status. Prompts the donor to start
 * reviews.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AppRow {
  id: number;
  grant_id: number;
  grant_title?: string;
  status: string;
}

interface AppsResp { applications: AppRow[] }

interface GrantRow {
  id: number;
  title?: string;
  deadline?: string | null;
}

interface GrantsResp { grants: GrantRow[] }

export function PostDeadlineCard() {
  const [grants, setGrants] = useState<Array<{ grant_id: number; title: string; count: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<AppsResp>('/api/applications?status=submitted&per_page=100').catch(() => null),
      api.get<GrantsResp>('/api/grants/?per_page=100').catch(() => null),
    ]).then(([apps, gs]) => {
      if (cancelled) return;
      const submittedApps = apps?.applications ?? [];
      const grantsList = gs?.grants ?? [];
      const grantById = new Map(grantsList.map((g) => [g.id, g]));
      const counts = new Map<number, { title: string; count: number }>();
      const now = Date.now();
      for (const a of submittedApps) {
        const g = grantById.get(a.grant_id);
        if (!g || !g.deadline) continue;
        const t = Date.parse(g.deadline);
        if (Number.isNaN(t) || t >= now) continue;
        const prev = counts.get(a.grant_id);
        if (prev) prev.count += 1;
        else counts.set(a.grant_id, { title: g.title ?? a.grant_title ?? `Grant #${a.grant_id}`, count: 1 });
      }
      setGrants(Array.from(counts, ([grant_id, v]) => ({ grant_id, title: v.title, count: v.count })));
    });
    return () => { cancelled = true; };
  }, []);

  if (grants.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <AlarmClock className="w-4 h-4 text-rose-600" />
          Grants past deadline — needs review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {grants.map((g) => (
          <Link
            key={g.grant_id}
            href={`/applications?grant_id=${g.grant_id}&status=submitted`}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <span className="truncate mr-2">{g.title}</span>
            <span className="tabular-nums text-xs text-rose-600 whitespace-nowrap">
              {g.count} waiting
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
