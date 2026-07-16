'use client';

/**
 * AutofillPanel — pre-fill an application from the NGO's org context (Phase 10).
 *
 * NGO opens a new application → clicks "Pre-fill from my org profile" →
 * Claude generates a draft per criterion that the NGO accepts/edits.
 *
 * Renders each drafted criterion with:
 *   - the draft text
 *   - confidence chip (how grounded in real org data)
 *   - sources_used badges (mission, prior_app:X, etc.)
 *   - fields_still_needed bullets (what the NGO MUST add)
 *   - "Accept" button per criterion that emits onAccept(key, draft)
 *
 * The host page is responsible for actually applying the accepted draft
 * to the in-progress application form (via the onAccept callback).
 *
 * Source pill (AI vs unavailable). Cached server-side per
 * (org, grant) for 1h.
 */

import { useState } from 'react';
import {
  Sparkles, Loader2, Check, Wand2, AlertCircle, FileText, Quote,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AutofillCriterion {
  key: string;
  label?: string;
  draft: string;
  confidence: number;
  sources_used?: string[];
  fields_still_needed?: string[];
}

interface AutofillResp {
  success: boolean;
  grant_id: number;
  org_id: number;
  source: 'ai' | 'unavailable' | 'no_input';
  criteria: AutofillCriterion[];
  overall_note?: string;
  note?: string;
}

const CONF_TONE = (c: number) => {
  if (c >= 75) return 'border-[hsl(var(--kuja-grow))] text-[hsl(var(--kuja-grow))]';
  if (c >= 50) return 'border-[hsl(var(--kuja-sun))] text-[hsl(var(--kuja-sun))]';
  return 'border-[hsl(var(--kuja-flag))] text-[hsl(var(--kuja-flag))]';
};

export interface AutofillPanelProps {
  grantId: number;
  /** Called when the NGO clicks Accept on a criterion's draft. */
  onAccept: (criterionKey: string, draft: string) => void;
  /** Which criteria are already filled out in the form — accepts disabled */
  alreadyFilledKeys?: string[];
}

export function AutofillPanel({ grantId, onAccept, alreadyFilledKeys = [] }: AutofillPanelProps) {
  const [data, setData] = useState<AutofillResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(new Set());

  const filled = new Set<string>([...alreadyFilledKeys, ...Array.from(acceptedKeys)]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<AutofillResp>(`/api/grants/${grantId}/autofill`);
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const accept = (criterion: AutofillCriterion) => {
    onAccept(criterion.key, criterion.draft);
    setAcceptedKeys(new Set<string>([...Array.from(acceptedKeys), criterion.key]));
  };

  const acceptAll = () => {
    if (!data?.criteria) return;
    for (const c of data.criteria) {
      if (filled.has(c.key)) continue;
      onAccept(c.key, c.draft);
    }
    setAcceptedKeys(new Set<string>([...Array.from(acceptedKeys), ...data.criteria.map(c => c.key)]));
  };

  if (!data && !loading) {
    return (
      <Card className="p-4 border-l-4 border-l-[hsl(var(--kuja-spark))] bg-[hsl(var(--kuja-spark-soft))]">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-card">
            <Wand2 className="w-5 h-5 text-[hsl(var(--kuja-spark))]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">Pre-fill from your org profile</h3>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Claude drafts a starter response per criterion using your mission, sectors,
              capacity assessment, and any prior application you&apos;ve filed. Review and edit
              before submitting — placeholders like [INSERT 2025 BENEFICIARY COUNT] mark
              what you must add.
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <Sparkles className="w-3.5 h-3.5" /> Pre-fill with AI
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--kuja-ink-soft))]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Drafting from your org profile + capacity passport + prior applications…
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4 border-l-4 border-l-[hsl(var(--kuja-flag))]">
        <p className="text-sm text-[hsl(var(--kuja-flag))]">Pre-fill could not run: {error}</p>
        <button type="button" onClick={load} className="mt-2 text-xs text-[hsl(var(--kuja-clay))] hover:underline">Retry</button>
      </Card>
    );
  }

  if (data.source === 'no_input') {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-2 text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--kuja-ink-soft))] shrink-0 mt-0.5" />
          {data.note ?? 'This grant has no structured criteria yet — nothing to pre-fill.'}
        </div>
      </Card>
    );
  }

  if (data.source === 'unavailable') {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-2 text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--kuja-ink-soft))] shrink-0 mt-0.5" />
          {data.note ?? 'AI not available right now — try again later.'}
        </div>
      </Card>
    );
  }

  const unfilledCount = data.criteria.filter(c => !filled.has(c.key)).length;

  return (
    <Card className="p-4 border-l-4 border-l-[hsl(var(--kuja-spark))]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Wand2 className="w-5 h-5 text-[hsl(var(--kuja-spark))] mt-0.5" />
          <div className="min-w-0">
            <div className="kuja-eyebrow flex items-center gap-1.5">
              AI-drafted application
              <span className="kuja-ai-pill text-[9px]">
                <Sparkles className="w-2.5 h-2.5" /> Pre-fill
              </span>
            </div>
            <h3 className="text-base font-semibold mt-0.5">
              {data.criteria.length} drafts ready · {unfilledCount} unaccepted
            </h3>
            {data.overall_note && (
              <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">{data.overall_note}</p>
            )}
          </div>
        </div>
        {unfilledCount > 1 && (
          <button
            type="button"
            onClick={acceptAll}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
          >
            <Check className="w-3.5 h-3.5" /> Accept all {unfilledCount}
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {data.criteria.map((c, i) => {
          const isFilled = filled.has(c.key);
          return (
            <div
              key={i}
              className={cn(
                'rounded-md border p-3',
                isFilled
                  ? 'border-[hsl(var(--kuja-grow)/0.3)] bg-[hsl(var(--kuja-grow)/0.04)]'
                  : 'border-[hsl(var(--border))]',
              )}
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{c.label || c.key}</span>
                  <Badge variant="outline" className={cn('text-[10px]', CONF_TONE(c.confidence))}>
                    conf {c.confidence}/100
                  </Badge>
                </div>
                {isFilled ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--kuja-grow))]">
                    <Check className="w-3 h-3" /> Accepted
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => accept(c)}
                    className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
                  >
                    <Check className="w-3 h-3" /> Accept draft
                  </button>
                )}
              </div>

              <div className="mt-2 rounded-md bg-[hsl(var(--kuja-sand-50))] p-2.5 text-xs leading-relaxed text-[hsl(var(--kuja-ink))] whitespace-pre-wrap">
                <Quote className="w-3 h-3 inline mr-1 text-[hsl(var(--kuja-ink-soft))]" />
                {c.draft}
              </div>

              <div className="mt-2 flex items-start gap-3 flex-wrap text-[11px]">
                {c.sources_used && c.sources_used.length > 0 && (
                  <div>
                    <span className="font-semibold text-[hsl(var(--kuja-ink-soft))]">Sources: </span>
                    {c.sources_used.map((s, i) => (
                      <Badge key={i} variant="outline" className="ml-1 text-[10px]">
                        <FileText className="w-2.5 h-2.5 mr-0.5" />{s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {c.fields_still_needed && c.fields_still_needed.length > 0 && (
                <div className="mt-2 rounded-md border border-[hsl(var(--kuja-sun)/0.3)] bg-[hsl(var(--kuja-sun)/0.05)] p-2 text-[11px]">
                  <div className="kuja-label flex items-center gap-1 text-[hsl(var(--kuja-sun))]">
                    <AlertCircle className="w-3 h-3" /> You still need to fill in:
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {c.fields_still_needed.map((f, j) => (
                      <li key={j} className="text-[hsl(var(--kuja-ink))]">· {f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
