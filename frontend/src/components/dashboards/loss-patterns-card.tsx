'use client';

/**
 * Phase 277 — NGO loss-pattern surface.
 *
 * Counts decision_reason_code occurrences across the NGO's declined +
 * rejected applications. Surfaces the top 3 so the NGO knows what to
 * focus on. Hidden when < 3 losses or no codes recorded.
 */

import { useEffect, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AppRow {
  id: number;
  status: string;
  decision_reason_code?: string | null;
}

interface Resp { applications: AppRow[] }

const LABELS: Record<string, string> = {
  budget_too_high: 'Budget too high',
  budget_too_low: 'Budget too low',
  scope_misalign: 'Scope misalignment',
  capacity_gap: 'Capacity gap',
  weak_evidence: 'Weak evidence',
  incomplete: 'Incomplete application',
  ineligible: 'Eligibility issue',
  late: 'Late submission',
  no_outcome_metric: 'No outcome metric',
};

const LOSS_STATES = new Set(['declined', 'rejected']);

export function LossPatternsCard() {
  const [counts, setCounts] = useState<Array<{ code: string; count: number }>>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/applications?per_page=100').then((r) => {
      if (cancelled) return;
      const all = Array.isArray(r?.applications) ? r.applications : [];
      const losses = all.filter((a) => LOSS_STATES.has(a.status));
      const c: Record<string, number> = {};
      for (const a of losses) {
        if (a.decision_reason_code) {
          c[a.decision_reason_code] = (c[a.decision_reason_code] || 0) + 1;
        }
      }
      const sorted = Object.entries(c)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      setCounts(sorted);
      setTotal(losses.length);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (counts.length === 0 || total < 3) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-rose-600" />
          Patterns in past declines
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1.5">
        <p className="text-xs text-muted-foreground">
          Across {total} declined / rejected applications:
        </p>
        {counts.map((c) => (
          <div key={c.code} className="flex items-center justify-between text-sm">
            <span>{LABELS[c.code] ?? c.code}</span>
            <span className="tabular-nums text-xs text-muted-foreground">{c.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
