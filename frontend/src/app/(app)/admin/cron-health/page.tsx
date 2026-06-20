'use client';

/**
 * Phase 153 — Cron health monitor.
 *
 * Reads /api/cron/health (admin-only) and shows each registered cron's
 * last-run state. Bands:
 *   fresh   = ran within expected cadence × 1.5
 *   overdue = last run too long ago
 *   never   = no row ever — alarmingly fresh deploy or broken cron
 *
 * Pair with the Railway / GitHub Actions schedule to spot a cron that
 * silently stopped running before the team notices the downstream gap.
 */

import { useEffect, useState } from 'react';
import { Clock, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { FreshnessStamp } from '@/components/shared/freshness-stamp';
import { cn } from '@/lib/utils';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface CronRow {
  name: string;
  description: string;
  cadence_hours: number;
  last_run_at: string | null;
  last_success: boolean | null;
  last_duration_ms: number | null;
  last_summary: string | null;
  staleness_band: 'fresh' | 'overdue' | 'never';
}

interface Resp {
  crons: CronRow[];
  summary: { fresh: number; overdue: number; never: number };
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso).getTime();
  const ms = Date.now() - d;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function CronHealthPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  // Phase 239 — last-fetched timestamp so the admin can see how stale
  // the rendered numbers are.
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/cron/health').then((r) => {
      if (!cancelled) {
        setData(r);
        setLoadedAt(new Date());
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totalBad = data ? data.summary.overdue + data.summary.never : 0;

  return (
    <PageShell>
      <PageHeader
        title="Cron health"
        icon={Clock}
        subtitle="Last-run timestamp per scheduled job. Overdue + never bands flag a broken schedule before it bites."
        secondaryAction={<FreshnessStamp loadedAt={loadedAt} label="Loaded" />}
      />
      <PageMain>
        {loading && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </div>
        )}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3 mb-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Fresh</div>
                <div className="font-serif text-2xl text-emerald-700">{data.summary.fresh}</div>
              </Card>
              <Card className={cn('p-4', data.summary.overdue > 0 ? 'border-amber-300' : '')}>
                <div className="text-xs text-muted-foreground">Overdue</div>
                <div className={cn('font-serif text-2xl', data.summary.overdue > 0 ? 'text-amber-700' : '')}>
                  {data.summary.overdue}
                </div>
              </Card>
              <Card className={cn('p-4', data.summary.never > 0 ? 'border-rose-300' : '')}>
                <div className="text-xs text-muted-foreground">Never</div>
                <div className={cn('font-serif text-2xl', data.summary.never > 0 ? 'text-rose-700' : '')}>
                  {data.summary.never}
                </div>
              </Card>
            </div>

            {totalBad > 0 && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 inline-flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                {totalBad} cron job{totalBad === 1 ? '' : 's'} need attention.
                Check Railway / GitHub Actions schedule.
              </div>
            )}

            <div className="space-y-2">
              {data.crons.map((c) => (
                <Card key={c.name} className="p-4">
                  <header className="flex items-start justify-between gap-2 flex-wrap mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.description}</div>
                    </div>
                    <div className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
                      c.staleness_band === 'fresh'
                        ? 'bg-emerald-50 text-emerald-700'
                        : c.staleness_band === 'overdue'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700',
                    )}>
                      {c.staleness_band === 'fresh' ? <CheckCircle2 className="w-3 h-3" />
                        : c.staleness_band === 'overdue' ? <AlertTriangle className="w-3 h-3" />
                        : <XCircle className="w-3 h-3" />}
                      {c.staleness_band}
                    </div>
                  </header>
                  <div className="text-[11px] text-muted-foreground space-x-2">
                    <span>Cadence: every {c.cadence_hours}h</span>
                    <span>Last: {timeAgo(c.last_run_at)}</span>
                    {c.last_duration_ms != null && <span>({c.last_duration_ms}ms)</span>}
                    {c.last_success === false && (
                      <span className="text-rose-700 font-semibold">FAILED</span>
                    )}
                  </div>
                  {c.last_summary && (
                    <div className="mt-1 text-[11px] text-muted-foreground border-t border-border pt-1.5 break-all">
                      {c.last_summary}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}
