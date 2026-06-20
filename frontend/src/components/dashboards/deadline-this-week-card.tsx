'use client';

/**
 * Phase 207 — NGO "deadline this week" tile.
 *
 * Lists draft applications whose grant deadline falls in the next 7
 * days. Sorts by deadline ascending. Click → /apply/<grantId> to keep
 * working. Hidden when nothing is due.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface DraftRow {
  id: number;
  grant_id: number;
  grant_title: string;
  deadline: string | null;
}

interface Resp {
  applications: DraftRow[];
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

export function DeadlineThisWeekCard() {
  const [rows, setRows] = useState<DraftRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/applications?status=draft&limit=50').then((r) => {
      if (cancelled) return;
      const drafts = Array.isArray(r?.applications) ? r.applications : [];
      const filtered = drafts
        .map((a) => ({ ...a, _days: daysUntil(a.deadline) }))
        .filter((a) => a._days != null && a._days >= 0 && a._days <= 7)
        .sort((a, b) => (a._days ?? 99) - (b._days ?? 99))
        .map(({ _days, ...rest }) => rest);
      setRows(filtered);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Deadlines this week
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((row) => {
          const d = daysUntil(row.deadline);
          return (
            <Link
              key={row.id}
              href={`/apply/${row.grant_id}`}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <span className="truncate mr-2">{row.grant_title || `Grant #${row.grant_id}`}</span>
              <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                {d === 0 ? 'today' : d === 1 ? 'tomorrow' : `${d}d`}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
