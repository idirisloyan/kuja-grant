'use client';

/**
 * Kuja Dashboard — Phase 48 rebuild around "what needs attention now".
 *
 * Routes to one of four role × flavor attention-first dashboards
 * (see docs/DESIGN_PRINCIPLES.md). Each dashboard leads with an
 * attention strip backed by live data, surfaces 2-4 focused work
 * sections, and tucks the existing rich analytics into a
 * "Portfolio insights" / "Full operator console" / "Readiness" /
 * "Full member console" collapsible so nothing is lost.
 *
 * Reviewer + Kuja-admin paths still use the existing rich consoles
 * (out of scope for this phase's brief, which is Kuja donor/NGO +
 * NEAR operator/member).
 */

import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { AttentionDonorDashboard } from '@/components/dashboards/attention-donor-dashboard';
import { AttentionNgoDashboard } from '@/components/dashboards/attention-ngo-dashboard';
import { AttentionOperatorDashboard } from '@/components/dashboards/attention-operator-dashboard';
import { AttentionMemberDashboard } from '@/components/dashboards/attention-member-dashboard';
import { ReviewerQueue } from '@/components/dashboards/reviewer-queue';
import { ReviewerActionQueue } from '@/components/dashboards/reviewer-action-queue';
import { ReviewerThroughputCard } from '@/components/dashboards/reviewer-throughput-card';
import { NextReviewCta } from '@/components/dashboards/next-review-cta';
import { AdminOpsPanel } from '@/components/dashboards/admin-ops-panel';
import { AIBudgetAdminCard } from '@/components/dashboards/ai-budget-admin-card';
import { StageLabelsEditor } from '@/components/dashboards/stage-labels-editor';
import { OrgMergeTool } from '@/components/dashboards/org-merge-tool';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const isNearFlavor = !!network?.slug && network.slug !== 'kuja';

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

  // --- NEAR flavor ---------------------------------------------------------
  if (isNearFlavor) {
    if (user.role === 'admin') return <AttentionOperatorDashboard />;
    if (user.role === 'ngo')   return <AttentionMemberDashboard />;
    // donor / reviewer on NEAR — fall through to a minimal placeholder
    return (
      <div className="space-y-3 text-sm">
        <h1 className="kuja-display text-2xl">Welcome.</h1>
        <p className="text-muted-foreground">
          This role doesn&rsquo;t have a configured dashboard on {network?.name ?? 'this network'} yet.
        </p>
      </div>
    );
  }

  // --- Kuja flavor ---------------------------------------------------------
  if (user.role === 'donor') return <AttentionDonorDashboard />;
  if (user.role === 'ngo')   return <AttentionNgoDashboard />;

  if (user.role === 'reviewer') {
    return (
      <div className="space-y-6">
        <NextReviewCta />
        <ReviewerThroughputCard />
        <ReviewerActionQueue />
        <ReviewerQueue />
      </div>
    );
  }

  if (user.role === 'admin') {
    return (
      <div className="space-y-6">
        <AIBudgetAdminCard />
        <StageLabelsEditor />
        <OrgMergeTool />
        <AdminOpsPanel />
      </div>
    );
  }

  return null;
}
