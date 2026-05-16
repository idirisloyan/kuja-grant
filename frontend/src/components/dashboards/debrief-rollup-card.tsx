'use client';

/**
 * DebriefRollupCard — Phase 15A.
 *
 * NGO sees: "Reasons your applications win/lose lately."
 * Donor sees: "Why you've awarded/declined lately."
 *
 * Reads /api/applications/debrief/rollup (role-scoped, cached 30s).
 * Renders as two compact stacks of horizontal bars (wins on left,
 * losses on right). Quiet on empty: shows a small explainer when there
 * isn't enough debrief data yet.
 *
 * Source-aware:
 *   - 'rollup'      → full bar charts
 *   - 'sparse'      → "fewer than 3 decisions in this window"
 *   - 'no_debrief'  → "decisions exist but no debrief recorded"
 */

import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, BarChart3, Loader2, Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface Row {
  code: string;
  label: string;
  tone: 'win' | 'loss' | 'both';
  count: number;
  pct: number;
}

interface Rollup {
  scope: string;
  scope_id: number;
  lookback_days: number;
  total_decided: number;
  awarded_total: number;
  rejected_total: number;
  debriefed_win: number;
  debriefed_loss: number;
  wins_by_reason: Row[];
  losses_by_reason: Row[];
  source: 'rollup' | 'sparse' | 'no_debrief';
}

function BarRow({ row, tone }: { row: Row; tone: 'win' | 'loss' }) {
  const barColor = tone === 'win'
    ? 'bg-[hsl(var(--kuja-grow))]'
    : 'bg-[hsl(var(--kuja-flag))]';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate" title={row.label}>{row.label}</span>
        <span className="font-semibold tabular-nums text-muted-foreground shrink-0">
          {row.count} · {row.pct}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[hsl(var(--kuja-sand))]/40 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(100, row.pct)}%` }}
        />
      </div>
    </div>
  );
}

export function DebriefRollupCard() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Rollup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.get<{ success: boolean } & Rollup>('/api/applications/debrief/rollup')
      .then((r) => { if (!cancelled && r.success) setData(r); })
      .catch(() => { /* quiet */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (loading || !user) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading debrief rollup…
        </div>
      </Card>
    );
  }
  if (!data) return null;

  const isNgo = user.role === 'ngo';
  const headline = isNgo
    ? 'Why your applications win and lose'
    : 'Why you award and decline';
  const subtitle = isNgo
    ? 'Aggregated from donor debriefs on your decided applications.'
    : 'Aggregated from your own debriefs on grantee applications.';

  // Empty / sparse states
  if (data.source === 'sparse') {
    return (
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-1">
          <BarChart3 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
              Debrief rollup
            </div>
            <h3 className="kuja-display text-lg">{headline}</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Only {data.total_decided} decided application{data.total_decided === 1 ? '' : 's'} in
          the last {Math.round(data.lookback_days / 30)} months — not enough yet to see patterns.
          {!isNgo && ' Tip: record a quick debrief when you award or decline so this fills in over time.'}
        </p>
      </Card>
    );
  }

  if (data.source === 'no_debrief') {
    return (
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-1">
          <BarChart3 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
              Debrief rollup
            </div>
            <h3 className="kuja-display text-lg">{headline}</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {data.total_decided} decided application{data.total_decided === 1 ? '' : 's'} but
          no structured reasons recorded yet.
          {isNgo
            ? ' When a donor records a debrief on your decisions, the patterns will appear here.'
            : ' Pick a reason chip on any awarded/declined application to start building this view.'}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-2 mb-3 flex-wrap">
        <BarChart3 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Debrief rollup
            <Sparkles className="h-3 w-3" />
          </div>
          <h3 className="kuja-display text-lg">{headline}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right text-[10px] text-muted-foreground shrink-0">
          <div><strong className="tabular-nums">{data.awarded_total}</strong> awarded</div>
          <div><strong className="tabular-nums">{data.rejected_total}</strong> declined</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--kuja-grow))]">
            <TrendingUp className="h-3.5 w-3.5" />
            {isNgo ? 'Top win reasons' : 'Top award reasons'}
            <Badge variant="outline" className="ml-1 text-[10px]">{data.debriefed_win}</Badge>
          </div>
          {data.wins_by_reason.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No debriefed wins in this window.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.wins_by_reason.slice(0, 6).map((r) => (
                <li key={r.code}><BarRow row={r} tone="win" /></li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--kuja-flag))]">
            <TrendingDown className="h-3.5 w-3.5" />
            {isNgo ? 'Top loss reasons' : 'Top decline reasons'}
            <Badge variant="outline" className="ml-1 text-[10px]">{data.debriefed_loss}</Badge>
          </div>
          {data.losses_by_reason.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No debriefed losses in this window.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.losses_by_reason.slice(0, 6).map((r) => (
                <li key={r.code}><BarRow row={r} tone="loss" /></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Window: last {Math.round(data.lookback_days / 30)} months · counts are over debriefed decisions only.
      </p>
    </Card>
  );
}
