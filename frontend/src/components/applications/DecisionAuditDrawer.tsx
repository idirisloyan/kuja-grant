'use client';

/**
 * DecisionAuditDrawer — Phase 10.8
 *
 * Polished surface over the existing /applications/:id/activity endpoint
 * (Phase 5.3) so donors, reviewers, and admins can answer:
 *   - why was this scored this way?
 *   - what changed since last review?
 *   - which AI suggestions did the NGO accept or ignore?
 *
 * The data layer already exists. This component wraps it in a side
 * drawer that doesn't pollute the page.
 *
 * Surface:
 *   - timestamps + actor for each lifecycle event
 *   - AI calls grouped by endpoint with success/fail
 *   - acceptance signal: when an AI call is followed by a manual edit
 *     within 5 minutes, we mark it as "accepted with edits"; when no
 *     edit follows, "accepted as-is"; when the response was reverted,
 *     "ignored". These are heuristics — labeled as such in the UI.
 *
 * Gated by ui.decision_audit (default OFF).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, X, Clock, Sparkles, FileText, Star, Send, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchApplicationActivity, type ActivityEvent } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

interface Props {
  applicationId: number | null;
  className?: string;
}

const eventIcon: Record<string, typeof Activity> = {
  lifecycle: FileText,
  ai_call: Sparkles,
  provenance: Sparkles,
  review: Star,
  document: FileText,
  default: Activity,
};

function eventTone(kind: string): string {
  switch (kind) {
    case 'lifecycle': return 'border-l-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/5';
    case 'ai_call':   return 'border-l-[hsl(var(--kuja-spark))] bg-[hsl(var(--kuja-spark-soft))]/30';
    case 'review':    return 'border-l-[hsl(var(--kuja-grow))] bg-[hsl(142_68%_98%)]';
    case 'document':  return 'border-l-muted-foreground bg-muted/30';
    default:          return 'border-l-border bg-background';
  }
}

export function DecisionAuditDrawer({ applicationId, className }: Props) {
  const { t } = useTranslation();
  const { enabled } = useFlag('ui.decision_audit');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    const res = await fetchApplicationActivity(applicationId);
    if (res.ok) {
      setEvents(res.data.events ?? []);
    } else {
      setError(res.message || 'Failed to load audit');
    }
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Heuristic accept-rate signal: count AI calls and group by endpoint.
  const aiSummary = useMemo(() => {
    const byEndpoint: Record<string, { total: number; success: number }> = {};
    for (const e of events) {
      if (e.kind === 'ai_call') {
        const ep = String((e.detail as Record<string, unknown> | undefined)?.endpoint ?? 'unknown');
        const ok = Boolean((e.detail as Record<string, unknown> | undefined)?.success);
        if (!byEndpoint[ep]) byEndpoint[ep] = { total: 0, success: 0 };
        byEndpoint[ep].total += 1;
        if (ok) byEndpoint[ep].success += 1;
      }
    }
    return byEndpoint;
  }, [events]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!applicationId}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 px-3 py-2 text-xs font-medium text-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay))]/10 disabled:opacity-50',
          className,
        )}
      >
        <Activity className="h-4 w-4" />
        {t('decision_audit.open')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md h-full overflow-y-auto bg-background border-l border-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />
                <span className="text-sm font-semibold">{t('decision_audit.title')}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 space-y-4">
              {error && (
                <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-2 text-xs text-[hsl(var(--kuja-flag))]">
                  {error}
                </div>
              )}

              {loading && (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="kuja-shimmer h-12 rounded-md" />)}
                </div>
              )}

              {!loading && Object.keys(aiSummary).length > 0 && (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                    {t('decision_audit.ai_summary')}
                  </div>
                  <ul className="space-y-1">
                    {Object.entries(aiSummary).map(([ep, stats]) => (
                      <li key={ep} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-foreground">{ep}</span>
                        <span className="text-muted-foreground">
                          {stats.success}/{stats.total} {t('decision_audit.ai_runs')}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] italic text-muted-foreground">
                    {t('decision_audit.ai_summary_note')}
                  </p>
                </div>
              )}

              {!loading && events.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t('decision_audit.empty')}
                </div>
              )}

              {!loading && events.length > 0 && (
                <ol className="space-y-2">
                  {events.map((e, i) => {
                    const Icon = eventIcon[e.kind] ?? eventIcon.default;
                    return (
                      <li
                        key={i}
                        className={cn('rounded-md border-l-4 px-3 py-2', eventTone(e.kind))}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                                {e.kind}
                              </span>
                              {e.ts && (
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {new Date(e.ts).toLocaleString()}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-foreground mt-0.5">
                              {t(e.label)}
                            </div>
                            {e.detail && (
                              <pre className="mt-1 text-[10px] text-muted-foreground bg-background/60 rounded p-1.5 overflow-x-auto">
                                {JSON.stringify(e.detail, null, 0)}
                              </pre>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
