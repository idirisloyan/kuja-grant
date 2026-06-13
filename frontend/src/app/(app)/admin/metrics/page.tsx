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
  const entries = Object.entries(map ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground">No data yet.</div>;
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
  const stages = funnel?.stages ?? [];
  if (stages.length === 0 || stages.every((s) => s.unique_users === 0)) {
    return (
      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-[hsl(var(--kuja-clay))] font-semibold mb-1">{title}</div>
        <div className="text-xs text-muted-foreground">No funnel data yet. Events will appear as users exercise this flow.</div>
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
          <div className="text-sm">Admin access required.</div>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
      </div>
    );
  }

  if (err || !data) {
    return (
      <Card className="p-6 max-w-md mx-auto mt-12 border-[hsl(var(--kuja-flag)/0.3)]">
        <div className="text-sm">Could not load metrics{err ? ` — ${err}` : '.'}</div>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageShell>
        <PageHeader
          title="Real-user metrics"
          icon={BarChart3}
          subtitle="Behavioural events from the UserEvent table — funnels, language parity, A/B."
        />
        <PageMain>
      {/* Active users */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-2 mb-3">
          <Users className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">Active users</div>
            <h2 className="kuja-display text-lg">Who&apos;s actually using Kuja</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          <StatTile label="DAU (1 day)" value={data.dau.total} />
          <StatTile label="WAU (7 days)" value={data.wau.total} />
          <StatTile label="MAU (30 days)" value={data.mau.total} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">WAU by role</div>
            <BreakdownChips map={data.wau.by_role} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">WAU by language</div>
            <BreakdownChips map={data.wau.by_language} />
          </div>
        </div>
      </Card>

      {/* Funnels */}
      <div>
        <div className="flex items-start gap-2 mb-2">
          <ArrowRight className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">Critical funnels</div>
            <h2 className="kuja-display text-lg">Where users drop off</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FunnelView title="Chat: open → message sent" funnel={data.funnels.chat} />
          <FunnelView title="Application: draft → submit" funnel={data.funnels.application} />
          <FunnelView title="Report: draft → submit" funnel={data.funnels.report} />
          {data.funnels.review && (
            <FunnelView title="Review: assignment opened → submitted" funnel={data.funnels.review} />
          )}
          {data.funnels.readiness_to_submit && (
            <FunnelView title="Readiness check → app submit (causal-ish)" funnel={data.funnels.readiness_to_submit} />
          )}
          {data.funnels.preflight_to_submit && (
            <FunnelView title="Report pre-flight → submit (causal-ish)" funnel={data.funnels.preflight_to_submit} />
          )}
        </div>
      </div>

      {/* NPS micro-survey results */}
      {data.nps && (
        <Card className="p-4 sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">NPS feedback</div>
          <h2 className="kuja-display text-lg mb-2">Did Kuja help? (1-question micro-survey)</h2>
          {data.nps.total_responses === 0 ? (
            <p className="text-xs text-muted-foreground">
              No survey responses yet. The micro-survey fires after application + report
              submits — first answers will appear here within hours of real submits.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <StatTile label="NPS (-100…+100)" value={data.nps.overall_nps ?? '—'} />
                <StatTile label="Responses" value={data.nps.total_responses} sub={`last ${data.nps.window_days}d`} />
                <StatTile label="Promoters (9-10)" value={data.nps.promoters ?? 0} />
                <StatTile label="Detractors (0-6)" value={data.nps.detractors ?? 0} />
              </div>
              {data.nps.by_surface.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">By surface</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-[hsl(var(--border))]">
                        <th className="py-1">Surface</th>
                        <th className="py-1 text-right">Responses</th>
                        <th className="py-1 text-right">NPS</th>
                        <th className="py-1 text-right">Avg score</th>
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
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">NPS by language</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(data.nps.by_language).map(([lang, v]) => (
                      <span key={lang}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--kuja-sand))]/30 px-2 py-0.5 text-xs">
                        <span className="font-medium">{lang}</span>
                        <span className="text-muted-foreground">NPS {v.nps}</span>
                        <span className="text-muted-foreground">· n={v.responses}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {data.nps_recent_comments && data.nps_recent_comments.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Recent comments</div>
                  <div className="space-y-1.5">
                    {data.nps_recent_comments.map((c, i) => (
                      <div key={i} className="text-xs border-l-2 border-[hsl(var(--kuja-clay))] pl-2">
                        <span className="font-medium">[{c.score}] </span>
                        <span className="text-muted-foreground">{c.surface} · {c.role ?? 'unknown'} · {c.language ?? '?'}</span>
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
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">Language parity</div>
            <h2 className="kuja-display text-lg">Are non-English users adopting flagship features?</h2>
            <p className="text-xs text-muted-foreground">
              If chat / search usage concentrates in English, that&apos;s the signal to invest in deep i18n polish for the lagging locales.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Chat message senders by language (last 30d)
            </div>
            <BreakdownChips map={data.chat_by_language.by_language} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Search query users by language (last 30d)
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
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">Event volume</div>
            <h2 className="kuja-display text-lg">All recorded events (last 30 days)</h2>
          </div>
        </div>
        {data.event_counts_30d.length === 0 ? (
          <div className="text-xs text-muted-foreground">No events yet. Sessions will start populating immediately.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-[hsl(var(--border))]">
                <th className="py-2">Event</th>
                <th className="py-2 text-right">Count</th>
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
        <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">A/B experiments</div>
        <h2 className="kuja-display text-lg mb-2">Application submits by arm (last 30d)</h2>
        {Object.keys(data.ab_application_submit.by_arm).length === 0 ? (
          <div className="text-xs text-muted-foreground">No experiments wired yet. Pass ab_arm=ab_arm(&apos;exp_name&apos;, org_id=...) when recording outcome events.</div>
        ) : (
          <BreakdownChips map={data.ab_application_submit.by_arm} />
        )}
      </Card>
        </PageMain>
      </PageShell>
    </div>
  );
}
