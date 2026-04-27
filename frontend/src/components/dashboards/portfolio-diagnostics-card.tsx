'use client';

/**
 * PortfolioDiagnosticsCard — Phase 2.3
 *
 * Donor-facing rollup of cross-grant patterns. Surfaces three layers:
 *   - aggregate KPIs (grants, submissions, awarded, avg AI score)
 *   - per-grant rollups in a compact table
 *   - anomalies with concrete fix-it action language
 *
 * Renders on the donor dashboard. Lives behind no flag — purely
 * read-only, no AI cost, derived from existing application records.
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle, Target, TrendingDown, TrendingUp, BarChart3, Loader2,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import { fetchPortfolioDiagnostics, type PortfolioDiagnostics } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

const ANOMALY_ICON: Record<string, typeof AlertTriangle> = {
  low_interest: TrendingDown,
  low_discrimination: BarChart3,
  criteria_too_easy: Target,
  high_decline: AlertTriangle,
};

const ANOMALY_TONE: Record<string, string> = {
  low_interest: 'border-amber-200 bg-amber-50 text-amber-900',
  low_discrimination: 'border-amber-200 bg-amber-50 text-amber-900',
  criteria_too_easy: 'border-sky-200 bg-sky-50 text-sky-900',
  high_decline: 'border-rose-200 bg-rose-50 text-rose-900',
};

interface Props {
  className?: string;
}

export function PortfolioDiagnosticsCard({ className = '' }: Props) {
  const { t } = useTranslation();
  const formatError = useApiError();
  const [data, setData] = useState<PortfolioDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPortfolioDiagnostics()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setData(res.data);
        else setErrorMsg(res.message);
      })
      .catch((e) => {
        if (!cancelled) setErrorMsg(formatError(e).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('rounded-[12px] border border-border bg-card p-5', className)}>
      <div className="mb-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />
          {t('portfolio.heading')}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('portfolio.subtitle')}</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('portfolio.loading')}
        </div>
      )}

      {!loading && errorMsg && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Aggregate row */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label={t('portfolio.metric.grants')}
              value={String(data.aggregate.total_grants)}
            />
            <Tile
              label={t('portfolio.metric.submissions')}
              value={String(data.aggregate.total_submissions)}
            />
            <Tile
              label={t('portfolio.metric.awarded')}
              value={String(data.aggregate.total_awarded)}
              tone={data.aggregate.total_awarded > 0 ? 'success' : 'neutral'}
            />
            <Tile
              label={t('portfolio.metric.avg_ai_score')}
              value={data.aggregate.avg_ai_score_pct != null
                ? `${data.aggregate.avg_ai_score_pct}%`
                : '—'}
            />
          </div>

          {/* Anomalies — donor's biggest leverage */}
          {data.anomalies.length > 0 && (
            <div className="mb-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('portfolio.anomalies_label', { n: data.anomalies.length })}
              </div>
              <ul className="space-y-1.5">
                {data.anomalies.slice(0, 5).map((a, i) => {
                  const Icon = ANOMALY_ICON[a.kind] || AlertTriangle;
                  const tone = ANOMALY_TONE[a.kind] || ANOMALY_TONE.low_interest;
                  return (
                    <li key={i} className={cn('flex items-start gap-2 rounded-md border p-2', tone)}>
                      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{a.title}</div>
                        <div className="mt-0.5 text-[11px]">
                          {t(a.detail_key, {
                            n: a.submissions ?? 0,
                            spread: a.spread ?? 0,
                            avg: a.avg_score ?? 0,
                            pct: a.decline_rate_pct ?? 0,
                          })}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Per-grant table (compact) */}
          {data.per_grant.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                {t('portfolio.per_grant_label', { n: data.per_grant.length })}
              </summary>
              <div className="mt-2 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('portfolio.col.grant')}</th>
                      <th className="px-3 py-2 text-right">{t('portfolio.col.submissions')}</th>
                      <th className="px-3 py-2 text-right">{t('portfolio.col.awarded')}</th>
                      <th className="px-3 py-2 text-right">{t('portfolio.col.avg_score')}</th>
                      <th className="px-3 py-2 text-right">{t('portfolio.col.spread')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.per_grant.map((g) => (
                      <tr key={g.grant_id} className="border-t border-border">
                        <td className="px-3 py-2 truncate max-w-[220px]" title={g.title}>{g.title}</td>
                        <td className="px-3 py-2 text-right kuja-numeric">{g.submissions}</td>
                        <td className="px-3 py-2 text-right kuja-numeric text-emerald-700">{g.awarded}</td>
                        <td className="px-3 py-2 text-right kuja-numeric text-muted-foreground">
                          {g.avg_ai_score != null ? `${g.avg_ai_score}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right kuja-numeric text-muted-foreground">
                          {g.score_spread != null ? `±${g.score_spread}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'neutral' }) {
  const cls = tone === 'success' ? 'text-emerald-700' : 'text-foreground';
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className={cn('kuja-numeric text-xl font-semibold', cls)}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
