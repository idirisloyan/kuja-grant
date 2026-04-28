'use client';

/**
 * ComplianceState — Phase 10.7
 *
 * Four-state taxonomy for compliance / sanctions / verification surfaces.
 * The team's spec: "every compliance/risk screen should distinguish:
 *   confirmed issue
 *   likely issue
 *   missing evidence
 *   manual follow-up recommended"
 *
 * This primitive renders a single state pill with consistent color +
 * icon vocabulary. Use it everywhere a compliance result lands so
 * donors and admins read the same signal across surfaces.
 *
 * State semantics:
 *   confirmed — a sanctioned name matched, registry returned ineligible,
 *               document is forged/expired and verified so. Donors should
 *               treat as a hard block until manually overridden.
 *   likely    — high-confidence pattern (fuzzy name match >85%, expired
 *               cert with grace period, ownership ambiguity). Donor
 *               judgment required, but lean toward escalate.
 *   missing   — we couldn't run the check (registry timeout, no doc
 *               uploaded). Don't penalize the NGO; surface as gap.
 *   followup  — automated check passed but flagged something that
 *               warrants a human eye (recent name change, unusual
 *               structure). Manual review recommended.
 */

import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, AlertOctagon, FileQuestion, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ComplianceStateKind = 'clear' | 'confirmed' | 'likely' | 'missing' | 'followup';

interface Props {
  state: ComplianceStateKind;
  /** Short description rendered next to the pill. Optional. */
  detail?: string;
  /** Render as a row instead of just a pill. */
  variant?: 'pill' | 'row';
  /** When variant=row, optional action element on the right. */
  action?: ReactNode;
  className?: string;
}

const stateConfig = {
  clear: {
    icon: CheckCircle2,
    bg: 'bg-[hsl(142_68%_96%)]',
    border: 'border-[hsl(var(--kuja-grow))]/30',
    text: 'text-[hsl(var(--kuja-grow))]',
    label: 'Clear',
    desc: 'No issues found in our checks.',
  },
  confirmed: {
    icon: AlertOctagon,
    bg: 'bg-[hsl(0_85%_96%)]',
    border: 'border-[hsl(var(--kuja-flag))]/40',
    text: 'text-[hsl(var(--kuja-flag))]',
    label: 'Confirmed issue',
    desc: 'Hard block until manually overridden.',
  },
  likely: {
    icon: AlertTriangle,
    bg: 'bg-[hsl(38_92%_96%)]',
    border: 'border-[hsl(var(--kuja-sun))]/40',
    text: 'text-[hsl(var(--kuja-sun))]',
    label: 'Likely issue',
    desc: 'High confidence; lean toward escalation.',
  },
  missing: {
    icon: FileQuestion,
    bg: 'bg-muted/40',
    border: 'border-border',
    text: 'text-muted-foreground',
    label: 'Missing evidence',
    desc: "Couldn't run the check; gap, not a fail.",
  },
  followup: {
    icon: Eye,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    label: 'Follow-up recommended',
    desc: 'Automated check passed; human eye warranted.',
  },
} as const;

export function ComplianceState({ state, detail, variant = 'pill', action, className }: Props) {
  const cfg = stateConfig[state];
  const Icon = cfg.icon;

  if (variant === 'pill') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
          cfg.bg,
          cfg.border,
          cfg.text,
          className,
        )}
        title={cfg.desc}
      >
        <Icon className="h-3 w-3" />
        <span>{cfg.label}</span>
        {detail && <span className="font-normal normal-case opacity-80">— {detail}</span>}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-md border-l-4 p-3',
        cfg.bg,
        cfg.border,
        className,
      )}
    >
      <div className="flex items-start gap-2 min-w-0">
        <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', cfg.text)} />
        <div className="min-w-0">
          <div className={cn('text-xs font-bold uppercase tracking-wider', cfg.text)}>
            {cfg.label}
          </div>
          {detail && <div className="text-sm text-foreground mt-0.5">{detail}</div>}
          <div className="text-[10px] text-muted-foreground italic mt-0.5">{cfg.desc}</div>
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
