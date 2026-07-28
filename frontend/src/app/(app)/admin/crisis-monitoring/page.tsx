'use client';

/**
 * /admin/crisis-monitoring — Phase 49 redesign as a decision-support page.
 *
 * Brief shape:
 *   Top: latest published report · flagged countries/events · escalations
 *   Tabs: Current report · Signals · History
 *   Default: show summary + top flagged items; hide long narrative
 *            behind expanders.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  useCrisisReports, useLatestCrisisReport, type CrisisReport,
} from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import {
  PageShell, PageHeader, PageAttention, PageMain, type AttentionItem,
} from '@/components/layout/page-shell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertOctagon, Inbox, Flag, ShieldCheck, ChevronRight, Activity,
} from 'lucide-react';

const STATUS_COLOUR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]',
  published: 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]',
  archived: 'bg-muted text-muted-foreground',
};

// Map a backend status enum to a translated, human-readable label. Keeps the
// enum id intact; only the visible label is localised.
function statusLabel(
  status: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = `crisis_list.status_${status}`;
  const label = t(key);
  return label === key ? status.replace('_', ' ') : label;
}

export default function CrisisMonitoringPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const { t } = useTranslation();

  const { data: latest }     = useLatestCrisisReport();
  const { data: allReports } = useCrisisReports();
  const { data: drafts }     = useCrisisReports('draft');
  const { data: inReview }   = useCrisisReports('in_review');

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">
          {t('crisis_list.admin_only')}
        </p>
      </div>
    );
  }

  const current = latest?.report ?? null;
  const reports = allReports?.reports ?? [];
  const draftCount    = drafts?.reports?.length ?? 0;
  const inReviewCount = inReview?.reports?.length ?? 0;

  // Attention: when draft / in_review reports exist, the secretariat
  // owes a publish decision.
  const attention: AttentionItem[] = [];
  if (draftCount > 0) {
    attention.push({
      tone: 'warn',
      label: t(
        draftCount === 1
          ? 'crisis_list.drafts_awaiting_review_one'
          : 'crisis_list.drafts_awaiting_review_other',
        { n: draftCount },
      ),
      hint: t('crisis_list.drafts_hint'),
    });
  }
  if (inReviewCount > 0) {
    attention.push({
      tone: 'info',
      label: t(
        inReviewCount === 1
          ? 'crisis_list.reports_in_review_one'
          : 'crisis_list.reports_in_review_other',
        { n: inReviewCount },
      ),
      hint: t('crisis_list.in_review_hint'),
    });
  }
  if (current?.flagged_row_count && current.flagged_row_count > 0) {
    attention.push({
      tone: 'accent',
      label: t(
        current.flagged_row_count === 1
          ? 'crisis_list.signals_flagged_ob_one'
          : 'crisis_list.signals_flagged_ob_other',
        { n: current.flagged_row_count },
      ),
      hint: t('crisis_list.flagged_hint'),
    });
  }

  return (
    <PageShell>
      <PageHeader
        title={network?.name
          ? t('crisis_list.title_with_network', { name: network.name })
          : t('crisis_list.title')}
        subtitle={t('crisis_list.subtitle')}
        icon={AlertOctagon}
      />

      <PageAttention items={attention} />

      <PageMain>
        <Tabs defaultValue="current" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto" variant="line">
            <TabsTrigger value="current">{t('crisis_list.tab_current')}</TabsTrigger>
            <TabsTrigger value="signals">{t('crisis_list.tab_signals')}</TabsTrigger>
            <TabsTrigger value="history">{t('crisis_list.tab_history')}</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="mt-3">
            <CurrentReportTab report={current} />
          </TabsContent>

          <TabsContent value="signals" className="mt-3">
            <SignalsTab report={current} />
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            <HistoryTab reports={reports} />
          </TabsContent>
        </Tabs>
      </PageMain>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Current report — summary + top flagged signals + Open full report link
// ---------------------------------------------------------------------------

function CurrentReportTab({ report }: { report: CrisisReport | null }) {
  const { t } = useTranslation();
  if (!report) {
    return (
      <section className="border border-dashed border-border rounded-lg bg-card p-8 text-center">
        <Inbox className="w-8 h-8 mx-auto text-muted-foreground opacity-50 mb-2" />
        <p className="text-sm text-muted-foreground">
          {t('crisis_list.no_published_report')}
        </p>
      </section>
    );
  }
  const period =
    `${new Date(report.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` +
    ` – ${new Date(report.period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const flagged = (report.rows ?? []).filter((r) => r.flagged_for_ob);
  return (
    <div className="space-y-4">
      <section className="border border-border rounded-lg bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-semibold text-base">{t('crisis_list.week_of', { period })}</h2>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLOUR[report.status]}`}>
                {statusLabel(report.status, t)}
              </span>
              <span>
                {t(
                  report.row_count === 1
                    ? 'crisis_list.signal_count_one'
                    : 'crisis_list.signal_count_other',
                  { n: report.row_count },
                )}
              </span>
              {report.flagged_row_count > 0 && (
                <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))]">
                  <Flag className="w-3 h-3" /> {t('crisis_list.flagged_count', { n: report.flagged_row_count })}
                </span>
              )}
              {report.published_at && (
                <span>{t('crisis_list.published_on', { date: new Date(report.published_at).toLocaleDateString() })}</span>
              )}
            </div>
          </div>
          <Link
            href={`/admin/crisis-monitoring/${report.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('crisis_list.open_full_report')} <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {report.summary_md && (
          <details className="group">
            <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
              {t('crisis_list.show_executive_summary')}
            </summary>
            <p className="text-sm whitespace-pre-wrap leading-relaxed mt-2 pt-2 border-t border-border">
              {report.summary_md}
            </p>
          </details>
        )}
      </section>

      {flagged.length > 0 && (
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Flag className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
            {t('crisis_list.top_flagged_signals')}
          </h2>
          <ul className="space-y-2">
            {flagged.slice(0, 5).map((r) => (
              <li key={r.id} className="border border-border rounded-md p-3 text-xs">
                <div className="font-medium text-sm">
                  {r.country}
                  {r.event_type && <> — <span className="capitalize">{r.event_type}</span></>}
                  {r.attention_band && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))] uppercase">
                      {r.attention_band}
                    </span>
                  )}
                </div>
                {r.narrative && (
                  <p className="text-muted-foreground mt-1">{r.narrative}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signals — flagged rows only, sortable view
// ---------------------------------------------------------------------------

function SignalsTab({ report }: { report: CrisisReport | null }) {
  const { t } = useTranslation();
  if (!report || !report.rows) {
    return (
      <section className="border border-dashed border-border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
        {t('crisis_list.no_signals_yet')}
      </section>
    );
  }
  const flagged = report.rows.filter((r) => r.flagged_for_ob);
  if (flagged.length === 0) {
    return (
      <section className="border border-dashed border-border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto opacity-50 mb-2" />
        {t('crisis_list.nothing_flagged')}
      </section>
    );
  }
  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <h2 className="font-semibold text-sm">{t('crisis_list.signals_flagged_heading')}</h2>
      <ul className="space-y-2">
        {flagged.map((r) => (
          <li key={r.id} className="border border-border rounded-md p-3 text-xs">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-medium text-sm">
                {r.country}
                {r.event_type && <> — <span className="capitalize">{r.event_type}</span></>}
              </div>
              {r.attention_band && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))] uppercase">
                  {r.attention_band}
                </span>
              )}
            </div>
            {r.narrative && <p className="text-muted-foreground mt-1">{r.narrative}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// History — list view of all editions
// ---------------------------------------------------------------------------

function HistoryTab({ reports }: { reports: CrisisReport[] }) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('');
  const filtered = statusFilter
    ? reports.filter((r) => r.status === statusFilter)
    : reports;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <label className="text-muted-foreground">{t('common.filter')}:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2 py-1 rounded-md border border-border bg-background text-xs"
        >
          <option value="">{t('crisis_list.filter_all')}</option>
          <option value="draft">{t('crisis_list.status_draft')}</option>
          <option value="in_review">{t('crisis_list.status_in_review')}</option>
          <option value="published">{t('crisis_list.status_published')}</option>
          <option value="archived">{t('crisis_list.status_archived')}</option>
        </select>
        <span className="text-muted-foreground ml-2">
          {t(
            filtered.length === 1
              ? 'crisis_list.edition_count_one'
              : 'crisis_list.edition_count_other',
            { n: filtered.length },
          )}
        </span>
      </div>

      {filtered.length === 0 && (
        <div className="border border-dashed border-border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
          {t('crisis_list.no_reports_in_state')}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/crisis-monitoring/${r.id}`}
              className="block border border-border rounded-lg bg-card p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {t('crisis_list.week_of', {
                        period:
                          `${new Date(r.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` +
                          ` – ${new Date(r.period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
                      })}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLOUR[r.status]}`}>
                      {statusLabel(r.status, t)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span>
                      {t(
                        r.row_count === 1
                          ? 'crisis_list.signal_count_one'
                          : 'crisis_list.signal_count_other',
                        { n: r.row_count },
                      )}
                    </span>
                    {r.flagged_row_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))]">
                        <Flag className="w-3 h-3" /> {r.flagged_row_count}
                      </span>
                    )}
                    {r.cron_anchor_audit_id && (
                      <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-grow))]">
                        <ShieldCheck className="w-3 h-3" /> #{r.cron_anchor_audit_id}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
