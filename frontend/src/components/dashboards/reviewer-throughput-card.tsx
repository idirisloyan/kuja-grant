'use client';

/**
 * ReviewerThroughputCard — Phase 16E (May 2026).
 *
 * Reviewer's "how am I doing" surface. Renders:
 *   - Queue count with SLA color (ok/watch/slipping)
 *   - Last 30d throughput + average days-to-complete
 *   - 14-day burn-down sparkline
 *
 * Honest about empty state — first day on the platform shows zeros.
 */

import { useEffect, useState } from 'react';
import {
  Clock, CheckCircle2, AlertTriangle, Loader2, Activity,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface BurnDayPoint {
  date: string;
  label: string;
  count: number;
}

interface Throughput {
  success: boolean;
  reviewer_user_id: number;
  queue_count: number;
  oldest_assigned_days: number | null;
  sla_status: 'ok' | 'watch' | 'slipping';
  completed_last_30d: number;
  avg_review_days_30d: number | null;
  burn_down_14d: BurnDayPoint[];
}

const SLA_META: Record<string, { Icon: typeof Clock; cls: string; label: string }> = {
  ok:       { Icon: CheckCircle2,  cls: 'text-[hsl(var(--kuja-grow))]', label: 'On track' },
  watch:    { Icon: Clock,         cls: 'text-[hsl(var(--kuja-sun))]',  label: 'Watch' },
  slipping: { Icon: AlertTriangle, cls: 'text-[hsl(var(--kuja-flag))]', label: 'Slipping' },
};

function MiniBurnDown({ days }: { days: BurnDayPoint[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="flex items-end gap-0.5 h-12 w-full">
      {days.map((d) => {
        const heightPct = (d.count / max) * 100;
        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center justify-end"
            title={`${d.label}: ${d.count}`}
          >
            <div
              className={cn(
                'w-full rounded-t-sm transition-all',
                d.count === 0
                  ? 'bg-[hsl(var(--kuja-sand))]/30'
                  : 'bg-[hsl(var(--kuja-clay))]',
              )}
              style={{ height: `${Math.max(2, heightPct)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ReviewerThroughputCard() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Throughput | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'reviewer') return;
    let cancelled = false;
    api.get<Throughput>('/api/dashboard/reviewer-throughput')
      .then((r) => { if (!cancelled && r.success) setData(r); })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user || user.role !== 'reviewer') return null;

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading throughput…
        </div>
      </Card>
    );
  }
  if (!data) return null;

  const sla = SLA_META[data.sla_status] ?? SLA_META.ok;
  const { Icon: SlaIcon } = sla;
  const totalBurn = data.burn_down_14d.reduce((s, d) => s + d.count, 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2 flex-wrap">
        <Activity className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Your throughput
          </div>
          <h3 className="kuja-display text-lg">SLA + pace</h3>
          <p className="text-xs text-muted-foreground">
            Live snapshot of your queue and review velocity.
          </p>
        </div>
        <Badge variant="outline" className={cn('font-semibold', sla.cls)}>
          <SlaIcon className="h-3 w-3 mr-1" /> {sla.label}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">In queue</div>
          <div className="text-lg font-semibold tabular-nums">{data.queue_count}</div>
          {data.oldest_assigned_days != null && (
            <div className="text-[10px] text-muted-foreground">
              oldest {data.oldest_assigned_days}d
            </div>
          )}
        </div>
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed 30d</div>
          <div className="text-lg font-semibold tabular-nums">{data.completed_last_30d}</div>
          <div className="text-[10px] text-muted-foreground">in last month</div>
        </div>
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg time</div>
          <div className="text-lg font-semibold tabular-nums">
            {data.avg_review_days_30d != null ? `${data.avg_review_days_30d}d` : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground">per review</div>
        </div>
        <div className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">14-day burn</div>
          <div className="text-lg font-semibold tabular-nums">{totalBurn}</div>
          <MiniBurnDown days={data.burn_down_14d} />
        </div>
      </div>

      {data.sla_status === 'slipping' && (
        <div className="mt-3 rounded-md border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-2 text-xs">
          <strong className="text-[hsl(var(--kuja-flag))]">Action needed:</strong> your oldest
          assignment is {data.oldest_assigned_days}+ days old. Clear that first to bring SLA back.
        </div>
      )}
    </Card>
  );
}
