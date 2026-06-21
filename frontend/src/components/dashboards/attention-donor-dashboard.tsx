'use client';

/**
 * Kuja donor dashboard — Phase 48.
 *
 * The brief:
 *   Top: What needs your attention today
 *   Middle: Applications awaiting action · Reports awaiting review · Deadlines coming
 *   Lower: Portfolio insights (the existing rich cards as a collapsible)
 *
 * Cut: too many small metric cards, secondary charts above actionable items.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import {
  useApplications, useReports, useGrants,
} from '@/lib/hooks/use-api';
import {
  PageShell, PageHeader, PageAttention, PageMain, PageDetail,
  PageDetailSection, type AttentionItem,
} from '@/components/layout/page-shell';
import { TodayFocusBanner } from '@/components/dashboards/today-focus-banner';
import { DonorCommandCenter } from '@/components/dashboards/donor-command-center';
import { OneNumberCard } from '@/components/shared/one-number-card';
import { DonorPortfolioCard } from '@/components/dashboards/donor-portfolio-card';
import { DonorStatusBreakdownCard } from '@/components/dashboards/donor-status-breakdown-card';
import { DonorShortlistCard } from '@/components/dashboards/donor-shortlist-card';
import { DecisionTimeCard } from '@/components/dashboards/decision-time-card';
import { AwaitingDecisionCard } from '@/components/dashboards/awaiting-decision-card';
import { SectorRollupCard } from '@/components/dashboards/sector-rollup-card';
import { PostDeadlineCard } from '@/components/dashboards/post-deadline-card';
import { DonorScorecardCard } from '@/components/dashboards/donor-scorecard';
import { DecisionVelocityCard } from '@/components/dashboards/decision-velocity-card';
import { DonorOutreachRollupCard } from '@/components/dashboards/donor-outreach-rollup-card';
import { ReviewerWorkloadByDonorCard } from '@/components/dashboards/reviewer-workload-by-donor-card';
import { DonorAppealsCard } from '@/components/dashboards/donor-appeals-card';
import { DonorAppealSlaCard } from '@/components/dashboards/donor-appeal-sla-card';
import { AiHumanAgreementCard } from '@/components/dashboards/ai-human-agreement-card';
import { ReviewerTurnaroundCard } from '@/components/dashboards/reviewer-turnaround-card';
import { DecisionsByMonthCard } from '@/components/dashboards/decisions-by-month-card';
import { FirstTimeVsRepeatCard } from '@/components/dashboards/first-time-vs-repeat-card';
import { DecisionForecastCard } from '@/components/dashboards/decision-forecast-card';
import { DonorEoiCard } from '@/components/dashboards/donor-eoi-card';
import { PreemptionWatchCard } from '@/components/dashboards/preemption-watch-card';
import { CrossGrantPatternsCard } from '@/components/dashboards/cross-grant-patterns-card';
import { PortfolioRiskHeatmap } from '@/components/dashboards/portfolio-risk-heatmap';
import {
  FileText, BarChart3, Clock, ArrowRight, Briefcase, Lightbulb,
} from 'lucide-react';

export function AttentionDonorDashboard() {
  const user = useAuthStore((s) => s.user);

  const { data: pendingApps } = useApplications({ status: 'submitted' });
  const { data: pendingReps } = useReports({ status: 'submitted' });
  const { data: openGrants }  = useGrants({ status: 'open' });

  const submittedApps = pendingApps?.applications ?? [];
  const submittedReps = pendingReps?.reports ?? [];

  // "Closing soon" = grants with deadline in the next 14 days.
  const closingSoon = useMemo(() => {
    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    return (openGrants?.grants ?? []).filter((g) => {
      if (!g.deadline) return false;
      const t = new Date(g.deadline).getTime();
      return t > now && t - now < twoWeeks;
    });
  }, [openGrants]);

  // Phase 63 — name the entities (same pattern as Phase 62). First 2
  // names + "+N more". Pulls from grant_title / org_name (apps),
  // grant_title (reports), grant title (closing-soon).
  const appNames = submittedApps
    .map((a) => a.grant_title ? `"${a.grant_title}"` : (a.org_name || `App #${a.id}`))
    .slice(0, 2);
  const repNames = submittedReps
    .map((r) => r.grant_title ? `"${r.grant_title}"` : (r.org_name || `Report #${r.id}`))
    .slice(0, 2);
  const closingNames = closingSoon
    .map((g) => `"${g.title}"`)
    .slice(0, 2);
  const fmtList = (sample: string[], total: number) => {
    if (sample.length === 0) return '';
    const more = total - sample.length;
    return more > 0 ? `${sample.join(', ')} +${more} more` : sample.join(', ');
  };

  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    if (submittedApps.length > 0) {
      const list = fmtList(appNames, submittedApps.length);
      items.push({
        tone: 'warn',
        label: `${submittedApps.length} application${submittedApps.length === 1 ? '' : 's'} awaiting your review`,
        hint: list || undefined,
        action: <JumpLink href="/reviews" label="Review" />,
      });
    }
    if (submittedReps.length > 0) {
      const list = fmtList(repNames, submittedReps.length);
      items.push({
        tone: 'warn',
        label: `${submittedReps.length} report${submittedReps.length === 1 ? '' : 's'} awaiting review`,
        hint: list || undefined,
        action: <JumpLink href="/reports" label="Open" />,
      });
    }
    if (closingSoon.length > 0) {
      const list = fmtList(closingNames, closingSoon.length);
      items.push({
        tone: 'info',
        label: `${closingSoon.length} grant${closingSoon.length === 1 ? '' : 's'} closing in the next 2 weeks`,
        hint: list
          ? `${list}. Check application volume; consider extending or promoting.`
          : 'Check application volume; consider extending or promoting.',
        action: <JumpLink href="/grants" label="Open Grants" />,
      });
    }
    if (items.length === 0) {
      items.push({
        tone: 'good',
        label: 'Nothing needs your attention right now',
        hint: 'No pending applications or reports, no deadlines closing imminently.',
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    submittedApps, submittedReps, closingSoon,
    appNames.join('|'),
    repNames.join('|'),
    closingNames.join('|'),
  ]);

  if (!user) return null;
  const firstName = user.name?.split(' ')[0] ?? 'there';

  return (
    <PageShell>
      <PageHeader
        title={`Welcome back, ${firstName}.`}
        subtitle="What needs your attention today."
      />

      <TodayFocusBanner items={attention} />
      <PageAttention items={attention} />

      {/* Phase 166 — 12-month rolling portfolio summary. */}
      <DonorPortfolioCard />

      {/* Phase 206 — applications-by-status mini-tile. Drill into the
          applications list filtered by that status. */}
      <DonorStatusBreakdownCard />

      {/* Phase 213 — starred-applications shortlist. Self-gates when empty. */}
      <DonorShortlistCard />

      {/* Phase 220 — median decision time across the donor's grants. */}
      <DecisionTimeCard />

      {/* Phase 235 — applications scored, waiting on donor decision. */}
      <AwaitingDecisionCard />
      {/* Phase 259 — applications by primary sector. */}
      <SectorRollupCard />
      {/* Phase 263 — grants past deadline with un-reviewed submitted apps. */}
      <PostDeadlineCard />
      {/* Phase 274 — 90-day strongest + weakest criteria scorecard. */}
      <DonorScorecardCard />
      {/* Phase 284 — median decision velocity, funded vs declined. */}
      <DecisionVelocityCard />
      {/* Phase 293 — outreach started vs pending on declines. Self-gates when zero. */}
      <DonorOutreachRollupCard />
      {/* Phase 299 — review workload distribution + per-reviewer pace. */}
      <ReviewerWorkloadByDonorCard />
      {/* Phase 313 — pending appeals on this donor's grants. */}
      <DonorAppealsCard />
      {/* Phase 317 — appeals on this donor's grants > 7 days old. */}
      <DonorAppealSlaCard />
      {/* Phase 323 — criteria where AI and human reviewers diverge most. */}
      <AiHumanAgreementCard />
      {/* Phase 328 — slowest reviewers by avg days to complete. */}
      <ReviewerTurnaroundCard />
      {/* Phase 332 — 6-month decisions trend (funded vs declined). */}
      <DecisionsByMonthCard />
      {/* Phase 338 — first-time vs repeat applicant NGO mix. */}
      <FirstTimeVsRepeatCard />
      {/* Phase 345 — month-end decision forecast from 90-day pace. */}
      <DecisionForecastCard />
      {/* Phase 349 — recent expressions of interest. */}
      <DonorEoiCard />

      {/* Phase 99 — OneNumberCard portfolio at-a-glance row. Replaces the
          metric-soup pattern with three calm numbers + one next action
          each. Counts come from the same hooks the lists below use, so
          there's no extra fetch and no drift between rail and content. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
        <OneNumberCard
          label="Open grants"
          value={String((openGrants?.grants ?? []).length)}
          nextAction="Open all grants"
          nextActionHref="/grants"
          tone={(openGrants?.grants ?? []).length === 0 ? 'warning' : 'neutral'}
        />
        <OneNumberCard
          label="Applications awaiting action"
          value={String(submittedApps.length)}
          nextAction={submittedApps.length > 0 ? 'Open reviews' : 'See past reviews'}
          nextActionHref={submittedApps.length > 0 ? '/reviews' : '/reviews?status=scored'}
          tone={submittedApps.length > 0 ? 'warning' : 'success'}
        />
        <OneNumberCard
          label="Reports awaiting review"
          value={String(submittedReps.length)}
          nextAction={submittedReps.length > 0 ? 'Open reports' : 'See past reports'}
          nextActionHref={submittedReps.length > 0 ? '/reports' : '/reports?status=scored'}
          tone={submittedReps.length > 0 ? 'warning' : 'success'}
        />
      </div>

      <PageMain>
        {/* My grants — quick portfolio look without a chart */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              My open grants
            </h2>
            <Link
              href="/grants"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Open Grants <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(openGrants?.grants ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No open grants right now.</p>
          ) : (
            <ul className="space-y-2">
              {(openGrants?.grants ?? []).slice(0, 4).map((g) => (
                <li key={g.id} className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3">
                  <Link href={`/grants/${g.id}`} className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{g.title}</div>
                    <div className="text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      {g.total_funding && <span>{g.total_funding.toLocaleString()} {g.currency || ''}</span>}
                      {g.deadline && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          closes {new Date(g.deadline).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reports awaiting review */}
        {submittedReps.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Reports awaiting review
              </h2>
              <Link
                href="/reports"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Open Reports <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {submittedReps.slice(0, 4).map((r) => (
                <li key={r.id} className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3">
                  <Link href={`/reports/${r.id}`} className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {r.grant_title || `Report #${r.id}`}
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : ''}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Apps awaiting action */}
        {submittedApps.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Applications awaiting action
              </h2>
              <Link
                href="/reviews"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Open Reviews <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {submittedApps.slice(0, 4).map((a) => (
                <li key={a.id} className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3">
                  <Link href={`/applications/${a.id}`} className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {a.grant_title || `Application #${a.id}`}
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {a.org_name && <>by {a.org_name}</>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageMain>

      {/* Portfolio insights — collapsible. The existing rich cards live here. */}
      <PageDetail>
        <PageDetailSection title="Portfolio insights" icon={Lightbulb} defaultOpen={false}>
          <div className="space-y-4">
            <PreemptionWatchCard scope="me" />
            <CrossGrantPatternsCard />
            <PortfolioRiskHeatmap />
            <DonorCommandCenter />
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
