'use client';

/**
 * PortfolioRiskHeatmap — Phase 23B (May 2026).
 *
 * Sector × country grid where each cell is colored by aggregated risk
 * concentration on a donor's portfolio. Helps donors see instantly:
 * "where am I exposed?" without trawling individual grant pages.
 *
 * Cells with score 0 stay neutral (no concentration). Score 1-30 = soft
 * (just grants present). 31-74 = warn (flagged apps). 75+ = critical
 * (open risks or overdue reports).
 */

import { useEffect, useState } from 'react';
import { Grid3X3, AlertTriangle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface HeatmapCell {
  sector: string;
  country: string;
  n_grants: number;
  n_open_risks: number;
  n_overdue_reports: number;
  n_flagged_apps: number;
  risk_score: number;
}

interface HeatmapResp {
  success: boolean;
  sectors: string[];
  countries: string[];
  cells: HeatmapCell[];
  total_grants: number;
  axis_truncated?: boolean;
}

function cellClass(score: number, hasGrants: boolean): string {
  if (!hasGrants) return 'bg-[hsl(var(--kuja-sand))]/20 text-muted-foreground';
  if (score >= 75) return 'bg-[hsl(var(--kuja-flag))]/30 text-[hsl(var(--kuja-flag))] font-semibold border-[hsl(var(--kuja-flag))]/40';
  if (score >= 30) return 'bg-[hsl(var(--kuja-sun))]/20 text-[hsl(var(--kuja-sun))] font-medium';
  return 'bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]';
}

export function PortfolioRiskHeatmap() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<HeatmapResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'donor') return;
    let cancelled = false;
    api.get<HeatmapResp>('/api/dashboard/portfolio-risk-heatmap')
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user || user.role !== 'donor') return null;

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading risk heatmap…
        </div>
      </Card>
    );
  }
  if (!data || !data.success || data.total_grants === 0) return null;

  const cellsByKey: Record<string, HeatmapCell> = {};
  for (const c of data.cells) cellsByKey[`${c.sector}|${c.country}`] = c;

  const totalRisks = data.cells.reduce((s, c) => s + c.n_open_risks, 0);
  const totalOverdue = data.cells.reduce((s, c) => s + c.n_overdue_reports, 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2 flex-wrap">
        <Grid3X3 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Risk heatmap
          </div>
          <h3 className="kuja-display text-lg">Where you&apos;re exposed</h3>
          <p className="text-xs text-muted-foreground">
            Sector × country concentration with open risks + overdue reports overlaid.
          </p>
        </div>
        {(totalRisks > 0 || totalOverdue > 0) && (
          <Badge variant="outline" className="text-[10px] text-[hsl(var(--kuja-flag))] border-[hsl(var(--kuja-flag))]">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {totalRisks} risk{totalRisks === 1 ? '' : 's'} · {totalOverdue} overdue
          </Badge>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th className="text-[10px] uppercase tracking-wide text-muted-foreground text-left p-1 sticky left-0 bg-background">
                Sector ↓ / Country →
              </th>
              {data.countries.map((c) => (
                <th
                  key={c}
                  className="text-[10px] uppercase tracking-wide text-muted-foreground p-1 text-center min-w-[60px]"
                  title={c}
                >
                  <span className="block truncate max-w-[80px] mx-auto">{c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.sectors.map((s) => (
              <tr key={s}>
                <td
                  className="text-[10px] font-semibold text-foreground p-1 sticky left-0 bg-background text-left max-w-[180px]"
                  title={s}
                >
                  <span className="block truncate">{s}</span>
                </td>
                {data.countries.map((c) => {
                  const cell = cellsByKey[`${s}|${c}`];
                  if (!cell) {
                    return (
                      <td key={c} className="p-1">
                        <div className="rounded h-9 bg-[hsl(var(--kuja-sand))]/10" />
                      </td>
                    );
                  }
                  const has = cell.n_grants > 0;
                  return (
                    <td key={c} className="p-1">
                      <div
                        className={cn(
                          'rounded h-9 flex items-center justify-center border border-transparent text-xs tabular-nums',
                          cellClass(cell.risk_score, has),
                        )}
                        title={
                          has
                            ? `${cell.n_grants} grant${cell.n_grants === 1 ? '' : 's'} · `
                              + `${cell.n_open_risks} risk${cell.n_open_risks === 1 ? '' : 's'} · `
                              + `${cell.n_overdue_reports} overdue · `
                              + `score ${cell.risk_score}/100`
                            : 'No grants'
                        }
                      >
                        {has ? cell.n_grants : '·'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-[hsl(var(--kuja-grow))]/20" />
          Healthy
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-[hsl(var(--kuja-sun))]/30" />
          Warn (flagged apps)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-[hsl(var(--kuja-flag))]/40" />
          Critical (open risks/overdue)
        </span>
        {data.axis_truncated && (
          <span className="ml-auto italic">
            Top {data.sectors.length} sectors × {data.countries.length} countries shown
          </span>
        )}
      </div>
    </Card>
  );
}
