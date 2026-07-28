'use client';

/**
 * Phase 97 — Admin AI telemetry rollup.
 *
 * Shows real-world AI call statistics so the team can see which
 * features fail in production and where the next fallback investment
 * should go (Whisper for which languages? More compliance explainers?
 * Better prompt for which surface?).
 *
 * Until we have this data, every "how reliable is X" question is
 * anecdotal. Now it's measurable.
 */

import { useState } from 'react';
import useSWR from 'swr';
import {
  PageShell, PageBack, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { Activity, AlertTriangle, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';

interface ByEndpoint {
  endpoint: string;
  calls: number;
  failures: number;
  failure_rate_pct: number;
  current_calls?: number;
  current_failures?: number;
  current_failure_rate_pct?: number;
  stale_failures?: number;
  p50_ms: number | null;
  p95_ms: number | null;
  total_tokens_out: number;
}

interface RecentFailure {
  endpoint: string;
  error_code: string | null;
  error_message: string;
  duration_ms: number | null;
  model?: string | null;
  is_stale_model?: boolean;
  created_at: string | null;
}

interface TelemetryResp {
  success: boolean;
  window_hours: number;
  total_calls: number;
  total_failures: number;
  failure_rate_pct: number;
  current_calls?: number;
  current_failures?: number;
  current_failure_rate_pct?: number;
  stale_failures?: number;
  current_models?: string[];
  by_endpoint: ByEndpoint[];
  recent_failures: RecentFailure[];
}

const WINDOW_OPTIONS = [
  { hours: 24,  labelKey: 'ai_telemetry.window_24h' },
  { hours: 72,  labelKey: 'ai_telemetry.window_3d' },
  { hours: 168, labelKey: 'ai_telemetry.window_7d' },
  { hours: 720, labelKey: 'ai_telemetry.window_30d' },
];

export default function AdminAiTelemetryPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [hours, setHours] = useState(168);
  const isAdmin = !user || user.role === 'admin';

  // useSWR call must be unconditional — non-admins pass `null` as the key
  // so SWR skips the fetch. Hooks order stays consistent.
  const { data, isLoading } = useSWR<TelemetryResp>(
    isAdmin ? `/admin/ai-telemetry?hours=${hours}` : null,
    (url: string) => api.get<TelemetryResp>(url),
  );

  // Non-admins see a "not for you" shell rather than the empty page they
  // would otherwise hit when the API responds 403.
  if (user && user.role !== 'admin') {
    return (
      <PageShell>
        <PageHeader title={t('ai_telemetry.title')} icon={Activity} subtitle="" />
        <PageMain>
          <div className="border border-border rounded-lg bg-card p-6 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-[hsl(var(--kuja-clay))] mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold mb-1">{t('ai_telemetry.admin_only_title')}</div>
              <div className="text-muted-foreground">
                {t('ai_telemetry.admin_only_body')}
              </div>
            </div>
          </div>
        </PageMain>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageBack href="/admin/security" label={t('ai_telemetry.back_to_admin')} />
      <PageHeader
        title={t('ai_telemetry.title')}
        icon={Activity}
        subtitle={t('ai_telemetry.subtitle')}
      />

      <PageMain>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.hours}
              type="button"
              onClick={() => setHours(o.hours)}
              className={
                'px-2.5 py-1 rounded-full border text-[11px] ' +
                (o.hours === hours
                  ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))] font-semibold'
                  : 'border-border text-muted-foreground hover:text-foreground')
              }
            >
              {t(o.labelKey)}
            </button>
          ))}
        </div>

        {isLoading && <div className="kuja-shimmer h-32 rounded-lg" />}

        {data && data.success && (
          <>
            {/* Top-line summary — Phase 611: split "live" (current model)
                from "stale" (deprecated model) so historical 404s from
                retired model IDs don't muddy today's SLA. */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label={t('ai_telemetry.stat_total_calls')} value={data.total_calls.toLocaleString()} />
              <Stat
                label={t('ai_telemetry.stat_all_failures')}
                value={data.total_failures.toLocaleString()}
                tone={data.failure_rate_pct >= 10 ? 'bad' : data.failure_rate_pct >= 3 ? 'warn' : 'good'}
              />
              {typeof data.current_failure_rate_pct === 'number' ? (
                <Stat
                  label={t('ai_telemetry.stat_live_failure_rate')}
                  value={`${data.current_failure_rate_pct.toFixed(1)}%`}
                  tone={
                    data.current_failure_rate_pct >= 10 ? 'bad' :
                    data.current_failure_rate_pct >= 3 ? 'warn' : 'good'
                  }
                />
              ) : (
                <Stat
                  label={t('ai_telemetry.stat_failure_rate')}
                  value={`${data.failure_rate_pct.toFixed(1)}%`}
                  tone={data.failure_rate_pct >= 10 ? 'bad' : data.failure_rate_pct >= 3 ? 'warn' : 'good'}
                />
              )}
              {typeof data.stale_failures === 'number' && (
                <Stat
                  label={t('ai_telemetry.stat_stale_failures')}
                  value={data.stale_failures.toLocaleString()}
                  tone="muted"
                />
              )}
            </section>
            {typeof data.current_failure_rate_pct === 'number' && data.stale_failures !== undefined && data.stale_failures > 0 && (
              <p className="text-[11px] text-muted-foreground -mt-1">
                {t(
                  data.stale_failures === 1 ? 'ai_telemetry.stale_note_one' : 'ai_telemetry.stale_note_many',
                  { n: data.stale_failures.toLocaleString() },
                )}{' '}
                {t('ai_telemetry.current_models_label')}{' '}
                <span className="font-mono">{(data.current_models ?? []).join(', ')}</span>.
              </p>
            )}

            {/* Per-endpoint rollup */}
            <section className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <h2 className="text-sm font-semibold">{t('ai_telemetry.by_endpoint_heading')}</h2>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-muted/30">
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    <th className="text-left px-3 py-2">{t('ai_telemetry.col_endpoint')}</th>
                    <th className="text-right px-3 py-2">{t('ai_telemetry.col_calls')}</th>
                    <th className="text-right px-3 py-2">{t('ai_telemetry.col_failures')}</th>
                    <th className="text-right px-3 py-2">{t('ai_telemetry.col_fail_pct')}</th>
                    <th className="text-right px-3 py-2">p50</th>
                    <th className="text-right px-3 py-2">p95</th>
                    <th className="text-right px-3 py-2">{t('ai_telemetry.col_tokens_out')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_endpoint.map((e) => {
                    const tone =
                      e.failure_rate_pct >= 10 ? 'text-destructive font-semibold' :
                      e.failure_rate_pct >= 3 ? 'text-[hsl(var(--kuja-sun))]' : '';
                    return (
                      <tr key={e.endpoint} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-[11px] truncate max-w-[260px]" title={e.endpoint}>
                          {e.endpoint}
                        </td>
                        <td className="px-3 py-2 text-right kuja-numeric">{e.calls}</td>
                        <td className="px-3 py-2 text-right kuja-numeric">{e.failures}</td>
                        <td className={`px-3 py-2 text-right kuja-numeric ${tone}`}>{e.failure_rate_pct.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right kuja-numeric">{e.p50_ms ?? '—'}</td>
                        <td className="px-3 py-2 text-right kuja-numeric">{e.p95_ms ?? '—'}</td>
                        <td className="px-3 py-2 text-right kuja-numeric">{e.total_tokens_out.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {data.by_endpoint.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground italic">
                        {t('ai_telemetry.empty_no_calls')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            {/* Recent failures */}
            {data.recent_failures.length > 0 && (
              <section className="border border-destructive/30 bg-destructive/5 rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-destructive/30 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <h2 className="text-sm font-semibold">{t('ai_telemetry.recent_failures_heading')}</h2>
                </div>
                <ul className="divide-y divide-border">
                  {data.recent_failures.map((f, i) => (
                    <li key={i} className="px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] flex items-center gap-1.5">
                          {f.endpoint}
                          {f.is_stale_model && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide bg-muted text-muted-foreground border border-border"
                              title={t('ai_telemetry.stale_model_tooltip', { model: f.model ?? '' })}
                            >
                              {t('ai_telemetry.stale_model_badge')}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {f.created_at ? new Date(f.created_at).toLocaleString() : '—'}
                        </span>
                      </div>
                      {(f.error_code || f.model) && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {f.error_code && <>{t('ai_telemetry.label_code')} {f.error_code}</>}
                          {f.error_code && f.model && <> · </>}
                          {f.model && <>{t('ai_telemetry.label_model')} <span className="font-mono">{f.model}</span></>}
                        </div>
                      )}
                      {f.error_message && (
                        <div className="mt-0.5 text-foreground/80 leading-relaxed">{f.error_message}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </PageMain>
    </PageShell>
  );
}

function Stat({ label, value, tone = 'muted' }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'muted' }) {
  const cls =
    tone === 'good' ? 'border-[hsl(var(--kuja-grow))]/40 bg-[hsl(var(--kuja-grow))]/5 text-[hsl(var(--kuja-grow))]' :
    tone === 'warn' ? 'border-[hsl(var(--kuja-sun))]/40 bg-[hsl(var(--kuja-sun))]/5 text-[hsl(var(--kuja-sun))]' :
    tone === 'bad'  ? 'border-destructive/40 bg-destructive/5 text-destructive' :
                       'border-border';
  return (
    <div className={`border rounded-md p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70 font-semibold">{label}</div>
      <div className="font-semibold text-2xl mt-0.5 kuja-numeric">{value}</div>
    </div>
  );
}
