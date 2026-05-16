'use client';

/**
 * DonorCohortCard — Phase 24C (May 2026).
 *
 * Sister of PeerBenchmarksCard. PeerBenchmarks shows operational metrics
 * (decision speed, decline rate, portfolio size). This card shows
 * *portfolio quality* — how the NGOs you fund stack up vs the NGOs
 * other donors fund.
 *
 * Metrics: grantee capacity score, AI score at award, country + sector
 * diversity, share of funding going to small/emerging orgs, grantee
 * reporting on-time rate.
 *
 * Honest about sparseness (sparse cohort or sparse self-sample → drop
 * the row). Visible to donor (own portfolio) + admin (passing
 * donor_org_id query param).
 */

import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Globe2, Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface CohortMetric {
  code: string;
  label: string;
  self_value: number;
  self_sample_size: number;
  cohort_median: number;
  cohort_count: number;
  percentile: number;
  verdict: 'above' | 'around' | 'below';
  higher_is_better: boolean;
  unit: string;
}

interface Resp {
  success: boolean;
  source: 'cohort' | 'sparse';
  cohort_size: number;
  portfolio_size?: number;
  metrics: CohortMetric[];
  computed_at?: string;
}

function VerdictPill({ verdict }: { verdict: 'above' | 'around' | 'below' }) {
  const meta = {
    above:  { Icon: TrendingUp,   cls: 'text-[hsl(var(--kuja-grow))]', label: 'Above cohort' },
    around: { Icon: Minus,        cls: 'text-[hsl(var(--kuja-ink-soft))]', label: 'On par' },
    below:  { Icon: TrendingDown, cls: 'text-[hsl(var(--kuja-flag))]', label: 'Below cohort' },
  }[verdict];
  const { Icon } = meta;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold', meta.cls)}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function MetricRow({ m }: { m: CohortMetric }) {
  const scale = Math.max(Math.abs(m.self_value), Math.abs(m.cohort_median), 1);
  const selfPct = (Math.abs(m.self_value) / scale) * 100;
  const cohortPct = (Math.abs(m.cohort_median) / scale) * 100;
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
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-16 shrink-0 text-muted-foreground">You</span>
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
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-16 shrink-0 text-muted-foreground">Cohort</span>
          <div className="flex-1 h-2 rounded-full bg-[hsl(var(--kuja-sand))]/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-[hsl(var(--kuja-ink-soft))]/60"
              style={{ width: `${Math.min(100, cohortPct)}%` }}
            />
          </div>
          <span className="w-14 text-right tabular-nums text-muted-foreground">
            {m.cohort_median}{m.unit}
          </span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {m.percentile}th percentile · n={m.cohort_count} donor{m.cohort_count === 1 ? '' : 's'} ·
        {' '}your sample: {m.self_sample_size}
      </div>
    </div>
  );
}

export function DonorCohortCard() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'donor') return;
    let cancelled = false;
    api.get<Resp>('/api/dashboard/donor-cohort-analytics')
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { /* quiet */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user || user.role !== 'donor') return null;

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cohort analytics…
        </div>
      </Card>
    );
  }
  if (!data) return null;

  if (data.source === 'sparse') {
    return (
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-1">
          <Globe2 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
              Donor cohort
            </div>
            <h3 className="kuja-display text-lg">Portfolio quality vs cohort</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Only {data.cohort_size} other donor{data.cohort_size === 1 ? '' : 's'} on the
          platform — not enough yet to fairly compare. As more grant-makers join, this
          card fills in.
        </p>
      </Card>
    );
  }

  if (!data.metrics?.length) {
    return (
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-1">
          <Globe2 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
              Donor cohort
            </div>
            <h3 className="kuja-display text-lg">Portfolio quality vs cohort</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Once you&apos;ve awarded a couple of grants, we&apos;ll show how your portfolio compares
          to the {data.cohort_size} other donor{data.cohort_size === 1 ? '' : 's'} on
          this platform across capacity, diversity, and grantee reporting compliance.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2">
        <Globe2 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Donor cohort
          </div>
          <h3 className="kuja-display text-lg">Portfolio quality vs cohort</h3>
          <p className="text-xs text-muted-foreground">
            Anonymous comparison of the NGOs you fund vs the NGOs other donors fund —
            capacity, diversity, and grantee reporting compliance.
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {data.cohort_size} donors
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.metrics.map((m) => (
          <MetricRow key={m.code} m={m} />
        ))}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Medians only · no donor or NGO identities exposed · portfolio size: {data.portfolio_size ?? 0}
      </p>
    </Card>
  );
}
