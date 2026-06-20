'use client';

/**
 * Phase 235 — Donor "awaiting your decision" tile.
 *
 * Surfaces applications scored by reviewers but not yet awarded /
 * declined. Click → application detail. Hidden when empty.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gavel } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AppRow {
  id: number;
  org_name?: string;
  ngo_org_name?: string;
  grant_title?: string;
  ai_score: number | null;
  human_score: number | null;
}

interface Resp {
  applications: AppRow[];
}

export function AwaitingDecisionCard() {
  const [rows, setRows] = useState<AppRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/applications?status=scored&per_page=10').then((r) => {
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
          <Gavel className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Awaiting your decision ({rows.length})
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
              <div className="font-medium truncate">{a.org_name ?? a.ngo_org_name ?? `App #${a.id}`}</div>
              <div className="text-xs text-muted-foreground truncate">{a.grant_title ?? ''}</div>
            </div>
            <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
              {a.human_score != null ? `Human ${Math.round(a.human_score)}` : a.ai_score != null ? `AI ${Math.round(a.ai_score)}` : ''}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
