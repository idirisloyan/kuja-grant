'use client';

/**
 * Phase 92 — Continuous NGO journey tracker.
 *
 * The team named this the highest-value remaining product gap:
 *
 *   "Build your organization profile → demonstrate readiness → apply
 *    → receive funding → remain compliant → report impact."
 *
 * This component is that visible journey. One current stage, one next
 * action with what completing it unlocks, completed milestones shown
 * as done. Lives at the top of the NGO dashboard above attention items
 * so the user always sees the through-line connecting all the surfaces.
 *
 * The thread is: 'I am building, I am ready, I am applying, I am
 * funded, I am compliant, I am reporting impact.' No moment in Kuja
 * should feel like a dead end — the journey tells you what's next.
 */

import useSWR from 'swr';
import Link from 'next/link';
import {
  CheckCircle2, Circle, Lock, ArrowRight, Sparkles, Compass,
} from 'lucide-react';
import { api } from '@/lib/api';

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

export function JourneyTracker({ className = '' }: { className?: string }) {
  const { data, isLoading, error } = useSWR<JourneyResp>(
    '/journey/me',
    (url: string) => api.get<JourneyResp>(url),
  );

  if (isLoading) return <div className={`kuja-shimmer h-32 rounded-lg ${className}`} />;
  if (error || !data || !data.success || !data.stages) return null;

  const stages = data.stages;
  const next = data.next_action;
  const pct = data.completion_pct ?? 0;

  return (
    <section className={`border border-border bg-gradient-to-br from-card to-[hsl(var(--kuja-spark-soft))]/30 rounded-lg p-5 space-y-4 ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[hsl(var(--kuja-spark))]" />
          <h3 className="font-semibold text-sm">Your funding journey</h3>
          <span className="text-[10px] text-muted-foreground">
            {pct}% complete
          </span>
        </div>
      </header>

      {/* Progress rail: a horizontal row of 6 stage dots with connecting
          line. Hovering / focusing a dot shows the stage label tooltip. */}
      <ol className="grid grid-cols-6 gap-1">
        {stages.map((s, i) => {
          const isDone = s.status === 'done';
          const isCurrent = s.status === 'current';
          const Icon = isDone ? CheckCircle2 : isCurrent ? Circle : Lock;
          const cls = isDone
            ? 'text-[hsl(var(--kuja-grow))]'
            : isCurrent
              ? 'text-[hsl(var(--kuja-spark))]'
              : 'text-muted-foreground/40';
          const lineCls = i === 0
            ? 'hidden'
            : isDone || isCurrent
              ? 'bg-[hsl(var(--kuja-grow))]/50'
              : 'bg-muted-foreground/20';
          return (
            <li key={s.key} className="relative flex flex-col items-center">
              <div className={`hidden sm:block absolute top-3 right-1/2 w-full h-0.5 ${lineCls}`} />
              <Icon className={`w-6 h-6 relative z-10 ${cls} ${isCurrent ? 'animate-pulse' : ''}`} />
              <span className={`mt-1.5 text-[10px] text-center leading-tight ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Next action — the single sentence the user should act on now */}
      {next && (
        <div className="border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 rounded-md p-3 space-y-1.5">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-clay))] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Your next step
              </div>
              <div className="font-semibold text-sm mt-0.5">{next.label}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {next.hint}
              </div>
              {next.unlocks && (
                <div className="text-[11px] text-[hsl(var(--kuja-grow))] mt-1.5 leading-relaxed">
                  <strong className="font-semibold">This unlocks:</strong> {next.unlocks}
                </div>
              )}
            </div>
            <Link
              href={next.href}
              className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-xs font-semibold px-3 py-1.5"
            >
              Open <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
