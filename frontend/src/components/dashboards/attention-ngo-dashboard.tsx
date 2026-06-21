'use client';

/**
 * Kuja NGO dashboard — Phase 48.
 *
 * The brief: should feel like a workbench, not a dashboard.
 *
 *   Top: Continue where you left off (draft applications)
 *   Sections: applications in progress · reports due soon ·
 *             best-fit opportunities · org readiness / profile gaps
 *   Detail: the existing rich NGO console as a collapsible
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import {
  useApplications, useUpcomingReports,
} from '@/lib/hooks/use-api';
import {
  PageShell, PageHeader, PageAttention, PageMain, PageDetail,
  PageDetailSection, type AttentionItem,
} from '@/components/layout/page-shell';
import { NgoReadinessConsole } from '@/components/dashboards/ngo-readiness-console';
import { MatchesCard } from '@/components/dashboards/matches-card';
import { CrossGrantPatternsCard } from '@/components/dashboards/cross-grant-patterns-card';
// Phase 74 — compliance coach. Flips the dashboard from "what's wrong"
// to "what your posture looks like and how to improve it next."
import { ComplianceCoachCard } from '@/components/dashboards/compliance-coach-card';
// Phase 82 — Today's focus banner. Single bold action above PageAttention.
import { TodayFocusBanner } from '@/components/dashboards/today-focus-banner';
// Phase 84 — Resume banner reads autosaved work from localStorage.
import { ResumeBanner } from '@/components/dashboards/resume-banner';
// Phase 92 — Continuous NGO journey tracker.
import { JourneyTracker } from '@/components/dashboards/journey-tracker';
import { WatchedGrantsCard } from '@/components/dashboards/watched-grants-card';
import { ImpactCard } from '@/components/dashboards/impact-card';
import { NewGrantMatchesCard } from '@/components/dashboards/new-grant-matches-card';
import { PeerWinRateCard } from '@/components/dashboards/peer-win-rate-card';
import { DeadlineThisWeekCard } from '@/components/dashboards/deadline-this-week-card';
import { DocsRequestedCard } from '@/components/dashboards/docs-requested-card';
import { NgoInboxCard } from '@/components/dashboards/ngo-inbox-card';
import { TrustCompletenessCard } from '@/components/dashboards/trust-completeness-card';
import { ActiveApplicationsCard } from '@/components/dashboards/active-applications-card';
import { TrustShareCard } from '@/components/dashboards/trust-share-card';
import { PastDecisionsCard } from '@/components/dashboards/past-decisions-card';
import { CompareMyAppsCard } from '@/components/dashboards/compare-my-apps-card';
import { LossPatternsCard } from '@/components/dashboards/loss-patterns-card';
import { NgoDecisionVelocityCard } from '@/components/dashboards/ngo-decision-velocity-card';
import { NgoWatchlistTile } from '@/components/dashboards/ngo-watchlist-tile';
import { NgoDocsPendingCard } from '@/components/dashboards/ngo-docs-pending-card';
import { NgoApplicationDurationCard } from '@/components/dashboards/ngo-application-duration-card';
import { NgoWinRateTrendCard } from '@/components/dashboards/ngo-win-rate-trend-card';
import { NgoStalledApplicationsCard } from '@/components/dashboards/ngo-stalled-applications-card';
import { NgoPipelineValueCard } from '@/components/dashboards/ngo-pipeline-value-card';
import { NgoFreshDecisionBanner } from '@/components/dashboards/ngo-fresh-decision-banner';
import { SubmissionsThisMonthCard } from '@/components/dashboards/submissions-this-month-card';
import { NgoSubmitDurationCard } from '@/components/dashboards/ngo-submit-duration-card';
import { NgoFeedbackThemesCard } from '@/components/dashboards/ngo-feedback-themes-card';
import { CriterionScoreTrendCard } from '@/components/dashboards/criterion-score-trend-card';
import { DeadlineDensityCard } from '@/components/dashboards/deadline-density-card';
import { FastestSubmissionStat } from '@/components/dashboards/fastest-submission-stat';
import { DraftFunnelStat } from '@/components/dashboards/draft-funnel-stat';
import { DraftAgeStat } from '@/components/dashboards/draft-age-stat';
import { CompletedAssessmentsStat } from '@/components/dashboards/completed-assessments-stat';
import { UnreadMessagesStat } from '@/components/dashboards/unread-messages-stat';
import { AppsSubmittedYtdStat } from '@/components/dashboards/apps-submitted-ytd-stat';
import { FundingTotalYtdStat } from '@/components/dashboards/funding-total-ytd-stat';
import { UnreadNotificationsStat } from '@/components/dashboards/unread-notifications-stat';
import { LifetimeWinRateStat } from '@/components/dashboards/lifetime-win-rate-stat';
import { WinRateQuarterStat } from '@/components/dashboards/win-rate-quarter-stat';
import { WatchlistSizeStat } from '@/components/dashboards/watchlist-size-stat';
import { SectorBreadthStat } from '@/components/dashboards/sector-breadth-stat';
import { DaysSinceLastSubmissionStat } from '@/components/dashboards/days-since-last-submission-stat';
import { SubmissionConsistencyStat } from '@/components/dashboards/submission-consistency-stat';
import { ActiveGrantsStat } from '@/components/dashboards/active-grants-stat';
import { DocumentsThisMonthStat } from '@/components/dashboards/documents-this-month-stat';
import { PipelineCountStat } from '@/components/dashboards/pipeline-count-stat';
import { SavedSearchesCountStat } from '@/components/dashboards/saved-searches-count-stat';
import { DocsPendingExtractionStat } from '@/components/dashboards/docs-pending-extraction-stat';
import { AiCalls7dStat } from '@/components/dashboards/ai-calls-7d-stat';
import { SubmittedTodayStat } from '@/components/dashboards/submitted-today-stat';
import { EoiCountStat } from '@/components/dashboards/eoi-count-stat';
import { RevisionRequestedStat } from '@/components/dashboards/revision-requested-stat';
import { MostActiveGrantStat } from '@/components/dashboards/most-active-grant-stat';
import { WithdrawnCountStat } from '@/components/dashboards/withdrawn-count-stat';
import { PeakAiScoreStat } from '@/components/dashboards/peak-ai-score-stat';
import { AiCostYtdStat } from '@/components/dashboards/ai-cost-ytd-stat';
import { DecisionVelocityFromSubmissionStat } from '@/components/dashboards/decision-velocity-from-submission-stat';
import {
  FileText, BarChart3, ArrowRight, Sparkles, Lightbulb,
} from 'lucide-react';

export function AttentionNgoDashboard() {
  const user = useAuthStore((s) => s.user);

  const { data: myApps }       = useApplications();
  const { data: upcomingReps } = useUpcomingReports();

  const draftApps   = (myApps?.applications ?? []).filter((a) => a.status === 'draft');
  const submitted   = (myApps?.applications ?? []).filter((a) =>
    ['submitted', 'in_review'].includes(a.status),
  );
  // upcoming_reports is typed `unknown[]` at the hook; narrow it here.
  // Backend returns `draft_report_id` (nullable when not yet started)
  // plus `application_id` — there is no top-level `id` field.
  type Upcoming = {
    grant_id: number;
    grant_title?: string;
    due_date?: string;
    application_id?: number;
    draft_report_id: number | null;
    requirement_title?: string;
    reporting_period?: string;
    status?: string;
  };
  const upcoming = ((upcomingReps?.upcoming_reports ?? []) as Upcoming[]).slice(0, 3);

  // Phase 63 — name the entities (same pattern as Phase 62).
  const draftNames = draftApps
    .map((a) => a.grant_title ? `"${a.grant_title}"` : `App #${a.id}`)
    .slice(0, 2);
  const upcomingNames = upcoming
    .map((r) => r.grant_title ? `"${r.grant_title}"` : (r.requirement_title || 'Report'))
    .slice(0, 2);
  const fmtList = (sample: string[], total: number) => {
    if (sample.length === 0) return '';
    const more = total - sample.length;
    return more > 0 ? `${sample.join(', ')} +${more} more` : sample.join(', ');
  };

  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    if (draftApps.length > 0) {
      const list = fmtList(draftNames, draftApps.length);
      items.push({
        tone: 'accent',
        label: `Continue where you left off — ${draftApps.length} draft${draftApps.length === 1 ? '' : 's'}`,
        hint: list
          ? `${list}. Pick up your work-in-progress applications.`
          : 'Pick up your work-in-progress applications.',
        action: <JumpLink href="/applications" label="Continue" />,
      });
    }
    if (upcoming.length > 0) {
      const list = fmtList(upcomingNames, upcoming.length);
      items.push({
        tone: 'warn',
        label: `${upcoming.length} report${upcoming.length === 1 ? '' : 's'} due soon`,
        hint: list || undefined,
        action: <JumpLink href="/reports" label="Open Reports" />,
      });
    }
    if (items.length === 0) {
      items.push({
        tone: 'good',
        label: 'You\'re all caught up',
        hint: 'No drafts, no reports due. Browse opportunities below.',
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftApps, upcoming,
    draftNames.join('|'),
    upcomingNames.join('|'),
  ]);

  if (!user) return null;
  const firstName = user.name?.split(' ')[0] ?? 'there';

  return (
    <PageShell>
      <PageHeader
        title={`Hi ${firstName}.`}
        subtitle="Here's what to do next."
      />

      {/* Phase 616 — "one obvious next action" pass per team retest
          feedback (2026-06-21). The previous order put a 5-step journey
          tracker between the user and their next action; new order is
          strictly priority-driven so the eye lands on something
          actionable.

          1. ResumeBanner — self-gates on autosaved work; if you were
             mid-draft, finishing it IS your next action.
          2. TodayFocusBanner — sharpest single-sentence CTA pulled from
             the prioritised attention list; renders an "all caught up"
             state when there's nothing.

          Journey tracker is informational orientation, not action — it
          moved below the action tiles, where it provides "where am I
          in the bigger picture" without competing with "what to do
          right now." */}
      <ResumeBanner />
      <TodayFocusBanner items={attention} />
      <PageAttention items={attention} />

      {/* Phase 613 — Action-driving tiles only above the fold. The team
          target (Global South NGOs, often on phones, sometimes with low
          literacy) needs a workbench, not a metrics wall. Action tiles
          stay here — every one is either an inbox or surfaces something
          to do. The 30+ Stat tiles + trend/history cards moved into the
          "Your numbers" disclosure below, closed by default. Each tile
          still self-gates when its signal is empty, so even this list
          stays short in practice. */}

      {/* Phase 172 — saved-search match inbox. Self-gates when zero. */}
      <NewGrantMatchesCard />
      {/* Phase 207 — Drafts with deadline ≤ 7 days. Self-gates when none. */}
      <DeadlineThisWeekCard />
      {/* Phase 212 — Donor-requested extra documents. Self-gates when none. */}
      <DocsRequestedCard />
      {/* Phase 227 — Combined open-requests inbox (docs + revisions + review status). */}
      <NgoInboxCard />
      {/* Phase 230 — Trust Profile completeness gaps. Self-gates when none. */}
      <TrustCompletenessCard />
      {/* Phase 245 — applications in submitted/under_review/scored. */}
      <ActiveApplicationsCard />
      {/* Phase 257 — public Trust Profile share link CTA. */}
      <TrustShareCard />
      {/* Phase 260 — recent donor decisions on this NGO's apps. */}
      <PastDecisionsCard />
      {/* Phase 314 — starred grants with deadline countdown. */}
      <NgoWatchlistTile />
      {/* Phase 340 — apps needing doc upload. Self-gates when zero. */}
      <NgoDocsPendingCard />
      {/* Phase 361 — stalled apps (submitted but no recent activity). Self-gates when none. */}
      <NgoStalledApplicationsCard />
      {/* Phase 373 — first-decision landing banner. Self-gates after dismiss. */}
      <NgoFreshDecisionBanner />

      <PageMain>
        {/* Applications in progress (drafts) */}
        {draftApps.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Applications in progress
              </h2>
              <Link
                href="/applications"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                See all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {draftApps.slice(0, 4).map((a) => (
                <li key={a.id} className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3 hover:bg-muted/30">
                  <Link href={`/applications/${a.id}`} className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {a.grant_title || `Application #${a.id}`}
                    </div>
                    <div className="text-muted-foreground mt-0.5">draft</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Reports due soon */}
        {upcoming.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Reports due soon
              </h2>
              <Link
                href="/reports"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                See all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {upcoming.map((r, idx) => {
                // Drafts have a real report row; not-yet-started periods
                // don't, and need to be created from the reports list page
                // (deep-linked to the grant).
                const href = r.draft_report_id
                  ? `/reports/${r.draft_report_id}`
                  : `/reports?grant_id=${r.grant_id}`;
                const cta = r.draft_report_id ? 'Resume draft' : 'Start report';
                return (
                  <li
                    key={`${r.grant_id}-${r.reporting_period || idx}`}
                    className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3"
                  >
                    <Link href={href} className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">
                        {r.grant_title || r.requirement_title || 'Report'}
                      </div>
                      <div className="text-muted-foreground mt-0.5 flex items-center gap-2">
                        {r.due_date && <span>Due {new Date(r.due_date).toLocaleDateString()}</span>}
                        {r.reporting_period && <span className="opacity-70">· {r.reporting_period}</span>}
                      </div>
                    </Link>
                    <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--kuja-clay))] font-semibold whitespace-nowrap">
                      {cta}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Best-fit opportunities — the existing matches card stays. */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              Best-fit opportunities
            </h2>
            <Link
              href="/grants"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Open Opportunities <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <MatchesCard limit={3} />
        </section>

        {/* Submitted — only when there are any */}
        {submitted.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Awaiting decision
              </h2>
              <Link
                href="/applications"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                See all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {submitted.slice(0, 3).map((a) => (
                <li key={a.id} className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3">
                  <Link href={`/applications/${a.id}`} className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {a.grant_title || `Application #${a.id}`}
                    </div>
                    <div className="text-muted-foreground capitalize mt-0.5">{a.status.replace('_', ' ')}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* Phase 74 — compliance coach lives in PageMain because it's
            action-driving. Hidden gracefully if the NGO has fewer than
            2 submitted reports (the card itself handles that). */}
        <ComplianceCoachCard />

      </PageMain>

      {/* Phase 613 — Readiness + numbers split out of the main wall.
          Two collapsible sections, both closed by default:

            "Your numbers" — every Stat tile + every trend / history
            / pattern card. Useful for organisations who want to look,
            invisible to organisations who just want their inbox.

            "Readiness & patterns" — the existing console + cross-grant
            patterns. Stays as it was.

          Each tile inside still self-gates, so opening the disclosure
          on a brand-new account shows almost nothing rather than a
          wall of zeros. */}
      <PageDetail>
        <PageDetailSection title="Your numbers" icon={BarChart3} defaultOpen={false}>
          <div className="space-y-3">
            {/* Look-back cards — patterns, trends, history */}
            <CompareMyAppsCard />
            <LossPatternsCard />
            <NgoDecisionVelocityCard />
            <NgoApplicationDurationCard />
            <NgoWinRateTrendCard />
            <NgoPipelineValueCard />
            <SubmissionsThisMonthCard />
            <NgoSubmitDurationCard />
            <NgoFeedbackThemesCard />
            <CriterionScoreTrendCard />
            <DeadlineDensityCard />
            <ImpactCard />
            <PeerWinRateCard />
            <WatchedGrantsCard />
            {/* Stat tiles — Phase 379+. Each is one number with context. */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <FastestSubmissionStat />
              <DraftFunnelStat />
              <DraftAgeStat />
              <CompletedAssessmentsStat />
              <UnreadMessagesStat />
              <AppsSubmittedYtdStat />
              <FundingTotalYtdStat />
              <UnreadNotificationsStat />
              <LifetimeWinRateStat />
              <WinRateQuarterStat />
              <WatchlistSizeStat />
              <SectorBreadthStat />
              <DaysSinceLastSubmissionStat />
              <SubmissionConsistencyStat />
              <ActiveGrantsStat />
              <DocumentsThisMonthStat />
              <PipelineCountStat />
              <SavedSearchesCountStat />
              <DocsPendingExtractionStat />
              <AiCalls7dStat />
              <SubmittedTodayStat />
              <EoiCountStat />
              <RevisionRequestedStat />
              <MostActiveGrantStat />
              <WithdrawnCountStat />
              <PeakAiScoreStat />
              <AiCostYtdStat />
              <DecisionVelocityFromSubmissionStat />
            </div>
          </div>
        </PageDetailSection>
        <PageDetailSection title="Readiness & patterns" icon={Lightbulb} defaultOpen={false}>
          <div className="space-y-4">
            <NgoReadinessConsole />
            <CrossGrantPatternsCard />
          </div>
        </PageDetailSection>
      </PageDetail>
    </PageShell>
  );
}

function JumpLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-background border border-border text-xs font-semibold hover:bg-muted shrink-0"
    >
      {label} <ArrowRight className="w-3 h-3" />
    </Link>
  );
}
