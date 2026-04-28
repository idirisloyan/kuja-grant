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
import { useTranslation } from '@/lib/hooks/use-translation';

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
    labelKey: 'compliance_state.clear.label',
    descKey: 'compliance_state.clear.desc',
  },
  confirmed: {
    icon: AlertOctagon,
    bg: 'bg-[hsl(0_85%_96%)]',
    border: 'border-[hsl(var(--kuja-flag))]/40',
    text: 'text-[hsl(var(--kuja-flag))]',
    labelKey: 'compliance_state.confirmed.label',
    descKey: 'compliance_state.confirmed.desc',
  },
  likely: {
    icon: AlertTriangle,
    bg: 'bg-[hsl(38_92%_96%)]',
    border: 'border-[hsl(var(--kuja-sun))]/40',
    text: 'text-[hsl(var(--kuja-sun))]',
    labelKey: 'compliance_state.likely.label',
    descKey: 'compliance_state.likely.desc',
  },
  missing: {
    icon: FileQuestion,
    bg: 'bg-muted/40',
    border: 'border-border',
    text: 'text-muted-foreground',
    labelKey: 'compliance_state.missing.label',
    descKey: 'compliance_state.missing.desc',
  },
  followup: {
    icon: Eye,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    labelKey: 'compliance_state.followup.label',
    descKey: 'compliance_state.followup.desc',
  },
} as const;

export function ComplianceState({ state, detail, variant = 'pill', action, className }: Props) {
  const { t } = useTranslation();
  const cfg = stateConfig[state];
  const Icon = cfg.icon;
  // Phase 11.1 — labels and tooltip descriptions are now localized.
  // The team's Apr 28 retest correctly flagged English vocabulary
  // (CLEAR / CONFIRMED ISSUE / etc.) leaking onto Arabic donor pages.
  const label = t(cfg.labelKey);
  const desc = t(cfg.descKey);

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
        title={desc}
      >
        <Icon className="h-3 w-3" />
        <span>{label}</span>
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
            {label}
          </div>
          {detail && <div className="text-sm text-foreground mt-0.5">{detail}</div>}
          <div className="text-[10px] text-muted-foreground italic mt-0.5">{desc}</div>
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
