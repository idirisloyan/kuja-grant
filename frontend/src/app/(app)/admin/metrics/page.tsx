'use client';

/**
 * /admin/metrics — Phase 29D (May 2026).
 *
 * Real-user behavioural metrics dashboard. Reads /api/admin/metrics
 * (powered by the UserEvent table) and surfaces:
 *
 *   - DAU / WAU / MAU with role + language breakdowns
 *   - Top event counts (last 30 days)
 *   - 5 critical funnels with drop-off rates
 *   - Chat + search adoption by language (parity signal)
 *   - A/B outcome split (empty until experiments are wired)
 *
 * Sparse-honest: when a metric has zero events, the card shows an
 * empty state explaining "no data yet" rather than pretending.
 */

import { useEffect, useState } from 'react';
import { Loader2, Users, Globe2, BarChart3, ArrowRight, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';
import { useTranslation } from '@/lib/hooks/use-translation';

interface ActiveUsers {
  window_days: number;
  total: number;
  by_role: Record<string, number>;
  by_language: Record<string, number>;
}

interface EventCount { event_name: string; count: number }

interface FunnelStage {
  event_name: string;
  unique_users: number;
  rate_vs_base_pct: number;
}

interface Funnel { window_days: number; stages: FunnelStage[] }

interface LangBreakdown {
  event_name: string;
  window_days: number;
  by_language: Record<string, number>;
}

interface AbOutcome {
  outcome_event: string;
  window_days: number;
  by_arm: Record<string, number>;
}

interface NpsBySurface {
  surface: string;
  responses: number;
  nps: number;
  avg_score: number;
}

interface NpsSummary {
  window_days: number;
  total_responses: number;
  overall_nps: number | null;
  promoters?: number;
  passives?: number;
  detractors?: number;
  by_surface: NpsBySurface[];
  by_language: Record<string, { responses: number; nps: number }>;
  histogram: Record<string, number>;
}

interface NpsComment {
  surface: string;
  score: number;
  bucket: 'promoter' | 'passive' | 'detractor';
  comment: string;
  language?: string | null;
  role?: string | null;
  created_at?: string | null;
}

interface MetricsResp {
  success: boolean;
  dau: ActiveUsers;
  wau: ActiveUsers;
  mau: ActiveUsers;
  event_counts_30d: EventCount[];
  funnels: {
    chat: Funnel; application: Funnel; report: Funnel;
    review?: Funnel; readiness_to_submit?: Funnel; preflight_to_submit?: Funnel;
  };
  chat_by_language: LangBreakdown;
  search_by_language: LangBreakdown;
  readiness_by_language?: LangBreakdown;
  preflight_by_language?: LangBreakdown;
  ab_application_submit: AbOutcome;
  nps?: NpsSummary;
  nps_recent_comments?: NpsComment[];
}

function StatTile({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-md border border-[hsl(var(--border))] p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function BreakdownChips({ map }: { map: Record<string, number> }) {
  const { t } = useTranslation();
  const entries = Object.entries(map ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground">{t('admin_metrics.no_data_yet')}</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k}
              className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--kuja-sand))]/30 px-2 py-0.5 text-xs">
          <span className="font-medium">{k}</span>
          <span className="tabular-nums text-muted-foreground">{v}</span>
        </span>
      ))}
    </div>
  );
}

