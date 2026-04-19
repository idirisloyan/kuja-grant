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
import { DonorCommandCenter } from '@/components/dashboards/donor-command-center';
import { NgoReadinessConsole } from '@/components/dashboards/ngo-readiness-console';
import { ReviewerQueue } from '@/components/dashboards/reviewer-queue';
import { AdminOpsPanel } from '@/components/dashboards/admin-ops-panel';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

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

  return (
    <div className="space-y-6">
      {/* Welcome line */}
      <div>
        <h1 className="kuja-display text-3xl">
          {_greeting()}, <span className="text-[hsl(var(--kuja-clay-dark))]">{user.name?.split(' ')[0] ?? 'there'}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {_subtitle(user.role)}
        </p>
      </div>

      {user.role === 'donor' && <DonorCommandCenter />}
      {user.role === 'ngo' && <NgoReadinessConsole />}
      {user.role === 'reviewer' && <ReviewerQueue />}
      {user.role === 'admin' && <AdminOpsPanel />}
    </div>
  );
}

function _greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up early';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function _subtitle(role: string) {
  switch (role) {
    case 'donor':    return 'Your portfolio command center — AI surfaces what needs attention today.';
    case 'ngo':      return 'Your readiness console — coached toward your next winning application.';
    case 'reviewer': return 'Your review queue — AI-prioritized and ready to compare.';
    case 'admin':    return 'Operations overview with live AI health and anomaly detection.';
    default:         return 'Your Kuja workspace.';
  }
}
