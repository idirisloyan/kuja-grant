'use client';

/**
 * OnboardingChecklist — Phase 17B (May 2026).
 *
 * Renders on the NGO dashboard until all three first-run steps are
 * done. PMO transfer pattern: "Empty states earn their space" — the
 * card vanishes once the NGO has activated, so power users don't see
 * decorative checklist clutter on every dashboard visit.
 *
 * Driven by /api/dashboard/onboarding (server-side computation so the
 * same activation funnel powers analytics later).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, Circle, ArrowRight, Sparkles, Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  label: string;
  caption: string;
  done: boolean;
  href: string;
}

interface OnboardingResp {
  success: boolean;
  reason?: string;
  steps?: Step[];
  done_count?: number;
  total_count?: number;
  all_done?: boolean;
  next_step?: Step | null;
}

export function OnboardingChecklist() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [data, setData] = useState<OnboardingResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || (user.role !== 'ngo' && user.role !== 'donor')) return;
    let cancelled = false;
    api.get<OnboardingResp>('/api/dashboard/onboarding')
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user || (user.role !== 'ngo' && user.role !== 'donor')) return null;

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading onboarding…
        </div>
      </Card>
    );
  }
  if (!data || !data.success || data.all_done) return null;

  const steps = data.steps || [];
  const done = data.done_count ?? 0;
  const total = data.total_count ?? steps.length;
  const next = data.next_step;

  return (
    <Card className="p-4 sm:p-5 border-[hsl(var(--kuja-clay))]/40 bg-gradient-to-br from-background to-[hsl(var(--kuja-sand))]/30">
      <div className="mb-3 flex items-start gap-2 flex-wrap">
        <Sparkles className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Get set up
          </div>
          <h3 className="kuja-display text-lg">{done} of {total} done — let&apos;s finish strong</h3>
          <p className="text-xs text-muted-foreground">
            These three steps unlock matches, auto-fill, and your trust profile.
          </p>
        </div>
        {next && (
          <Button
            size="sm"
            onClick={() => router.push(next.href)}
            className="shrink-0"
          >
            {next.label}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.id}
            className={cn(
              'flex items-start gap-2 rounded-md border border-[hsl(var(--border))] p-2',
              s.done ? 'opacity-60' : 'hover:bg-[hsl(var(--kuja-sand))]/40 cursor-pointer',
            )}
            onClick={() => { if (!s.done) router.push(s.href); }}
          >
            {s.done
              ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--kuja-grow))]" aria-hidden="true" />
              : <Circle className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--kuja-ink-soft))]" aria-hidden="true" />}
            <div className="flex-1 min-w-0">
              <div className={cn('text-sm font-medium', s.done && 'line-through')}>
                {s.label}
              </div>
              {!s.done && (
                <div className="text-[11px] text-muted-foreground">{s.caption}</div>
              )}
            </div>
            {!s.done && (
              <ArrowRight className="h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground" />
            )}
          </li>
        ))}
      </ul>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-[hsl(var(--kuja-sand))]/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-[hsl(var(--kuja-clay))] transition-all"
          style={{ width: total ? `${(done / total) * 100}%` : '0%' }}
        />
      </div>
    </Card>
  );
}
