'use client';

/**
 * ReviewerBriefingCard — Phase 20B (May 2026).
 *
 * Renders a 1-paragraph "what to probe before scoring" brief plus 3-5
 * specific talking points. Lazy: only fetches when reviewer/donor opens
 * the panel (collapsed by default to keep the apply page lean).
 *
 * Shows on application detail for reviewer/donor/admin. Hidden for NGOs
 * (it's review-side AI; they get SubmissionReadiness instead).
 */

import { useState } from 'react';
import {
  Lightbulb, Sparkles, ChevronDown, ChevronUp, Loader2, Search,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface TalkingPoint {
  point: string;
  target_criterion?: string;
  why_it_matters?: string;
}

interface BriefingResp {
  success: boolean;
  source: 'ai' | 'sparse' | 'unavailable';
  briefing: string | null;
  talking_points: TalkingPoint[];
}

interface Props {
  applicationId: number;
}

export function ReviewerBriefingCard({ applicationId }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BriefingResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      setLoading(true);
      setError(null);
      try {
        const r = await api.get<BriefingResp>(
          `/api/applications/${applicationId}/reviewer-briefing`
        );
        setData(r);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not load briefing');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-start justify-between gap-2"
        aria-expanded={open}
      >
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            <Lightbulb className="h-3.5 w-3.5" />
            Reviewer briefing
            <Sparkles className="h-3 w-3" />
          </div>
          <h3 className="kuja-display text-lg mt-0.5">What to probe before scoring</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI reads the submission + grant criteria and surfaces the 3–5 questions
            most worth testing. Helps panel consistency without dictating verdicts.
          </p>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the submission…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-3 text-xs">
              <strong className="text-[hsl(var(--kuja-flag))]">Couldn&apos;t generate briefing:</strong> {error}
            </div>
          )}

          {data && data.source === 'sparse' && (
            <p className="text-xs text-muted-foreground italic">
              Application is too sparse to generate a useful briefing yet.
              Wait for the NGO to fill in more before scoring.
            </p>
          )}

          {data && data.source === 'unavailable' && (
            <p className="text-xs text-muted-foreground italic">
              Briefing is unavailable right now. You can still score manually.
            </p>
          )}

          {data && data.source === 'ai' && (
            <>
              {data.briefing && (
                <div className="rounded-md border-l-2 border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand))]/40 p-3">
                  <p className="text-sm leading-relaxed">{data.briefing}</p>
                </div>
              )}

              {data.talking_points.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--kuja-clay-dark))] mb-1.5">
                    Probe these in your review
                  </div>
                  <ul className="space-y-1.5">
                    {data.talking_points.map((tp, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-[hsl(var(--border))] p-2 flex items-start gap-2"
                      >
                        <Search className="h-3 w-3 text-[hsl(var(--kuja-clay))] mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{tp.point}</p>
                          {tp.target_criterion && (
                            <Badge variant="outline" className="text-[10px] mt-0.5">
                              targets: <code className="ml-1">{tp.target_criterion}</code>
                            </Badge>
                          )}
                          {tp.why_it_matters && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              <strong>Why:</strong> {tp.why_it_matters}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
