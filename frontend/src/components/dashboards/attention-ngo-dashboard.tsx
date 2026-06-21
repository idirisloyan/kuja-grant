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
        subtitle="Your workbench. Continue where you left off."
      />

      {/* Phase 92 — Continuous journey thread. Sits ABOVE today's-focus
          because it gives the through-line: the NGO sees not just what
          to do today but where this fits in the broader path from
          profile to funded to compliant to reporting impact. */}
      <JourneyTracker />
      {/* Phase 82 — sharpest possible 'what to do today' line. Picks
          the top-priority attention item and surfaces it as one bold
          headline with a single CTA. Page-attention list still renders
          below for the full picture. */}
      <TodayFocusBanner items={attention} />
      {/* Phase 84 — Resume where you left off. Reads from localStorage. */}
      <ResumeBanner />
      <PageAttention items={attention} />

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
      {/* Phase 273 — compare your 3 most recent apps side-by-side. */}
      <CompareMyAppsCard />
      {/* Phase 277 — top 3 decline reasons across past losses. Hidden when < 3 losses. */}
      <LossPatternsCard />
      {/* Phase 291 — median decision wait time across this NGO's apps. Self-gates when no decisions. */}
      <NgoDecisionVelocityCard />
      {/* Phase 314 — starred grants with deadline countdown. */}
      <NgoWatchlistTile />
      {/* Phase 340 — apps needing doc upload. Self-gates when zero. */}
      <NgoDocsPendingCard />
      {/* Phase 350 — sparkline of recent submit→decision durations. */}
      <NgoApplicationDurationCard />
      {/* Phase 355 — 90-day-vs-prior win rate trend. Self-gates < 3 each. */}
      <NgoWinRateTrendCard />
      <NgoStalledApplicationsCard />
      <NgoPipelineValueCard />
      <NgoFreshDecisionBanner />
      <SubmissionsThisMonthCard />
      <NgoSubmitDurationCard />
      <FastestSubmissionStat />
      <DraftFunnelStat />
      <DraftAgeStat />
      <CompletedAssessmentsStat />
      <UnreadMessagesStat />
      <AppsSubmittedYtdStat />
      <FundingTotalYtdStat />
      <UnreadNotificationsStat />
      <LifetimeWinRateStat />
      <NgoFeedbackThemesCard />
      <CriterionScoreTrendCard />
      <DeadlineDensityCard />
      {/* Phase 154 — rolling 12-month impact summary. Self-gates if zero activity. */}
      <ImpactCard />
      {/* Phase 185 — peer-anonymized win rate by sector. Self-gates
          when peer pool is too small to be meaningful (<5 orgs). */}
      <PeerWinRateCard />
      {/* Phase 148 — watchlist tile. Hidden when empty + no signal value. */}
      <WatchedGrantsCard />

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

      {/* Readiness + cross-grant patterns collapsed under "More insight" */}
      <PageDetail>
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
