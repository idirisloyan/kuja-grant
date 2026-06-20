'use client';

/**
 * OneNumberCard — Phase 98.4 (design backlog Wave 1)
 *
 * Disciplined dashboard card: ONE big number, ONE next action, optionally
 * ONE peer comparison. Anything else does not belong on the card.
 *
 * Why: dashboards rot into metric soup. This component enforces the
 * "one number per card" discipline at the component level so reviewers
 * cannot quietly add three more KPIs.
 *
 * The compliance-coach card on the NGO dashboard is the reference model.
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Card label, e.g. "On-time reporting". */
  label: string;
  /** The single big number. Pre-formatted string ("84%", "12", "$42K"). */
  value: string;
  /** Optional small comparison line, e.g. "Peer median 71%". */
  comparison?: string | null;
  /** Optional comparison direction icon — up = better than peer, etc. */
  trend?: 'up' | 'down' | 'flat' | null;
  /** The single next-action label, e.g. "Catch up on 2 overdue reports". */
  nextAction?: string;
  /** Where the next action takes you. If absent, no link is rendered. */
  nextActionHref?: string;
  /** Optional small icon for the label. */
  icon?: LucideIcon;
  /** Tone of the value: success when good news, warning when needs attention. */
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  className?: string;
}

const TONE_VALUE: Record<string, string> = {
  neutral: 'text-foreground',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-rose-700',
};

export function OneNumberCard({
  label,
  value,
  comparison,
  trend,
  nextAction,
  nextActionHref,
  icon: Icon,
  tone = 'neutral',
  className,
}: Props) {
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        'flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-[0_1px_0_0_rgba(0,0,0,0.02)]',
        className,
      )}
    >
      <div>
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </div>
        <div className={cn('mt-2 font-serif text-4xl font-semibold leading-none', TONE_VALUE[tone])}>
          {value}
        </div>
        {comparison && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            {trend && <TrendIcon className="h-3 w-3" />}
            {comparison}
          </div>
        )}
      </div>
      {nextAction && (
        nextActionHref ? (
          <Link
            href={nextActionHref}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--kuja-clay))] hover:underline"
          >
            {nextAction}
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <div className="mt-3 text-xs text-muted-foreground">{nextAction}</div>
        )
      )}
    </div>
  );
}