function FunnelView({ title, funnel }: { title: string; funnel: Funnel }) {
  const { t } = useTranslation();
  const stages = funnel?.stages ?? [];
  if (stages.length === 0 || stages.every((s) => s.unique_users === 0)) {
    return (
      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-[hsl(var(--kuja-clay))] font-semibold mb-1">{title}</div>
        <div className="text-xs text-muted-foreground">{t('admin_metrics.funnel_empty')}</div>
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-[hsl(var(--kuja-clay))] font-semibold mb-2">{title}</div>
      <div className="space-y-2">
        {stages.map((s, i) => (
          <div key={s.event_name} className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium truncate flex-1">{s.event_name}</span>
              <span className="tabular-nums">{s.unique_users}</span>
              {i > 0 && (
                <span className="text-muted-foreground tabular-nums">
                  ({s.rate_vs_base_pct}%)
                </span>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-[hsl(var(--kuja-sand))]/30 overflow-hidden">
              <div className="h-full bg-[hsl(var(--kuja-clay))]"
                   style={{ width: `${Math.min(100, s.rate_vs_base_pct)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AdminMetricsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<MetricsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    let cancelled = false;
    setLoading(true);
    api.get<MetricsResp>('/api/admin/metrics')
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setErr((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;
  if (user.role !== 'admin') {
    return (
      <Card className="p-6 max-w-md mx-auto mt-12">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-[hsl(var(--kuja-flag))] mt-0.5" />
          <div className="text-sm">{t('admin_metrics.admin_access_required')}</div>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('admin_metrics.loading_metrics')}
      </div>
    );
  }

  if (err || !data) {
    return (
      <Card className="p-6 max-w-md mx-auto mt-12 border-[hsl(var(--kuja-flag)/0.3)]">
        <div className="text-sm">{err ? t('admin_metrics.could_not_load_metrics_err', { err }) : t('admin_metrics.could_not_load_metrics')}</div>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageShell>
        <PageHeader
          title={t('admin_metrics.page_title')}
          icon={BarChart3}
          subtitle={t('admin_metrics.page_subtitle')}
        />
        <PageMain>
      {/* Active users */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-3">
          <Users className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">{t('admin_metrics.active_users')}</div>
            <h2 className="kuja-display text-lg">{t('admin_metrics.active_users_heading')}</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          <StatTile label={t('admin_metrics.dau_label')} value={data.dau.total} />
          <StatTile label={t('admin_metrics.wau_label')} value={data.wau.total} />
          <StatTile label={t('admin_metrics.mau_label')} value={data.mau.total} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('admin_metrics.wau_by_role')}</div>
            <BreakdownChips map={data.wau.by_role} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('admin_metrics.wau_by_language')}</div>
            <BreakdownChips map={data.wau.by_language} />
          </div>
        </div>
      </Card>

      {/* Funnels */}
      <div>
        <div className="flex items-start gap-2 mb-2">
          <ArrowRight className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">{t('admin_metrics.critical_funnels')}</div>
            <h2 className="kuja-display text-lg">{t('admin_metrics.where_users_drop_off')}</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FunnelView title={t('admin_metrics.funnel_chat')} funnel={data.funnels.chat} />
          <FunnelView title={t('admin_metrics.funnel_application')} funnel={data.funnels.application} />
          <FunnelView title={t('admin_metrics.funnel_report')} funnel={data.funnels.report} />
          {data.funnels.review && (
            <FunnelView title={t('admin_metrics.funnel_review')} funnel={data.funnels.review} />
          )}
          {data.funnels.readiness_to_submit && (
            <FunnelView title={t('admin_metrics.funnel_readiness')} funnel={data.funnels.readiness_to_submit} />
          )}
          {data.funnels.preflight_to_submit && (
            <FunnelView title={t('admin_metrics.funnel_preflight')} funnel={data.funnels.preflight_to_submit} />
          )}
        </div>
      </div>

      {/* NPS micro-survey results */}
      {data.nps && (
        <Card className="p-4 sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">{t('admin_metrics.nps_feedback')}</div>
          <h2 className="kuja-display text-lg mb-2">{t('admin_metrics.nps_heading')}</h2>
          {data.nps.total_responses === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('admin_metrics.nps_empty')}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <StatTile label={t('admin_metrics.nps_score_label')} value={data.nps.overall_nps ?? '—'} />
                <StatTile label={t('admin_metrics.responses')} value={data.nps.total_responses} sub={t('admin_metrics.last_n_days', { n: data.nps.window_days })} />
                <StatTile label={t('admin_metrics.promoters_label')} value={data.nps.promoters ?? 0} />
                <StatTile label={t('admin_metrics.detractors_label')} value={data.nps.detractors ?? 0} />
              </div>
              {data.nps.by_surface.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('admin_metrics.by_surface')}</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-[hsl(var(--border))]">
                        <th className="py-1">{t('admin_metrics.col_surface')}</th>
                        <th className="py-1 text-right">{t('admin_metrics.responses')}</th>
                        <th className="py-1 text-right">{t('admin_metrics.col_nps')}</th>
                        <th className="py-1 text-right">{t('admin_metrics.col_avg_score')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.nps.by_surface.map((r) => (
                        <tr key={r.surface} className="border-b border-[hsl(var(--border))]/40">
                          <td className="py-1.5 font-mono">{r.surface}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.responses}</td>
                          <td className="py-1.5 text-right tabular-nums font-semibold">{r.nps}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.avg_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {Object.keys(data.nps.by_language).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('admin_metrics.nps_by_language')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(data.nps.by_language).map(([lang, v]) => (
                      <span key={lang}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--kuja-sand))]/30 px-2 py-0.5 text-xs">
                        <span className="font-medium">{lang}</span>
                        <span className="text-muted-foreground">{t('admin_metrics.nps_value', { n: v.nps })}</span>
                        <span className="text-muted-foreground">{t('admin_metrics.n_count', { n: v.responses })}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {data.nps_recent_comments && data.nps_recent_comments.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('admin_metrics.recent_comments')}</div>
                  <div className="space-y-1.5">
                    {data.nps_recent_comments.map((c, i) => (
                      <div key={i} className="text-xs border-l-2 border-[hsl(var(--kuja-clay))] pl-2">
                        <span className="font-medium">[{c.score}] </span>
                        <span className="text-muted-foreground">{c.surface} · {c.role ?? t('admin_metrics.unknown')} · {c.language ?? '?'}</span>
                        <div>{c.comment}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Language parity */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-3">
          <Globe2 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">{t('admin_metrics.language_parity')}</div>
            <h2 className="kuja-display text-lg">{t('admin_metrics.parity_heading')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('admin_metrics.parity_desc')}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              {t('admin_metrics.chat_senders_by_language')}
            </div>
            <BreakdownChips map={data.chat_by_language.by_language} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              {t('admin_metrics.search_users_by_language')}
            </div>
            <BreakdownChips map={data.search_by_language.by_language} />
          </div>
        </div>
      </Card>

      {/* Event counts */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-3">
          <BarChart3 className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">{t('admin_metrics.event_volume')}</div>
            <h2 className="kuja-display text-lg">{t('admin_metrics.event_volume_heading')}</h2>
          </div>
        </div>
        {data.event_counts_30d.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t('admin_metrics.events_empty')}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-[hsl(var(--border))]">
                <th className="py-2">{t('admin_metrics.col_event')}</th>
                <th className="py-2 text-right">{t('admin_metrics.col_count')}</th>
              </tr>
            </thead>
            <tbody>
              {data.event_counts_30d.map((e) => (
                <tr key={e.event_name} className="border-b border-[hsl(var(--border))]/40">
                  <td className="py-1.5 font-mono">{e.event_name}</td>
                  <td className="py-1.5 text-right tabular-nums">{e.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* A/B outcomes */}
      <Card className="p-4 sm:p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">{t('admin_metrics.ab_experiments')}</div>
        <h2 className="kuja-display text-lg mb-2">{t('admin_metrics.ab_heading')}</h2>
        {Object.keys(data.ab_application_submit.by_arm).length === 0 ? (
          <div className="text-xs text-muted-foreground">{t('admin_metrics.ab_empty')}</div>
        ) : (
          <BreakdownChips map={data.ab_application_submit.by_arm} />
        )}
      </Card>
        </PageMain>
      </PageShell>
    </div>
  );
}
