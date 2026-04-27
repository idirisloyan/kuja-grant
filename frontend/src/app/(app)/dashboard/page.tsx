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

      {user.role === 'donor' && <DonorCommandCenter />}
      {user.role === 'ngo' && (
        <>
          {/* Phase 3.2 — opportunity feed first when matches are enabled,
              so the NGO immediately sees ranked grants. Falls through to
              the readiness console below. */}
          <MatchesCard limit={5} />
          <NgoReadinessConsole />
        </>
      )}
      {user.role === 'reviewer' && <ReviewerQueue />}
      {user.role === 'admin' && <AdminOpsPanel />}
    </div>
  );
}
