'use client';

/**
 * Audit timeline — vertical timeline for state-change history with
 * actor, timestamp, before/after diff chips, and optional AI "why
 * this matters" tags.
 *
 * Usage:
 *   <AuditTimeline events={[{action, actor, timestamp, ...}]} />
 */

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AuditEvent {
  action: string;
  actor?: string;
  timestamp?: string | Date;
  description?: string;
  before?: string;
  after?: string;
  severity?: 'critical' | 'major' | 'minor' | 'info' | 'good';
  ai_tag?: string;
}

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
        <p className="kuja-display text-lg">No activity yet</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
          State changes will appear here with full before/after context + an AI tag on non-obvious events.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative border-l-2 border-border ml-3 space-y-4 pl-5 pt-1">
      {events.map((e, i) => {
        const sev = e.severity ?? 'info';
        const dot =
          sev === 'critical' ? 'bg-[hsl(var(--kuja-flag))]' :
          sev === 'major'    ? 'bg-[hsl(var(--kuja-sun))]' :
          sev === 'good'     ? 'bg-[hsl(var(--kuja-grow))]' :
          'bg-muted-foreground';
        const ts = e.timestamp ? new Date(e.timestamp) : null;
        return (
          <li key={i} className="relative">
            <span className={cn('absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-4 ring-background', dot)} />
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{e.action}</span>
              {e.actor && <span className="text-xs text-muted-foreground">by {e.actor}</span>}
              {ts && <span className="text-xs text-muted-foreground">· {ts.toLocaleString()}</span>}
            </div>
            {e.description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{e.description}</p>
            )}
            {e.ai_tag && (
              <div className="mt-1 kuja-ai-mark">
                <Sparkles className="h-3 w-3" /> {e.ai_tag}
              </div>
            )}
            {e.before && e.after && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-[hsl(0_75%_85%)] bg-[hsl(0_85%_97%)] px-2 py-1 text-[hsl(0_72%_35%)]">
                  <div className="text-[9px] uppercase tracking-wider opacity-80">Before</div>
                  <div className="mt-0.5 break-words">{e.before}</div>
                </div>
                <div className="rounded border border-[hsl(142_55%_85%)] bg-[hsl(142_68%_96%)] px-2 py-1 text-[hsl(var(--kuja-grow))]">
                  <div className="text-[9px] uppercase tracking-wider opacity-80">After</div>
                  <div className="mt-0.5 break-words">{e.after}</div>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
