'use client';

/**
 * /admin/windows/[id]/report — Phase 37 (May 2026).
 *
 * Per-window report viewer. Shows everything from
 * WindowReportService.build() — aggregate stats, SLA-vs-target hit rates,
 * declaration roster (signature methods + recusals + audit anchors),
 * grants per declaration, monitoring visits with community feedback,
 * and CSV / ZIP download links.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useWindowReport, type WindowReportDeclaration } from '@/lib/hooks/use-api';
import { useRouteId } from '@/lib/hooks/use-route-id';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import {
  ChevronLeft, FileSpreadsheet, Archive, Clock, ShieldCheck,
  ShieldAlert, MapPin, Users, Coins, AlertCircle, Sparkles, Loader2,
  Lightbulb, BarChart3,
} from 'lucide-react';
import {
  PageShell, PageBack, PageHeader, PageMain,
} from '@/components/layout/page-shell';

const SLA_GOOD = 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]';
const SLA_BAD = 'bg-destructive/15 text-destructive';
const SLA_NEUTRAL = 'bg-muted text-muted-foreground';

export default function WindowReportClient() {
  const { t } = useTranslation();
  const windowId = useRouteId('windows');
  const router = useRouter();
  const viewer = useAuthStore((s) => s.user);
  const { data, isLoading } = useWindowReport(windowId);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">{t('window_report.admin_only')}</p>
      </div>
    );
  }
  if (windowId == null || isLoading || !data) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-10 w-72 rounded" />
        <div className="kuja-shimmer h-32 rounded" />
        <div className="kuja-shimmer h-48 rounded" />
      </div>
    );
  }
  if (!data.success) {
    return <div className="p-6 text-sm text-destructive">{t('window_report.load_failed')}</div>;
  }

  const { window, fund, stats, sla, declarations, audit_chain, generated_at } = data;
  const slaTotal72 = sla.app_window_hits + sla.app_window_misses;
  const slaTotal6d = sla.decision_hits + sla.decision_misses;
  const hitRate72 = slaTotal72 > 0 ? Math.round(100 * sla.app_window_hits / slaTotal72) : null;
  const hitRate6d = slaTotal6d > 0 ? Math.round(100 * sla.decision_hits / slaTotal6d) : null;

  return (
    <PageShell>
      <PageBack href="/admin/funds" label={t('window_report.back_to_funds')} />

      <PageHeader
        title={t('window_report.report_title', { name: window.name })}
        icon={BarChart3}
        subtitle={t('window_report.subtitle', {
          fund: fund?.name ?? '',
          currency: fund?.currency ?? '',
          date: new Date(generated_at).toLocaleString(),
        })}
        primaryAction={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/windows/${windowId}/report.csv`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
            >
              <FileSpreadsheet className="w-3 h-3" /> {t('window_report.declarations_csv')}
            </a>
            <a
              href={`/api/windows/${windowId}/report/grants.csv`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
            >
              <FileSpreadsheet className="w-3 h-3" /> {t('window_report.grants_csv')}
            </a>
            <a
              href={`/api/windows/${windowId}/report.zip`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
            >
              <Archive className="w-3 h-3" /> {t('window_report.full_bundle_zip')}
            </a>
          </div>
        }
      />

      <PageMain>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<AlertCircle className="w-4 h-4" />} label={t('window_report.stat_declarations')}
          value={t('window_report.n_active', { n: stats.declarations_active })}
          sub={t('window_report.n_total', { n: stats.declarations_total })} />
        <StatCard icon={<Coins className="w-4 h-4" />} label={t('window_report.stat_grants')}
          value={stats.grants_total.toString()}
          sub={t('window_report.n_disbursed', { n: stats.total_disbursed_estimate.toLocaleString() })} />
        <StatCard icon={<Users className="w-4 h-4" />} label={t('window_report.stat_ngos_reached')}
          value={stats.ngos_reached.toString()} sub={t('window_report.distinct')} />
        <StatCard icon={<MapPin className="w-4 h-4" />} label={t('window_report.stat_countries')}
          value={stats.countries_count.toString()}
          sub={stats.countries_covered.join(', ').slice(0, 40) || '—'} />
      </div>

      {/* SLA-vs-target */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" /> {t('window_report.sla_performance')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <SlaBlock
            label={t('window_report.sla_app_window', { n: sla.target_app_window_hours })}
            hits={sla.app_window_hits} misses={sla.app_window_misses}
            rate={hitRate72}
          />
          <SlaBlock
            label={t('window_report.sla_decision', { n: sla.target_decision_days })}
            hits={sla.decision_hits} misses={sla.decision_misses}
            rate={hitRate6d}
          />
        </div>
      </section>

      {/* Audit chain status */}
      {audit_chain && (
        <div className={
          'flex items-center gap-2 text-xs px-3 py-2 rounded-md border ' +
          (audit_chain.ok === true
            ? 'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]'
            : audit_chain.ok === false
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-border bg-muted text-muted-foreground')
        }>
          {audit_chain.ok === true ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          <span>
            {t('window_report.audit_chain')}{' '}
            {audit_chain.ok === true
              ? t('window_report.audit_verified')
              : audit_chain.ok === false
              ? t('window_report.audit_broken')
              : t('window_report.audit_unverified')}
            {audit_chain.total !== null && <> · {t('window_report.n_entries', { n: audit_chain.total })}</>}
          </span>
        </div>
      )}

      {/* Declaration roster */}
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm">{t('window_report.declarations_count', { n: declarations.length })}</h2>
        {declarations.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">{t('window_report.no_declarations')}</div>
        ) : (
          <ul className="space-y-3">
            {declarations.map((d) => <DeclarationRow key={d.id} d={d} />)}
          </ul>
        )}
      </section>

      {/* AI panels (Phase 38) */}
      <AINarrativePanel windowId={windowId} />
      <CrossWindowPatternsPanel />
      </PageMain>
    </PageShell>
  );
}

