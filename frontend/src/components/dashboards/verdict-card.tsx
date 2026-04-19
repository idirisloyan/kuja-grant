'use client';

/**
 * Kuja Studio verdict card — decision-driving hero block used at the
 * top of every role-aware dashboard. Tone-coded, compact, action-
 * oriented. Replaces the stack of status tiles.
 */

import { cn } from '@/lib/utils';
import { Sparkles, AlertTriangle, CheckCircle2, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';

export type VerdictTone = 'default' | 'success' | 'warn' | 'danger' | 'spark';

export interface VerdictAction {
  label: string;
  onClick?: () => void;
  href?: string;
  severity?: 'critical' | 'major' | 'minor' | 'info';
}

interface Props {
  tone?: VerdictTone;
  eyebrow?: string;
  headline?: string;
  body?: string;
  aiBadge?: string;
  actions?: VerdictAction[];
  loading?: boolean;
  className?: string;
}

const ICON_BY_TONE: Record<VerdictTone, React.ReactNode> = {
  default: <TrendingUp className="h-4 w-4 text-[hsl(var(--kuja-clay-dark))]" />,
  success: <CheckCircle2 className="h-4 w-4 text-[hsl(var(--kuja-grow))]" />,
  warn:    <AlertTriangle className="h-4 w-4 text-[hsl(var(--kuja-sun))]" />,
  danger:  <AlertTriangle className="h-4 w-4 text-[hsl(var(--kuja-flag))]" />,
  spark:   <Sparkles className="h-4 w-4 text-[hsl(var(--kuja-spark))]" />,
};

export function VerdictCard({
  tone = 'default', eyebrow, headline, body, aiBadge, actions = [], loading, className,
}: Props) {
  return (
    <div className={cn('kuja-verdict', `kuja-verdict-${tone}`, className)}>
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : ICON_BY_TONE[tone]}
        </div>
        <div className="flex-1 min-w-0">
          {eyebrow && <div className="kuja-eyebrow mb-1">{eyebrow}</div>}
          {loading && !headline ? (
            <div className="space-y-2">
              <div className="kuja-shimmer h-6 w-3/4 rounded" />
              <div className="kuja-shimmer h-4 w-1/2 rounded" />
            </div>
          ) : (
            <>
              {headline && (
                <div className="kuja-display text-xl leading-tight text-balance">{headline}</div>
              )}
              {body && (
                <div className="mt-1.5 text-sm text-[hsl(var(--kuja-ink-soft))] leading-relaxed">{body}</div>
              )}
              {aiBadge && (
                <div className="mt-2 kuja-ai-mark">
                  <Sparkles className="h-3 w-3" /> {aiBadge}
                </div>
              )}
              {actions.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {actions.map((a, i) => (
                    <ActionButton key={i} action={a} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ action }: { action: VerdictAction }) {
  const content = (
    <>
      {action.severity === 'critical' && (
        <span className="kuja-severity kuja-severity-critical">!</span>
      )}
      <span>{action.label}</span>
      <ArrowRight className="h-3.5 w-3.5" />
    </>
  );
  const cls = 'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-all hover:border-[hsl(var(--kuja-clay))] hover:shadow';
  if (action.href) {
    return <a href={action.href} className={cls}>{content}</a>;
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {content}
    </button>
  );
}
