'use client';

/**
 * Phase 245 — NGO active applications inbox tile.
 *
 * Combines submitted + under_review + scored applications into one
 * tile with a progress indicator (which stage of the pipeline they're
 * in). Hidden when empty.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AppRow {
  id: number;
  grant_title?: string;
  status: string;
}

interface Resp {
  applications: AppRow[];
}

const STAGE_BY_STATUS: Record<string, { idx: number; label: string }> = {
  submitted: { idx: 1, label: 'Submitted' },
  under_review: { idx: 2, label: 'Under review' },
  scored: { idx: 3, label: 'Scored' },
};

const ACTIVE_STATES = new Set(Object.keys(STAGE_BY_STATUS));

export function ActiveApplicationsCard() {
  const [rows, setRows] = useState<AppRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/applications?per_page=50').then((r) => {
      if (cancelled) return;
      const all = Array.isArray(r?.applications) ? r.applications : [];
      setRows(all.filter((a) => ACTIVE_STATES.has(a.status)));
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ia = STAGE_BY_STATUS[a.status]?.idx ?? 0;
      const ib = STAGE_BY_STATUS[b.status]?.idx ?? 0;
      return ib - ia;
    });
  }, [rows]);

  if (sorted.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Activity className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Applications in progress ({sorted.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {sorted.map((a) => {
          const stage = STAGE_BY_STATUS[a.status];
          const pct = stage ? (stage.idx / 3) * 100 : 0;
          return (
            <Link
              key={a.id}
              href={`/applications/${a.id}`}
              className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium truncate mr-2">
                  {a.grant_title ?? `Application #${a.id}`}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                  {stage?.label ?? a.status}
                </span>
              </div>
              <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-[hsl(var(--kuja-clay))]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