function AINarrativePanel({ windowId }: { windowId: number }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    overview_md?: string;
    sla_commentary_md?: string;
    governance_md?: string;
    closing_md?: string;
  } | null>(null);

  async function run() {
    setBusy(true);
    try {
      const r = await api.post<typeof result>(
        `/windows/${windowId}/report/ai-narrative`,
      );
      setResult(r);
      if (r?.ok) toast.success(t('window_report.narrative_drafted'));
      else toast.message(t('window_report.ai_unavailable'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('window_report.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-spark))]" />
          {t('window_report.ai_narrative')}
        </h2>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-spark))] text-white text-xs font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {result ? t('window_report.redraft') : t('window_report.draft_narrative')}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('window_report.ai_narrative_help')}
      </p>
      {result && (
        <div className="space-y-3 text-sm">
          {!result.ok && (
            <div className="text-xs italic text-muted-foreground">
              {t('window_report.fallback_shown')}
            </div>
          )}
          {result.overview_md && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('window_report.overview')}</div>
              <p className="whitespace-pre-wrap leading-relaxed">{result.overview_md}</p>
            </div>
          )}
          {result.sla_commentary_md && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('window_report.sla_commentary')}</div>
              <p className="whitespace-pre-wrap leading-relaxed">{result.sla_commentary_md}</p>
            </div>
          )}
          {result.governance_md && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('window_report.governance')}</div>
              <p className="whitespace-pre-wrap leading-relaxed">{result.governance_md}</p>
            </div>
          )}
          {result.closing_md && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('window_report.closing')}</div>
              <p className="whitespace-pre-wrap leading-relaxed">{result.closing_md}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CrossWindowPatternsPanel() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    patterns?: Array<{ title: string; observation: string; evidence_windows?: string[] }>;
    note?: string;
  } | null>(null);

  async function run() {
    setBusy(true);
    try {
      const r = await api.post<typeof result>('/networks/patterns/ai-detect');
      setResult(r);
      if (r?.ok) {
        const count = r.patterns?.length || 0;
        toast.success(
          t(
            count === 1
              ? 'window_report.pattern_detected_one'
              : 'window_report.patterns_detected_other',
            { n: count },
          ),
        );
      } else {
        toast.message(t('window_report.ai_unavailable'));
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('window_report.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-[hsl(var(--kuja-sun))]" />
          {t('window_report.cross_window_patterns')}
        </h2>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--kuja-spark))] text-white text-xs font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {t('window_report.detect_patterns')}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('window_report.patterns_help')}
      </p>
      {result?.note && (
        <div className="text-xs italic text-muted-foreground">{result.note}</div>
      )}
      {result?.patterns && result.patterns.length > 0 && (
        <ul className="space-y-2 text-sm">
          {result.patterns.map((p, i) => (
            <li key={i} className="border-l-2 border-[hsl(var(--kuja-spark))] pl-3 py-1">
              <div className="font-semibold text-sm">{p.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{p.observation}</div>
              {p.evidence_windows && p.evidence_windows.length > 0 && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {t('window_report.evidence', { items: p.evidence_windows.join(' · ') })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
}) {
  return (
    <div className="border border-border rounded-lg bg-card p-3 space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}

function SlaBlock({ label, hits, misses, rate }: {
  label: string; hits: number; misses: number; rate: number | null;
}) {
  const { t } = useTranslation();
  const tone = rate === null ? SLA_NEUTRAL
    : rate >= 80 ? SLA_GOOD
    : SLA_BAD;
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${tone}`}>
          {rate === null ? '—' : t('window_report.n_hit_rate', { n: rate })}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t('window_report.hits_misses', { hits, misses })}
        </span>
      </div>
    </div>
  );
}

function DeclarationRow({ d }: { d: WindowReportDeclaration }) {
  const { t } = useTranslation();
  return (
    <li className="border border-border rounded-md bg-background p-3 space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-medium text-sm">{d.title}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {d.status.replace('_', ' ')}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-3">
        {d.country && <span>{d.country}</span>}
        {d.crisis_type && <span>{d.crisis_type}</span>}
        <span>
          {t('window_report.n_signed', { n: d.signed_count })}
          {d.recused_count > 0 && <> · {t('window_report.n_recused', { n: d.recused_count })}</>}
          {d.rejected_count > 0 && <> · {t('window_report.n_rejected', { n: d.rejected_count })}</>}
        </span>
        <span>
          {t(
            d.grants.length === 1
              ? 'window_report.n_grant_one'
              : 'window_report.n_grants_other',
            { n: d.grants.length },
          )}
        </span>
        {d.signed_active_audit_id && (
          <span title={t('window_report.activation_audit_anchor', { n: d.signed_active_audit_id })}>
            🔒 #{d.signed_active_audit_id}
          </span>
        )}
      </div>
      {d.grants.length > 0 && (
        <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-2 border-l border-border">
          {d.grants.map((g) => (
            <li key={g.id}>
              · {g.title} — {g.status}
              {g.amount && <> · {g.amount.toLocaleString()} {g.currency}</>}
            </li>
          ))}
        </ul>
      )}
      {d.monitoring_visits.length > 0 && (
        <div className="text-[11px] text-muted-foreground border-l border-border pl-2">
          <div className="font-medium text-foreground/80 mb-1">
            {t('window_report.monitoring_count', { n: d.monitoring_visits.length })}
          </div>
          {d.monitoring_visits.slice(0, 3).map((v) => (
            <div key={v.id} className="mb-1">
              {v.visit_date} · {v.visit_mode}
              {v.community_feedback_summary && (
                <div className="italic">&ldquo;{v.community_feedback_summary}&rdquo;</div>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
