'use client';

/**
 * Phase 76 — Why-rejected, constructively.
 *
 * Surfaces an AI-generated, empathetic, specific, action-oriented
 * explanation when an application or report is declined or has
 * revisions requested. Used on both /applications/[id] and /reports/[id].
 *
 * Most donors give cursory feedback ('not competitive', 'see notes', or
 * nothing). This panel translates the donor's signals + the submitted
 * content into:
 *   • a warm 2-sentence summary
 *   • 2-4 specific issues (each with evidence + impact)
 *   • 2-4 concrete next-time suggestions (each with expected lift)
 *   • a closing line of encouragement
 *
 * On-demand: the panel renders a 'Show me why' button by default. Only
 * fires the AI call when the NGO actually opens it (saves tokens).
 */

import { useState } from 'react';
import {
  Lightbulb, Loader2, AlertTriangle, ChevronDown, ChevronUp, Heart, ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';

interface RejectionExplanation {
  success: boolean;
  summary?: string;
  specific_issues?: { title: string; evidence: string; impact: string }[];
  suggestions?: { title: string; action: string; expected_lift: string }[];
  encouragement?: string;
  ai_used?: boolean;
  error?: string;
}

interface Props {
  kind: 'application' | 'report';
  entityId: number;
  className?: string;
}

export function WhyRejectedPanel({ kind, entityId, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<RejectionExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true); setError(null);
    try {
      const path = kind === 'application'
        ? `/applications/${entityId}/explain-rejection`
        : `/reports/${entityId}/explain-rejection`;
      const resp = await api.get<RejectionExplanation>(path);
      if (!resp.success) {
        setError(resp.error || 'Could not generate an explanation.');
      } else {
        setData(resp);
      }
    } catch (e) {
      setError((e as Error).message || 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && !data && !busy) {
        // Lazy-load when first opened.
        void load();
      }
      return next;
    });
  }

  return (
    <section className={`border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/5 rounded-lg ${className}`}>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-[hsl(var(--kuja-sun))]/10 rounded-lg transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0">
          <Lightbulb className="w-5 h-5 text-[hsl(var(--kuja-sun))] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">
              Why was this declined — and how to do better next time
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              An AI-generated, donor-rubric-aware explanation. Specific and
              actionable, not generic.
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs">
          {busy && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Reading the donor&apos;s notes and your submission…
            </div>
          )}

          {error && (
            <div className="border border-destructive/30 bg-destructive/10 text-destructive rounded-md px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {data && (
            <>
              {data.summary && (
                <p className="leading-relaxed text-foreground border-l-2 border-[hsl(var(--kuja-sun))] pl-3">
                  {data.summary}
                </p>
              )}

              {(data.specific_issues ?? []).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                    What likely hurt this submission
                  </div>
                  <ul className="space-y-2">
                    {data.specific_issues!.map((it, i) => (
                      <li key={i} className="border border-border rounded-md p-2.5 bg-background">
                        <div className="font-semibold">{it.title}</div>
                        <div className="text-muted-foreground mt-1 leading-relaxed">
                          <strong className="text-foreground/80">Evidence:</strong> {it.evidence}
                        </div>
                        <div className="text-muted-foreground mt-1 leading-relaxed">
                          <strong className="text-foreground/80">Impact:</strong> {it.impact}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(data.suggestions ?? []).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                    What to do next time
                  </div>
                  <ul className="space-y-2">
                    {data.suggestions!.map((s, i) => (
                      <li key={i} className="border border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/5 rounded-md p-2.5">
                        <div className="font-semibold flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-[hsl(var(--kuja-grow))]" />
                          {s.title}
                        </div>
                        <div className="text-muted-foreground mt-1 leading-relaxed">
                          {s.action}
                        </div>
                        {s.expected_lift && (
                          <div className="text-[hsl(var(--kuja-grow))] mt-1 text-[11px] italic">
                            Typical lift: {s.expected_lift}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.encouragement && (
                <div className="flex items-start gap-2 text-foreground border-t border-border pt-3 italic">
                  <Heart className="w-3.5 h-3.5 text-[hsl(var(--kuja-spark))] mt-0.5 shrink-0" />
                  <span>{data.encouragement}</span>
                </div>
              )}

              {!data.ai_used && (
                <div className="text-[10px] text-muted-foreground italic">
                  AI was unavailable — showing donor notes as-is.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
