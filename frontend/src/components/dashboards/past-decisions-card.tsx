'use client';

/**
 * Phase 260 — NGO past donor decisions panel.
 *
 * Lists the 5 most recent decisions (awarded / declined / rejected /
 * revision_requested) on this NGO's applications. Hidden when none.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GitCommit } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AppRow {
  id: number;
  grant_title?: string;
  status: string;
  decision_reason_code?: string | null;
  decision_notes?: string | null;
  decision_recorded_at?: string | null;
}

interface Resp { applications: AppRow[] }

const DECISION_STATES = new Set([
  'awarded', 'declined', 'rejected', 'revision_requested',
]);

const TONE: Record<string, string> = {
  awarded: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950/50',
  declined: 'text-rose-700 bg-rose-100 dark:bg-rose-950/50',
  rejected: 'text-rose-700 bg-rose-100 dark:bg-rose-950/50',
  revision_requested: 'text-amber-700 bg-amber-100 dark:bg-amber-950/50',
};

export function PastDecisionsCard() {
  const [rows, setRows] = useState<AppRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/applications?per_page=100').then((r) => {
      if (cancelled) return;
      const all = Array.isArray(r?.applications) ? r.applications : [];
      const decided = all
        .filter((a) => DECISION_STATES.has(a.status))
        .sort((a, b) => {
          const ta = a.decision_recorded_at ? Date.parse(a.decision_recorded_at) : 0;
          const tb = b.decision_recorded_at ? Date.parse(b.decision_recorded_at) : 0;
          return tb - ta;
        })
        .slice(0, 5);
      setRows(decided);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Recent decisions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((a) => (
          <Link
            key={a.id}
            href={`/applications/${a.id}`}
            className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{a.grant_title ?? `Application #${a.id}`}</span>
              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${TONE[a.status] ?? ''}`}>
                {a.status}
              </span>
            </div>
            {(a.decision_notes || a.decision_reason_code) && (
              <div className="text-xs text-muted-foreground truncate">
                {a.decision_notes || a.decision_reason_code}
              </div>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
