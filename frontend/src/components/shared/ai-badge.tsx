'use client';

// ---------------------------------------------------------------------------
// AiBadge — small visual marker that flags AI-produced UI surfaces.
//
//   <AiBadge />                       → "AI-generated"
//   <AiBadge groundedSources={3} />   → "Grounded in 3 sources"
//
// Use this on any AI-rendered panel so users can tell what's a model output
// vs. a system fact at a glance. Keeps Kuja's AI surfaces honest.
// ---------------------------------------------------------------------------

import { Sparkles } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

interface AiBadgeProps {
  /** When set, renders "Grounded in N source(s)" instead of generic AI label. */
  groundedSources?: number;
  /** Optional extra classes for layout tweaks. */
  className?: string;
}

export function AiBadge({ groundedSources, className = '' }: AiBadgeProps) {
  const { t } = useTranslation();
  const isGrounded = typeof groundedSources === 'number' && groundedSources > 0;
  const label = isGrounded
    ? t(
        groundedSources === 1 ? 'citations.grounded_in_one' : 'citations.grounded_in_other',
        { n: groundedSources },
      )
    : t('citations.ai_generated');

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/60 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--kuja-spark))] ${className}`}
      title={isGrounded ? undefined : t('citations.ai_generated')}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
