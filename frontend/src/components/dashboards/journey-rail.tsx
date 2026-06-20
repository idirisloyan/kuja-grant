'use client';

/**
 * Phase 99 — Persistent NGO journey rail.
 *
 * The full <JourneyTracker> on the NGO dashboard is great when the user
 * lands there, but the design backlog called out the wider gap: the
 * journey through-line (Build profile → Apply → Funded → Compliant →
 * Report) should be visible on every NGO screen, not a page they have
 * to visit.
 *
 * This component is the compact, persistent variant:
 *   - thin horizontal bar mounted in the (app) layout above main content
 *   - 6 stage dots + one-liner naming the next action + chevron link
 *   - dismissible per-session (sessionStorage; resets next login)
 *   - hidden on /dashboard (the full <JourneyTracker> renders there)
 *   - NGO-only (gated on user.role === 'ngo')
 *   - hidden when the journey is complete (all_done) — no nag once done
 *
 * Shares the same SWR key as <JourneyTracker> so the two render from one
 * fetch, no double-roundtrip.
 */

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, Circle, Lock, ArrowRight, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

interface Stage {
  key: string;
  label: string;
  why: string;
  status: 'done' | 'current' | 'locked';
}
interface NextAction {
  label: string;
  hint: string;
  href: string;
  unlocks?: string | null;
}
interface JourneyResp {
  success: boolean;
  stages?: Stage[];
  current_stage?: string;
  next_action?: NextAction;
  completion_pct?: number;
  all_done?: boolean;
}

const DISMISS_KEY = 'kuja_journey_rail_dismissed_v1';

export function JourneyRail() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  // sessionStorage guard initialised lazily so SSR / first-paint don't
  // mis-show then hide.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  });

  // Only NGOs see the rail. Donors/reviewers/admins have their own
  // workflow rails (queues, dashboards) that already orient them.
  const isNgo = user?.role === 'ngo';

  // Hide on the dashboard so the full <JourneyTracker> isn't duplicated.
  // Also hide on auth-adjacent and welcome paths even though the (app)
  // layout shouldn't render there — defensive in case a route slips in.
  const onDashboard = pathname === '/dashboard' || pathname === '/dashboard/';
  const onAuthPath = pathname?.startsWith('/login') || pathname?.startsWith('/network/join');

  const shouldFetch = isNgo && !dismissed && !onDashboard && !onAuthPath;

  const { data } = useSWR<JourneyResp>(
    shouldFetch ? '/journey/me' : null,
    (url: string) => api.get<JourneyResp>(url),
    // Match <JourneyTracker>'s implicit defaults — share the cache.
    { revalidateOnFocus: false },
  );

  if (!shouldFetch) return null;
  if (!data?.success || !data.stages?.length) return null;
  if (data.all_done) return null;

  const stages = data.stages;
  const next = data.next_action;
  const currentIdx = stages.findIndex((s) => s.status === 'current');
  const currentLabel = currentIdx >= 0 ? stages[currentIdx].label : (next?.label ?? 'Continue');

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    }
  };

  return (
    <aside
      role="status"
      aria-label="Your funding journey"
      className="border-b border-border bg-gradient-to-r from-card to-[hsl(var(--kuja-spark-soft))]/30 dark:to-[hsl(var(--kuja-spark-soft))]/10"
    >
      <div className="mx-auto max-w-[1400px] flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-2">
        {/* Stage dots — compact horizontal strip */}
        <ol className="hidden sm:flex items-center gap-1 shrink-0">
          {stages.map((s) => {
            const Icon = s.status === 'done' ? CheckCircle2
              : s.status === 'current' ? Circle
              : Lock;
            const cls = s.status === 'done'
              ? 'text-[hsl(var(--kuja-grow))]'
              : s.status === 'current'
                ? 'text-[hsl(var(--kuja-spark))]'
                : 'text-muted-foreground/40';
            return (
              <li key={s.key} title={s.label}>
                <Icon className={`w-3.5 h-3.5 ${cls}`} aria-hidden="true" />
              </li>
            );
          })}
        </ol>

        {/* Current stage + next action one-liner */}
        <div className="flex-1 min-w-0 text-xs">
          <span className="text-muted-foreground">You&apos;re at </span>
          <span className="font-semibold">{currentLabel}</span>
          {next && (
            <>
              <span className="text-muted-foreground"> · next: </span>
              <span className="font-medium truncate">{next.label}</span>
            </>
          )}
        </div>

        {/* CTA + dismiss */}
        {next?.href && (
          <Link
            href={next.href}
            className="hidden md:inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--kuja-clay))] hover:underline shrink-0"
          >
            Open <ArrowRight className="w-3 h-3" />
          </Link>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Hide journey rail for this session"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
