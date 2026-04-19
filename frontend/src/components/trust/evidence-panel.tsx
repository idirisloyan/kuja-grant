'use client';

/**
 * Evidence panel — compliance / review evidence card with severity
 * framing, AI confidence, extracted quote, and decision-support actions.
 */

import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

type Severity = 'critical' | 'major' | 'minor' | 'info' | 'good';

interface EvidenceAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
  tone?: 'default' | 'danger';
}

interface Props {
  title: string;
  requirement?: string;
  evidence?: string;
  source?: string;
  confidence?: number; // 0..1
  severity?: Severity;
  actions?: EvidenceAction[];
  className?: string;
}

export function EvidencePanel({
  title, requirement, evidence, source, confidence,
  severity = 'info', actions = [], className,
}: Props) {
  return (
    <div className={cn('rounded-xl border border-border bg-background p-4 space-y-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`kuja-severity kuja-severity-${severity}`}>{severity}</span>
            {confidence !== undefined && (
              <span className="text-[10px] text-muted-foreground">
                AI confidence {Math.round(confidence * 100)}%
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {requirement && (
            <div className="text-xs text-muted-foreground mt-1">{requirement}</div>
          )}
        </div>
      </div>
      {evidence ? (
        <div className="bg-muted/40 border border-border rounded-md p-3">
          <div className="kuja-ai-mark mb-1">
            <Quote className="h-3 w-3" /> Evidence extracted
          </div>
          <div className="text-xs text-foreground whitespace-pre-line leading-relaxed">{evidence}</div>
          {source && (
            <div className="text-[10px] text-muted-foreground mt-1.5">Source: {source}</div>
          )}
        </div>
      ) : (
        <div className="text-xs italic text-muted-foreground">No evidence extracted yet.</div>
      )}
      {actions.length > 0 && (
        <div className="flex gap-2 pt-1 border-t border-border">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              className={cn(
                'px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors',
                a.primary
                  ? a.tone === 'danger'
                    ? 'bg-[hsl(var(--kuja-flag))] text-white border-transparent hover:opacity-90'
                    : 'bg-[hsl(var(--kuja-clay))] text-white border-transparent hover:bg-[hsl(var(--kuja-clay-dark))]'
                  : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
