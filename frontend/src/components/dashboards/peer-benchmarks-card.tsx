'use client';

/**
 * PeerBenchmarksCard — Phase 16B (May 2026).
 *
 * Renders the caller's metrics next to peer medians + percentile rank.
 * Honest about anonymity — no peer names; just counts + medians.
 *
 * NGO view: capacity_score, win_rate, submission_count vs same-country NGOs.
 * Donor view: decision_speed, decline_rate, portfolio_size vs other donors.
 *
 * Quiet on sparse (under MIN_PEERS): renders a small explainer that
 * the bucket isn't big enough yet — never fakes confidence.
 */

import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Users, Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface BenchmarkMetric {
  code: string;
  label: string;
  self_value: number;
  peer_median: number;
  peer_count: number;
  percentile: number;
  verdict: 'above' | 'around' | 'below';
  higher_is_better: boolean;
  unit: string;
}

interface Resp {
  success: boolean;
  source: 'benchmark' | 'sparse' | 'unavailable';
  peer_count: number;
  peer_country?: string | null;
  metrics: BenchmarkMetric[];
}

function VerdictPill({ verdict }: { verdict: 'above' | 'around' | 'below' }) {
  const meta = {
    above:  { Icon: TrendingUp,   cls: 'text-[hsl(var(--kuja-grow))]', label: 'Above peers' },
    around: { Icon: Minus,        cls: 'text-[hsl(var(--kuja-ink-soft))]', label: 'On par' },
    below:  { Icon: TrendingDown, cls: 'text-[hsl(var(--kuja-flag))]', label: 'Below peers' },
  }[verdict];
  const { Icon } = meta;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold', meta.cls)}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function MetricBar({ m }: { m: BenchmarkMetric }) {
  // Show two stacked bars (self vs median). Scale to the larger of the two.
  const scale = Math.max(Math.abs(m.self_value), Math.abs(m.peer_median), 1);
  const selfPct = (Math.abs(m.self_value) / scale) * 100;
  const medianPct = (Math.abs(m.peer_median) / scale) * 100;
  const selfTone =
    m.verdict === 'above' ? 'bg-[hsl(var(--kuja-grow))]'
    : m.verdict === 'below' ? 'bg-[hsl(var(--kuja-flag))]'
    : 'bg-[hsl(var(--kuja-clay))]';

  return (
    <div className="rounded-md border border-[hsl(var(--border))] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold">{m.label}</span>
        <VerdictPill verdict={m.verdict} />
      </div>

      <div className="space-y-1">
        {/* Self row */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-12 shrink-0 text-muted-foreground">You</span>
          <div className="flex-1 h-2 rounded-full bg-[hsl(var(--kuja-sand))]/40 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', selfTone)}
              style={{ width: `${Math.min(100, selfPct)}%` }}
            />
          </div>
          <span className="w-14 text-right tabular-nums font-semibold">
            {m.self_value}{m.unit}
          </span>
        </div>
        {/* Peer median row */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-12 shrink-0 text-muted-foreground">Peers</span>
          <div className="flex-1 h-2 rounded-full bg-[hsl(var(--kuja-sand))]/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-[hsl(var(--kuja-ink-soft))]/60"
              style={{ width: `${Math.min(100, medianPct)}%` }}
            />
          </div>
          <span className="w-14 text-right tabular-nums text-muted-foreground">
            {m.peer_median}{m.unit}
          </span>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground">
        {m.percentile}th percentile · n={m.peer_count} peer{m.peer_count === 1 ? '' : 's'} ·{' '}
        {m.higher_is_better ? 'higher is better' : 'lower is better'}
      </div>
    </div>
  );
}

export function PeerBenchmarksCard() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.get<Resp>('/api/dashboard/benchmarks')
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { /* quiet */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (loading || !user) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading benchmarks…
        </div>
      </Card>
    );
  }
  if (!data) return null;

  const isNgo = user.role === 'ngo';
  const headline = isNgo ? 'How you stack up' : 'Your portfolio vs peer donors';
  const subtitle = isNgo
    ? data.peer_country
      ? `Anonymous comparison vs other NGOs in ${data.peer_country}.`
      : 'Anonymous comparison vs other NGOs on the platform.'
    : 'Anonymous comparison vs other grant-making organisations.';

  if (data.source === 'sparse') {
    return (
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-1">
          <Users className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
              Peer benchmarks
            </div>
            <h3 className="kuja-display text-lg">{headline}</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Only {data.peer_count} peer{data.peer_count === 1 ? '' : 's'} in your bucket
          {data.peer_country ? ` (${data.peer_country})` : ''} — not enough yet to fairly
          compare. As more organisations join the platform, this card fills in.
        </p>
      </Card>
    );
  }

  if (!data.metrics?.length) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2">
        <Users className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Peer benchmarks
          </div>
          <h3 className="kuja-display text-lg">{headline}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {data.peer_count} peers
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.metrics.map((m) => (
          <MetricBar key={m.code} m={m} />
        ))}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Comparisons use medians; identities are never exposed.
      </p>
    </Card>
  );
}
