'use client';

/**
 * Phase 323 — Donor "AI vs human score agreement" per criterion.
 *
 * Lists the 5 criteria where AI and reviewer human scores most diverge
 * (lowest agreement_pct first). |ai - human| <= 10 counts as agreement.
 * Self-gates when no criteria meet the sample threshold.
 */

import { useEffect, useState } from 'react';
import { Sigma } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  key: string;
  label: string;
  n: number;
  agreement_pct: number;
}

interface Resp {
  criteria: Item[];
  total_criteria_analyzed: number;
}

function tone(pct: number) {
  if (pct >= 75) return 'text-emerald-700';
  if (pct >= 50) return 'text-amber-700';
  return 'text-rose-700';
}

export function AiHumanAgreementCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ai-human-agreement').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.criteria.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Sigma className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          AI vs human agreement
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          Criteria where AI and your reviewers diverge most (within 10 pts = agree).
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.criteria.map((c) => (
            <li key={c.key} className="flex items-baseline justify-between gap-2">
              <span className="truncate">{c.label}</span>
              <span className={`tabular-nums shrink-0 ${tone(c.agreement_pct)}`}>
                {c.agreement_pct}% <span className="text-muted-foreground">({c.n})</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
