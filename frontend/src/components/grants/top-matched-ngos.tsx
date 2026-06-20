'use client';

/**
 * Phase 155 — Donor view: ranked NGOs that are a strong fit for this
 * grant. Pulls from /api/match/for-grant/<id> (Phase 112 match engine).
 *
 * Useful when a donor wants to nudge a candidate to apply before the
 * deadline. The match engine ranks by sector + geography Jaccard +
 * capacity-vs-burden + track record (see app/services/match_engine.py).
 *
 * Self-gates: returns null when the flag is off or the list is empty.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Match {
  org_id: number;
  score: number;
  top_strength?: string | null;
  top_blocker?: string | null;
  org?: {
    id: number;
    name?: string | null;
    sectors?: string[] | null;
    countries?: string[] | null;
  } | null;
}

interface Resp {
  matches: Match[];
  flag: 'on' | 'off';
}

export function TopMatchedNGOs({ grantId }: { grantId: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>(`/api/match/for-grant/${grantId}?limit=6`).then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => {/* silent */}).finally(() => {
      if (!state.cancelled) setLoading(false);
    });
    return () => { state.cancelled = true; };
  }, [grantId]);

  if (loading) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" /> Loading peer matches…
      </Card>
    );
  }
  if (!data || data.flag === 'off' || data.matches.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 space-y-3">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[hsl(var(--kuja-clay))]" />
            Top matched NGOs
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ranked by sector + geography overlap, capacity fit, and track record.
          </p>
        </div>
      </header>
      <ul className="space-y-2">
        {data.matches.map((m) => (
          <li key={m.org_id}>
            <Link
              href={`/ngo/${m.org_id}`}
              className="block rounded-md border border-border p-2.5 hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">
                    {m.org?.name ?? `Org #${m.org_id}`}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(m.org?.sectors ?? []).slice(0, 2).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                    {(m.org?.countries ?? []).slice(0, 2).map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                    ))}
                  </div>
                  {m.top_strength && (
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      {m.top_strength}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={
                    'font-serif text-xl ' + (
                      m.score >= 70 ? 'text-emerald-700'
                      : m.score >= 50 ? 'text-amber-700'
                      : 'text-muted-foreground'
                    )
                  }>
                    {m.score}
                  </div>
                  <div className="text-[10px] text-muted-foreground">/100</div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground italic border-t border-border pt-2">
        Match is automated. NGOs apply through their own dashboards.
      </p>
    </Card>
  );
}
