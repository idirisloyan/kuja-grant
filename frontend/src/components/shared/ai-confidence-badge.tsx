'use client';

/**
 * AIConfidenceBadge — Phase 5.4
 *
 * Renders an AI's bucketed confidence (high / medium / low) with a tone
 * that maps to the underlying signal. Used wherever AI surfaces output —
 * draft sections, score breakdowns, criterion responses.
 *
 * Design choice: bucketed not numeric. Raw probabilities calibrate poorly
 * for users; "high / medium / low" is honest about what we know.
 *
 * Variant 'inline' is a small chip (per-row); 'badge' is a slightly larger
 * standalone pill; 'dot' is a 6px colored dot for ultra-dense layouts.
 */

import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { cn } from '@/lib/utils';

type Confidence = 'high' | 'medium' | 'low' | string;
type Variant = 'inline' | 'badge' | 'dot';

const TONE: Record<string, string> = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-rose-200 bg-rose-50 text-rose-800',
};
const DOT_TONE: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-rose-500',
};

const ICON: Record<string, typeof ShieldCheck> = {
  high: ShieldCheck,
  medium: ShieldQuestion,
  low: ShieldAlert,
};

interface Props {
  confidence: Confidence;
  variant?: Variant;
  /** Show the icon next to the label (default true for badge, false for inline). */
  showIcon?: boolean;
  /** Optional sentence shown on hover explaining what this confidence level means. */
  title?: string;
  className?: string;
}

export function AIConfidenceBadge({
  confidence,
  variant = 'inline',
  showIcon,
  title,
  className = '',
}: Props) {
  const { t } = useTranslation();
  const safe = ['high', 'medium', 'low'].includes(confidence) ? confidence : 'medium';
  const tone = TONE[safe] || TONE.medium;
  const Icon = ICON[safe] || ShieldQuestion;
  const label = t(`coauthor.confidence.${safe}`);
  const tooltip = title || t(`ai.confidence.${safe}.tooltip`);

  if (variant === 'dot') {
    const dot = DOT_TONE[safe] || DOT_TONE.medium;
    return (
      <span
        title={tooltip}
        aria-label={`${label} confidence`}
        className={cn('inline-block h-1.5 w-1.5 rounded-full', dot, className)}
      />
    );
  }

  const showIco = showIcon ?? variant === 'badge';
  const sizing =
    variant === 'badge'
      ? 'gap-1 px-2 py-0.5 text-[11px]'
      : 'gap-1 px-1.5 py-0 text-[10px]';

  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center rounded-full border font-medium uppercase tracking-wide',
        sizing,
        tone,
        className,
      )}
    >
      {showIco && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}
