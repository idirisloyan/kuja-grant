'use client';

/**
 * NEAR operator (admin) dashboard — Phase 48.
 *
 * The brief: this should feel "operational and decisive".
 *
 *   Top action strip: memberships needing review · declarations
 *                     awaiting action · grants ready to release ·
 *                     trust/recheck issues
 *   Middle: Fund → Window operational tree · current crisis activity
 *   Lower:  reporting / governance health (existing NearOperatorConsole)
 *
 * The dashboard surfaces *counts* in the attention strip and offers a
 * one-click jump to the right list page. The rich existing operator
 * console moves into a collapsible "More detail" so power users keep
 * everything they had, just out of the default view.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import {
  useDeclarations, useFunds, useLatestCrisisReport, usePendingMemberships,
} from '@/lib/hooks/use-api';
import {
  PageShell, PageHeader, PageAttention, PageMain, PageDetail,
  PageDetailSection, type AttentionItem,
} from '@/components/layout/page-shell';
import { SignerCoachCard } from '@/components/dashboards/signer-coach-card';
import { StaleReviewsCard } from '@/components/dashboards/stale-reviews-card';
import { AdminStatusCard } from '@/components/dashboards/admin-status-card';
import { AuditIntegrityCard } from '@/components/dashboards/audit-integrity-card';
import { WebhookHealthCard } from '@/components/dashboards/webhook-health-card';
import { ReviewerCoiRollupCard } from '@/components/dashboards/reviewer-coi-rollup-card';
import { ReviewerOutliersCard } from '@/components/dashboards/reviewer-outliers-card';
import { SlaBreachesCard } from '@/components/dashboards/sla-breaches-card';
import { DataIntegrityCard } from '@/components/dashboards/data-integrity-card';
import { AppealStatsCard } from '@/components/dashboards/appeal-stats-card';
import { AiCostForecastCard } from '@/components/dashboards/ai-cost-forecast-card';
import { NotificationVolumeCard } from '@/components/dashboards/notification-volume-card';
import { ReviewerScoreboardCard } from '@/components/dashboards/reviewer-scoreboard-card';
import { ApplicationsByStatusCard } from '@/components/dashboards/applications-by-status-card';
import { UsageTrendCard } from '@/components/dashboards/usage-trend-card';
import { ExpiredScreeningsCard } from '@/components/dashboards/expired-screenings-card';
import { StaleGrantsCard } from '@/components/dashboards/stale-grants-card';
import { UsersWithoutTwoFaCard } from '@/components/dashboards/users-without-2fa-card';
import { DuplicateOrgsCard } from '@/components/dashboards/duplicate-orgs-card';
import { AiCostPerAppCard } from '@/components/dashboards/ai-cost-per-app-card';
import { TodayFocusBanner } from '@/components/dashboards/today-focus-banner';
import { NearOperatorConsole } from '@/components/dashboards/near-operator-console';
import { ShieldAlert, Wallet, Activity, ArrowRight } from 'lucide-react';

export function AttentionOperatorDashboard() {
  const user = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);

  // Pull lean data hooks. Each is independent; SWR dedupes on the page.
  const { data: pendingMems } = usePendingMemberships('pending');
  const { data: underReview } = usePendingMemberships('under_review');
  const { data: drafts }      = useDeclarations('draft');
  const { data: inReview }    = useDeclarations('in_review');
  const { data: active }      = useDeclarations('signed_active');
  const { data: funds }       = useFunds();
  const { data: crisis }      = useLatestCrisisReport();

  const memCount      = (pendingMems?.memberships?.length ?? 0)
                      + (underReview?.memberships?.length ?? 0);
  const draftCount    = drafts?.declarations?.length ?? 0;
  const inReviewCount = inReview?.declarations?.length ?? 0;
  // "Ready to release" = signed_active declarations whose applicants
  // haven't been notified yet.
  const readyRelease  = (active?.declarations ?? []).filter(
    (d) => !d.applicants_notified_at,
  );

  // Phase 62 — name the entities. The attention strip used to say
  // "2 members awaiting review" — fine, but operators want to know
  // WHICH orgs. Lightweight deterministic enrichment: pull the first 2
  // org names from each list and surface them in the hint.
  const memberOrgs = [
    ...(pendingMems?.memberships ?? []),
    ...(underReview?.memberships ?? []),
  ];
  const memberSample = memberOrgs
    .map((m) => m.org_name || m.org?.name || `Org #${m.org_id}`)
    .slice(0, 2);

  const readyReleaseSample = readyRelease
    .map((d) => d.title)
    .filter(Boolean)
    .slice(0, 2);

  const draftSample = (drafts?.declarations ?? [])
    .map((d) => d.title)
    .filter(Boolean)
    .slice(0, 2);

  const inReviewSample = (inReview?.declarations ?? [])
    .map((d) => d.title)
    .filter(Boolean)
    .slice(0, 2);

  // Format helper: "Foo, Bar" or "Foo, Bar +1 more"
  const fmtList = (sample: string[], total: number) => {
    if (sample.length === 0) return '';
    const more = total - sample.length;
    return more > 0 ? `${sample.join(', ')} +${more} more` : sample.join(', ');
  };

  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    if (memCount > 0) {
      const list = fmtList(memberSample, memCount);
      items.push({
        tone: 'warn',
        label: `${memCount} member${memCount === 1 ? '' : 's'} awaiting review`,
        hint: list
          ? `${list}. Run trust process, review capacity assessment, decide.`
          : 'Run trust process, review capacity assessment, decide.',
        action: <JumpLink href="/admin/network-memberships" label="Review" />,
      });
    }
    if (readyRelease.length > 0) {
      const list = fmtList(readyReleaseSample, readyRelease.length);
      items.push({
        tone: 'accent',
        label: `${readyRelease.length} declaration${readyRelease.length === 1 ? '' : 's'} ready to release`,
        hint: list
          ? `${list}. Flip the auto-created grant drafts to open and notify shortlisted NGOs.`
          : 'Signatures complete; flip the auto-created grant drafts to open and notify shortlisted NGOs.',
        action: <JumpLink href={`/admin/declarations/${readyRelease[0].id}`} label="Open" />,
      });
    }
    if (inReviewCount > 0) {
      const list = fmtList(inReviewSample, inReviewCount);
      items.push({
        tone: 'info',
        label: `${inReviewCount} declaration${inReviewCount === 1 ? '' : 's'} waiting on committee signatures`,
        hint: list
          ? `${list}. No action required from you unless you also hold an OB seat.`
          : 'No action required from you unless you also hold an OB seat.',
        action: <JumpLink href="/admin/declarations" label="Watch" />,
      });
    }
    if (draftCount > 0) {
      const list = fmtList(draftSample, draftCount);
      items.push({
        tone: 'muted',
        label: `${draftCount} draft declaration${draftCount === 1 ? '' : 's'}`,
        hint: list
          ? `${list}. Add committee members and submit for signature.`
          : 'Add committee members and submit for signature.',
        action: <JumpLink href="/admin/declarations" label="Open drafts" />,
      });
    }
    if (items.length === 0) {
      items.push({
        tone: 'good',
        label: 'Nothing needs your attention right now',
        hint: 'No pending memberships, no draft or in-review declarations, nothing waiting to release. Quiet.',
      });
    }
    return items;
    // memberSample / readyReleaseSample / draftSample / inReviewSample
    // are derived deterministically from the SWR hook data. Including
    // their joined string fingerprints in the dep array keeps the memo
    // stable without re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    memCount, draftCount, inReviewCount, readyRelease,
    memberSample.join('|'),
    readyReleaseSample.join('|'),
    draftSample.join('|'),
    inReviewSample.join('|'),
  ]);

  if (!user) return null;
  const firstName = user.name?.split(' ')[0] ?? 'there';

  return (
    <PageShell>
      <PageHeader
        title={`Good morning, ${firstName}.`}
        subtitle={network?.name
          ? `${network.name} — fund operations console.`
          : 'Fund operations console.'}
      />

      {/* Phase 82 — Today's focus banner. */}
      <TodayFocusBanner items={attention} />
      <PageAttention items={attention} />

      <PageMain>
        {/* Fund → Window operational tree — lean version */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              Fund operations
            </h2>
            <Link
              href="/admin/funds"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Open Funds &amp; Windows <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(funds?.funds ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No funds yet.</p>
          ) : (
            <ul className="space-y-2">
              {(funds?.funds ?? []).slice(0, 3).map((f) => (
                <li key={f.id} className="text-xs flex items-center justify-between gap-3 border border-border rounded-md p-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{f.name}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {f.window_count ?? 0} window{(f.window_count ?? 0) === 1 ? '' : 's'}
                      {f.total_pool_amount ? <> · {f.total_pool_amount.toLocaleString()} {f.currency || ''}</> : null}
                    </div>
                  </div>
                  <Link href={`/admin/funds`} className="text-xs underline hover:no-underline text-muted-foreground">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Current crisis activity */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              Crisis monitoring
            </h2>
            <Link
              href="/admin/crisis-monitoring"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Open Crisis Monitoring <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {crisis?.report ? (
            <div className="text-xs space-y-1">
              <div className="font-medium text-sm">
                Edition #{crisis.report.id} ·{' '}
                {new Date(crisis.report.period_start).toLocaleDateString()} →{' '}
                {new Date(crisis.report.period_end).toLocaleDateString()}
              </div>
              <div className="text-muted-foreground">
                {crisis.report.published_at && (
                  <>published {new Date(crisis.report.published_at).toLocaleDateString()} · </>
                )}
                {crisis.report.row_count} signal{crisis.report.row_count === 1 ? '' : 's'}
                {crisis.report.flagged_row_count > 0 && (
                  <> · <span className="text-[hsl(var(--kuja-sun))] font-semibold">{crisis.report.flagged_row_count} flagged</span></>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No published crisis monitoring report yet.</p>
          )}
        </section>

        {/* Phase 80 — personal signing-pace coach card. Visible if the
            operator is an OB committee member (has signing assignments).
            Card auto-hides via the show flag when there's nothing to
            coach on. */}
        <SignerCoachCard />
        {/* Phase 226 — Reviewers with overdue assignments (>14 days). */}
        <StaleReviewsCard />
        {/* Phase 256 — combined cron + AI cost status. Self-gates when all green. */}
        <AdminStatusCard />
        {/* Phase 279 — audit chain integrity at-a-glance. Always visible. */}
        <AuditIntegrityCard />
        {/* Phase 286 — 24h webhook delivery health. Self-gates when no traffic. */}
        <WebhookHealthCard />
        {/* Phase 292 — reviewer COI disclosures rollup. Self-gates when zero. */}
        <ReviewerCoiRollupCard />
        {/* Phase 298 — reviewer calibration drift (mean score > 1.5σ from platform). */}
        <ReviewerOutliersCard />
        {/* Phase 301 — SLA breaches: apps past expected decision deadline. */}
        <SlaBreachesCard />
        {/* Phase 305 — orphan FK detector. Self-gates when zero. */}
        <DataIntegrityCard />
        {/* Phase 316 — appeal resolution stats (30d). Self-gates when zero. */}
        <AppealStatsCard />
        {/* Phase 322 — projected monthly AI cost from trailing 7d. */}
        <AiCostForecastCard />
        {/* Phase 325 — top 5 noisiest notification recipients (7d). */}
        <NotificationVolumeCard />
        {/* Phase 333 — per-reviewer scoreboard, completion % ascending. */}
        <ReviewerScoreboardCard />
        {/* Phase 337 — applications by status stacked bar. */}
        <ApplicationsByStatusCard />
        {/* Phase 347 — 14-day usage sparklines (apps, AI, decisions). */}
        <UsageTrendCard />
        {/* Phase 351 — NGOs without recent sanctions screening. */}
        <ExpiredScreeningsCard />
        {/* Phase 353 — published grants still open past their deadline. */}
        <StaleGrantsCard />
        {/* Phase 357 — privileged users without TOTP 2FA. */}
        <UsersWithoutTwoFaCard />
        <DuplicateOrgsCard />
        <AiCostPerAppCard />
      </PageMain>

      {/* Full operator console as a collapsible — power users still have it */}
      <PageDetail>
        <PageDetailSection
          title="Full operator console (charts + governance health)"
          icon={ShieldAlert}
          defaultOpen={false}
        >
          <NearOperatorConsole />
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

