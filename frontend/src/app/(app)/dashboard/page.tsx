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

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { tenantKind } from '@/lib/tenant';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
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
  const kind = tenantKind(network);
  const isNearFlavor = kind === 'network';

  // Proximate (fund) and Saxansaxo (ops) are NOT flavors of this dashboard —
  // they have their own home surfaces. The login flow already redirects them,
  // but if a user lands here directly (a bookmark, a stale link), send them to
  // their tenant home rather than render a Kuja/NEAR dashboard they must never
  // see. Defense-in-depth alongside `isNearFlavor` now being network-only.
  const { t } = useTranslation();
  const { persona, isLoading: personaLoading } = useProximatePersona();
  // Only send a Proximate user to a home we KNOW they can open. A resolved
  // 'none' persona has no Proximate workspace, so we must NOT auto-redirect it
  // (that risks a loop against a page that would bounce them straight back) —
  // we show a neutral message instead, and still never render the NEAR/Kuja
  // dashboard.
  const proximateHome =
    persona === 'donor' ? '/proximate/donor'
      : persona === 'ob' || persona === 'admin' ? '/proximate/admin'
      : null;
  useEffect(() => {
    if (kind === 'ops') { window.location.href = '/saxansaxo/admin'; return; }
    if (kind === 'fund' && proximateHome) { window.location.href = proximateHome; }
  }, [kind, proximateHome]);

  const shimmer = (
    <div className="space-y-4">
      <div className="kuja-shimmer h-28 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="kuja-shimmer h-56 rounded-xl" />
        <div className="kuja-shimmer h-56 rounded-xl" />
        <div className="kuja-shimmer h-56 rounded-xl" />
      </div>
    </div>
  );

  if (kind === 'ops') return shimmer;
  if (kind === 'fund') {
    // Resolving persona, or about to redirect to their real home → loader.
    if (personaLoading || proximateHome) return shimmer;
    // Resolved but no Proximate workspace: neutral, NON-looping fallback.
    return (
      <div className="mx-auto max-w-md space-y-3 py-10 text-center">
        <h1 className="kuja-display text-2xl">{t('proximate.dashboard.no_home_title')}</h1>
        <p className="text-muted-foreground">{t('proximate.dashboard.no_home_body')}</p>
        <a
          href="/proximate/donor"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--kuja-clay))] hover:underline"
        >
          {t('proximate.dashboard.go_to_fund')} →
        </a>
      </div>
    );
  }

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
