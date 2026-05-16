'use client';

/**
 * Kuja Dashboard — Phase 3 role-aware command centers.
 *
 * Replaces the legacy MUI stat-tile dashboard (828 lines) with a
 * focused, decision-driving surface per role. Each command center:
 *   - Hero verdict card with AI-synthesized next decisions
 *   - 2-3 production charts (Recharts) with AI-narrated captions
 *   - Integrated co-pilot rail via the global Sparkle toggle
 *
 * Users needing detailed tables navigate to /applications, /grants,
 * /reports, etc. This page is the command center, not a database view.
 */

import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { DonorCommandCenter } from '@/components/dashboards/donor-command-center';
import { NgoReadinessConsole } from '@/components/dashboards/ngo-readiness-console';
import { ReviewerQueue } from '@/components/dashboards/reviewer-queue';
import { AdminOpsPanel } from '@/components/dashboards/admin-ops-panel';
import { MatchesCard } from '@/components/dashboards/matches-card';
import { ThisWeekHome } from '@/components/dashboards/this-week-home';
import { DonorActionQueue } from '@/components/dashboards/donor-action-queue';
import { ReviewerActionQueue } from '@/components/dashboards/reviewer-action-queue';
import { TodayBriefing } from '@/components/dashboards/today-briefing';
import { PreemptionWatchCard } from '@/components/dashboards/preemption-watch-card';
import { AIBudgetAdminCard } from '@/components/dashboards/ai-budget-admin-card';
import { CrossGrantPatternsCard } from '@/components/dashboards/cross-grant-patterns-card';
import { PortfolioDownloadCard } from '@/components/dashboards/portfolio-download-card';
import { PortfolioAuditTimeline } from '@/components/dashboards/portfolio-audit-timeline';
import { NGOPortfolioDownloadCard } from '@/components/dashboards/ngo-portfolio-download-card';
import { DebriefRollupCard } from '@/components/dashboards/debrief-rollup-card';
import { StageLabelsEditor } from '@/components/dashboards/stage-labels-editor';
import { PeerBenchmarksCard } from '@/components/dashboards/peer-benchmarks-card';
import { ReviewerThroughputCard } from '@/components/dashboards/reviewer-throughput-card';
import { OnboardingChecklist } from '@/components/dashboards/onboarding-checklist';
import { OrgMergeTool } from '@/components/dashboards/org-merge-tool';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-28 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="kuja-shimmer h-56 rounded-xl" />
          <div className="kuja-shimmer h-56 rounded-xl" />
          <div className="kuja-shimmer h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  const h = new Date().getHours();
  const greetingKey =
    h < 5 ? 'dashboard.greeting.up_early'
    : h < 12 ? 'dashboard.greeting.morning'
    : h < 17 ? 'dashboard.greeting.afternoon'
    : 'dashboard.greeting.evening';
  const subtitleKey =
    user.role === 'donor' ? 'dashboard.donor.subtitle'
    : user.role === 'ngo' ? 'dashboard.ngo.subtitle'
    : user.role === 'reviewer' ? 'dashboard.reviewer.subtitle'
    : user.role === 'admin' ? 'dashboard.admin.subtitle'
    : 'dashboard.subtitle.default';

  return (
    <div className="space-y-6">
      {/* Welcome line */}
      <div>
        <h1 className="kuja-display text-3xl">
          {t(greetingKey)}, <span className="text-[hsl(var(--kuja-clay-dark))]">{user.name?.split(' ')[0] ?? 'there'}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(subtitleKey)}
        </p>
      </div>

      {/* Phase 2 (category-defining UX): Today briefing — top of every
          dashboard. Deterministic role-aware prioritised action list. */}
      <TodayBriefing />

      {user.role === 'donor' && (
        <>
          {/* Phase 18C — donor onboarding checklist (auto-hides once activated). */}
          <OnboardingChecklist />
          {/* Phase 3 — AI Pre-emption Watch above the action queue.
              "Here's what's likely to slip before it slips." */}
          <PreemptionWatchCard scope="me" />
          {/* Phase 11 — cross-grant patterns for the donor's portfolio. */}
          <CrossGrantPatternsCard />
          {/* Phase 13 — board-ready portfolio PDF + AI exec summary in one click. */}
          <PortfolioDownloadCard />
          {/* Phase 15A — debrief rollup: "why you award/decline." */}
          <DebriefRollupCard />
          {/* Phase 16B — anonymous comparison vs peer donors */}
          <PeerBenchmarksCard />
          {/* Phase 13.29 — donor action queue (analog of ThisWeekHome).
              Renders above the existing command center so the donor sees
              "what do I do next?" before "what's the state?" */}
          <DonorActionQueue />
          <DonorCommandCenter />
          {/* Phase 13 — tamper-evident audit timeline at bottom of donor
              dashboard so the review loop (publish → verify → download) is
              visible without leaving the page. */}
          <PortfolioAuditTimeline />
        </>
      )}
      {user.role === 'ngo' && (
        <>
          {/* Phase 17B — first-run checklist (auto-hides once activated). */}
          <OnboardingChecklist />
          {/* Phase 3 — AI Pre-emption Watch for the NGO's own grants. */}
          <PreemptionWatchCard scope="me" />
          {/* Phase 11 — cross-grant patterns ("where you consistently win/lose"). */}
          <CrossGrantPatternsCard />
          {/* Phase 14 — board-ready delivery report PDF + AI summary
              for everything the NGO shipped this period. */}
          <NGOPortfolioDownloadCard />
          {/* Phase 15A — debrief rollup: "why your apps win/lose." */}
          <DebriefRollupCard />
          {/* Phase 16B — anonymous comparison vs same-country NGOs */}
          <PeerBenchmarksCard />
          {/* Phase 10.6 — "This Week" action center: opinionated next
              actions backed by /api/ai/ngo-readiness. Renders only when
              ui.this_week_home flag is on; otherwise falls through to
              the existing surfaces. */}
          <ThisWeekHome />
          {/* Phase 3.2 — opportunity feed first when matches are enabled,
              so the NGO immediately sees ranked grants. Falls through to
              the readiness console below. */}
          <MatchesCard limit={5} />
          <NgoReadinessConsole />
        </>
      )}
      {user.role === 'reviewer' && (
        <>
          {/* Phase 16E — throughput + SLA at the top so the reviewer
              knows immediately whether they're slipping. */}
          <ReviewerThroughputCard />
          {/* Phase 13.29 — reviewer action queue. Pending assignments
              top-of-page, then the existing detailed queue below. */}
          <ReviewerActionQueue />
          <ReviewerQueue />
        </>
      )}
      {user.role === 'admin' && (
        <>
          {/* Phase 5 — per-org AI budget gate + skipped rollup */}
          <AIBudgetAdminCard />
          {/* Phase 15C — customisable stage labels per org */}
          <StageLabelsEditor />
          {/* Phase 17D — donor merge tool */}
          <OrgMergeTool />
          <AdminOpsPanel />
        </>
      )}
    </div>
  );
}
