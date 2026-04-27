'use client';

/**
 * Admin AI Observability — health, throughput, latency, and anomalies
 * across every AI endpoint. Pulls /api/ai/observability and renders:
 *   - 24h summary tiles
 *   - Anomaly callouts (volume drops, latency spikes, low success rate)
 *   - 7-day daily volume trend
 *   - Per-endpoint table with p50/p95/p99 latency and success %
 *   - Top errors and recent failures
 *   - Heaviest AI users
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Activity, AlertTriangle, AlertCircle, TrendingDown, Clock4, RotateCcw, Loader2,
} from 'lucide-react';
import { AIHelpfulnessPanel } from '@/components/observability/AIHelpfulnessPanel';

interface EndpointStats {
  total: number;
  success: number;
  failures: number;
  tokens_in: number;
  tokens_out: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  latency_p99_ms: number | null;
  success_rate_pct: number | null;
}

interface DailyBucket {
  date: string;
  total: number;
  success: number;
  tokens_out: number;
}

interface ErrorBucket {
  error_code: string;
  count: number;
  sample_message: string | null;
}

interface RecentFailure {
  endpoint: string;
  user_id: number | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
}

interface TopUser {
  user_id: number;
  email?: string | null;
  role?: string | null;
  calls: number;
  tokens_out: number;
  failures: number;
}

interface Anomaly {
  endpoint: string;
  kind: 'volume_drop' | 'latency_spike' | 'low_success_rate';
  detail: string;
}

interface ObservabilityData {
  generated_at: string;
  summary_24h: {
    total_calls: number;
    success_rate_pct: number | null;
    failures: number;
    tokens_in: number;
    tokens_out: number;
  };
  by_endpoint: Record<string, EndpointStats>;
  daily_series_7d: DailyBucket[];
  top_errors_24h: ErrorBucket[];
  recent_failures: RecentFailure[];
  top_users_24h: TopUser[];
  anomalies: Anomaly[];
}

interface ObservabilityResp {
  ok: boolean;
  data?: ObservabilityData;
  message?: string;
}

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat().format(n);
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

export default function ObservabilityPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<ObservabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get<ObservabilityResp>('/ai/observability');
      if (res.ok && res.data) setData(res.data);
      else setError(res.message || 'Unknown error');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
        <Activity className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="kuja-display text-xl">Admin only</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="kuja-display text-3xl">{t('observability.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('observability.subtitle')}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {t('observability.refresh')}
        </button>
      </div>

      {loading && !data && (
        <div className="space-y-3">
          <div className="kuja-shimmer h-24 rounded-xl" />
          <div className="kuja-shimmer h-64 rounded-xl" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {t('observability.error')} — {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryTile label={t('observability.summary.total')} value={formatNum(data.summary_24h.total_calls)} />
            <SummaryTile
              label={t('observability.summary.success_rate')}
              value={data.summary_24h.success_rate_pct === null ? '—' : `${data.summary_24h.success_rate_pct}%`}
              tone={
                data.summary_24h.success_rate_pct === null ? undefined
                : data.summary_24h.success_rate_pct >= 95 ? 'success'
                : data.summary_24h.success_rate_pct >= 80 ? 'warn' : 'danger'
              }
            />
            <SummaryTile label={t('observability.summary.failures')} value={formatNum(data.summary_24h.failures)} tone={data.summary_24h.failures > 0 ? 'warn' : undefined} />
            <SummaryTile label={t('observability.summary.tokens_out')} value={formatNum(data.summary_24h.tokens_out)} />
          </div>

          {/* Anomalies callout */}
          <Section title={t('observability.anomalies')}>
            {data.anomalies.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('observability.anomalies_none')}</p>
            ) : (
              <ul className="space-y-2">
                {data.anomalies.map((a, i) => (
                  <li key={i} className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start justify-between gap-2 text-sm">
                    <AnomalyIcon kind={a.kind} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-amber-900">
                        {anomalyLabel(a.kind, t)} <span className="font-mono text-xs">{a.endpoint}</span>
                      </div>
                      <div className="text-xs text-amber-800 mt-0.5">{a.detail}</div>
                    </div>
                    <a
                      href={`#endpoint-${a.endpoint}`}
                      className="ml-auto text-[11px] font-medium text-amber-800 hover:underline whitespace-nowrap"
                    >
                      {t('observability.investigate')} →
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Daily volume trend */}
          <Section title={t('observability.daily_trend')}>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily_series_7d} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="total" fill="hsl(19, 82%, 41%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Per-endpoint */}
          <Section title={t('observability.endpoints')}>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('observability.col.endpoint')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.col.calls')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.col.success')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.col.p50')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.col.p95')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.col.p99')}</th>
                    <th className="px-3 py-2 text-right">{t('observability.col.tokens')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.by_endpoint).sort((a, b) => b[1].total - a[1].total).map(([ep, s]) => {
                    const succCls = s.success_rate_pct === null ? '' : s.success_rate_pct >= 95 ? 'text-emerald-700' : s.success_rate_pct >= 80 ? 'text-amber-700' : 'text-red-700';
                    return (
                      <tr key={ep} id={`endpoint-${ep}`} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{ep}</td>
                        <td className="px-3 py-2 text-right kuja-numeric">{formatNum(s.total)}</td>
                        <td className={`px-3 py-2 text-right kuja-numeric font-semibold ${succCls}`}>
                          {s.success_rate_pct === null ? '—' : `${s.success_rate_pct}%`}
                        </td>
                        <td className="px-3 py-2 text-right kuja-numeric text-muted-foreground">{s.latency_p50_ms === null ? '—' : `${s.latency_p50_ms}ms`}</td>
                        <td className="px-3 py-2 text-right kuja-numeric text-muted-foreground">{s.latency_p95_ms === null ? '—' : `${s.latency_p95_ms}ms`}</td>
                        <td className="px-3 py-2 text-right kuja-numeric text-muted-foreground">{s.latency_p99_ms === null ? '—' : `${s.latency_p99_ms}ms`}</td>
                        <td className="px-3 py-2 text-right kuja-numeric text-muted-foreground">{formatNum(s.tokens_out)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {Object.keys(data.by_endpoint).length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">—</div>
              )}
            </div>
          </Section>

          {/* Top errors + Recent failures + Top users in 3-up */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={t('observability.top_errors')}>
              {data.top_errors_24h.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('observability.no_errors')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.top_errors_24h.map((e, i) => (
                    <li key={i} className="rounded-md border border-border bg-background/50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">{e.error_code}</span>
                        <span className="kuja-numeric text-xs text-red-700">×{e.count}</span>
                      </div>
                      {e.sample_message && (
                        <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{e.sample_message}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={t('observability.recent_failures')}>
              {data.recent_failures.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('observability.no_failures')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.recent_failures.slice(0, 8).map((f, i) => (
                    <li key={i} className="rounded-md border border-border bg-background/50 p-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono">{f.endpoint}</span>
                        <span className="text-muted-foreground">{formatRelative(f.created_at)}</span>
                      </div>
                      {f.error_code && (
                        <div className="text-[11px] text-red-700 mt-0.5 font-mono">{f.error_code}</div>
                      )}
                      {f.error_message && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{f.error_message}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <AIHelpfulnessPanel hours={24} />

          <Section title={t('observability.top_users')}>
            {data.top_users_24h.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('observability.no_users')}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('observability.col.user')}</th>
                      <th className="px-3 py-2 text-left">{t('observability.col.role')}</th>
                      <th className="px-3 py-2 text-right">{t('observability.col.calls')}</th>
                      <th className="px-3 py-2 text-right">{t('observability.col.user_failures')}</th>
                      <th className="px-3 py-2 text-right">{t('observability.col.tokens')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_users_24h.map((u) => (
                      <tr key={u.user_id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs truncate max-w-[280px]" title={u.email ?? `#${u.user_id}`}>{u.email ?? `#${u.user_id}`}</td>
                        <td className="px-3 py-2 text-xs">{u.role ?? '—'}</td>
                        <td className="px-3 py-2 text-right kuja-numeric">{formatNum(u.calls)}</td>
                        <td className={cn('px-3 py-2 text-right kuja-numeric', u.failures > 0 && 'text-red-700')}>{formatNum(u.failures)}</td>
                        <td className="px-3 py-2 text-right kuja-numeric text-muted-foreground">{formatNum(u.tokens_out)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function SummaryTile({
  label, value, tone,
}: { label: string; value: string; tone?: 'success' | 'warn' | 'danger' }) {
  const cls = tone === 'success' ? 'text-[hsl(var(--kuja-grow))]'
    : tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]'
    : tone === 'danger' ? 'text-[hsl(var(--kuja-flag))]'
    : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className={cn('kuja-numeric text-2xl font-semibold', cls)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function AnomalyIcon({ kind }: { kind: Anomaly['kind'] }) {
  if (kind === 'volume_drop') return <TrendingDown className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />;
  if (kind === 'latency_spike') return <Clock4 className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />;
  return <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />;
}

function anomalyLabel(kind: Anomaly['kind'], t: (k: string) => string): string {
  if (kind === 'volume_drop') return t('observability.anomaly.volume_drop');
  if (kind === 'latency_spike') return t('observability.anomaly.latency_spike');
  return t('observability.anomaly.low_success_rate');
}
