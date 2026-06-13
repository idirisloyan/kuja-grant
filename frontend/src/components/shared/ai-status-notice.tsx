'use client';

/**
 * Phase 93 — Shared AI status notice.
 *
 * Used by every AI surface to communicate three things consistently:
 *   - AI is unavailable (key missing, model errored, network down)
 *   - AI returned low confidence on this specific attempt
 *   - Browser doesn't support the input modality (e.g. Somali voice)
 *
 * Every notice has a "Here's what to do instead" pathway. The team
 * review point this addresses: features need to fail gracefully and
 * direct the user to a working manual alternative, not just degrade
 * silently.
 */

import { AlertTriangle, Info, Sparkles, ArrowRight } from 'lucide-react';
import { ReactNode } from 'react';

export type AINoticeKind =
  | 'unavailable'        // AI service is down or unreachable
  | 'low_confidence'     // AI returned but with low confidence
  | 'unsupported_input'  // Browser / language can't be processed (e.g. Somali voice)
  | 'limited_context'    // AI ran but had thin grounding (e.g. cold-start NGO)
  | 'experimental';      // Feature is known-experimental for this combination

interface Props {
  kind: AINoticeKind;
  /** Headline for the notice. */
  title: string;
  /** 1-2 sentence body. Explain what happened and what to do. */
  body: string;
  /** Optional CTA — the manual alternative path. */
  alternative?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}

const STYLES: Record<AINoticeKind, { bg: string; border: string; iconColor: string; icon: typeof Info }> = {
  unavailable:       { bg: 'bg-destructive/5',                       border: 'border-destructive/30',                       iconColor: 'text-destructive',                       icon: AlertTriangle },
  low_confidence:    { bg: 'bg-[hsl(var(--kuja-sun))]/5',           border: 'border-[hsl(var(--kuja-sun))]/30',            iconColor: 'text-[hsl(var(--kuja-sun))]',           icon: AlertTriangle },
  unsupported_input: { bg: 'bg-[hsl(var(--kuja-sun))]/5',           border: 'border-[hsl(var(--kuja-sun))]/30',            iconColor: 'text-[hsl(var(--kuja-sun))]',           icon: Info },
  limited_context:   { bg: 'bg-[hsl(var(--kuja-spark))]/5',         border: 'border-[hsl(var(--kuja-spark))]/30',          iconColor: 'text-[hsl(var(--kuja-spark))]',         icon: Info },
  experimental:      { bg: 'bg-muted/30',                            border: 'border-border',                                iconColor: 'text-muted-foreground',                  icon: Sparkles },
};

export function AIStatusNotice({ kind, title, body, alternative, className = '' }: Props) {
  const S = STYLES[kind];
  const Icon = S.icon;
  return (
    <div className={`border ${S.border} ${S.bg} rounded-md p-3 text-xs ${className}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${S.iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="mt-0.5 text-foreground/80 leading-relaxed">{body}</div>
          {alternative && (
            <ManualAlternative {...alternative} />
          )}
        </div>
      </div>
    </div>
  );
}

function ManualAlternative({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const inner: ReactNode = (
    <span className="inline-flex items-center gap-1 mt-2 font-semibold text-foreground hover:underline cursor-pointer">
      {label} <ArrowRight className="w-3 h-3" />
    </span>
  );
  if (href) return <a href={href} className="block">{inner}</a>;
  if (onClick) return <button type="button" onClick={onClick} className="block text-left">{inner}</button>;
  return null;
}
