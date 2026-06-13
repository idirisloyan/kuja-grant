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

export default function CrisisMonitoringPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);

  const { data: latest }     = useLatestCrisisReport();
  const { data: allReports } = useCrisisReports();
  const { data: drafts }     = useCrisisReports('draft');
  const { data: inReview }   = useCrisisReports('in_review');

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">
          Only platform admins can view Crisis Monitoring reports.
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
      label: `${draftCount} draft report${draftCount === 1 ? '' : 's'} awaiting review`,
      hint: 'Auto-drafted by the weekly cron. Publish to make them the evidence anchor for declarations.',
    });
  }
  if (inReviewCount > 0) {
    attention.push({
      tone: 'info',
      label: `${inReviewCount} report${inReviewCount === 1 ? '' : 's'} in review`,
      hint: 'Sign off and publish.',
    });
  }
  if (current?.flagged_row_count && current.flagged_row_count > 0) {
    attention.push({
      tone: 'accent',
      label: `${current.flagged_row_count} signal${current.flagged_row_count === 1 ? '' : 's'} flagged for Oversight Body`,
      hint: 'In the latest published report. Consider whether any warrants an emergency declaration.',
    });
  }

  return (
    <PageShell>
      <PageHeader
        title={network?.name ? `${network.name} — Crisis monitoring` : 'Crisis monitoring'}
        subtitle="Weekly evidence anchor for emergency declarations."
        icon={AlertOctagon}
      />

      <PageAttention items={attention} />

      <PageMain>
        <Tabs defaultValue="current" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto" variant="line">
            <TabsTrigger value="current">Current report</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
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
  if (!report) {
    return (
      <section className="border border-dashed border-border rounded-lg bg-card p-8 text-center">
        <Inbox className="w-8 h-8 mx-auto text-muted-foreground opacity-50 mb-2" />
        <p className="text-sm text-muted-foreground">
          No published crisis monitoring report yet. The weekly cron drafts
          a fresh report every Monday at 06:00 UTC.
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
            <h2 className="font-semibold text-base">Week of {period}</h2>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLOUR[report.status]}`}>
                {report.status.replace('_', ' ')}
              </span>
              <span>{report.row_count} signal{report.row_count === 1 ? '' : 's'}</span>
              {report.flagged_row_count > 0 && (
                <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))]">
                  <Flag className="w-3 h-3" /> {report.flagged_row_count} flagged
                </span>
              )}
              {report.published_at && (
                <span>published {new Date(report.published_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <Link
            href={`/admin/crisis-monitoring/${report.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open full report <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {report.summary_md && (
          <details className="group">
            <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
              Show executive summary
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
            Top flagged signals
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
  if (!report || !report.rows) {
    return (
      <section className="border border-dashed border-border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
        No signals to show yet.
      </section>
    );
  }
  const flagged = report.rows.filter((r) => r.flagged_for_ob);
  if (flagged.length === 0) {
    return (
      <section className="border border-dashed border-border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto opacity-50 mb-2" />
        Nothing flagged for the Oversight Body in this edition.
      </section>
    );
  }
  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <h2 className="font-semibold text-sm">Signals flagged for the Oversight Body</h2>
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
  const [statusFilter, setStatusFilter] = useState('');
  const filtered = statusFilter
    ? reports.filter((r) => r.status === statusFilter)
    : reports;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <label className="text-muted-foreground">Filter:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2 py-1 rounded-md border border-border bg-background text-xs"
        >
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <span className="text-muted-foreground ml-2">
          {filtered.length} edition{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {filtered.length === 0 && (
        <div className="border border-dashed border-border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
          No reports in this state.
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
                      Week of {new Date(r.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {' – '}
                      {new Date(r.period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLOUR[r.status]}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span>{r.row_count} signal{r.row_count === 1 ? '' : 's'}</span>
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
