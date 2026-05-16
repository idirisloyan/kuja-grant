'use client';

/**
 * ApplicationCompareDialog — donor selects 2-4 applications, opens
 * the comparison matrix (Phase 10).
 *
 * Triggered from the reviews list (where the donor multi-selects rows)
 * via a "Compare with AI" button. Renders:
 *   - Headline recommendation: "Top pick: X (confidence 80)"
 *   - Per-criterion winner column with a one-line "why"
 *   - Per-org differentiator + risk-difference bullets
 *   - Recommendation rationale + caveats
 *
 * No new tab routing — modal layered above the reviews list.
 */

import { useState } from 'react';
import {
  Loader2, Sparkles, Trophy, Equal, AlertTriangle, CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PerApp {
  predicted_score: number;
  verdict: 'strong' | 'adequate' | 'thin';
  reason: string;
}

interface CompareCriterion {
  key?: string;
  label: string;
  winner_application_id?: number | null;
  why: string;
  per_app: Record<string, PerApp>;
}

interface CompareResp {
  success: boolean;
  application_ids: number[];
  source: 'ai' | 'unavailable';
  criteria: CompareCriterion[];
  org_differentiators: string[];
  risk_differences: string[];
  recommendation: {
    top_pick_application_id: number;
    confidence: number;
    rationale: string;
    caveats?: string[];
  } | null;
}

const VERDICT_TONE: Record<string, string> = {
  strong: 'bg-[hsl(var(--kuja-grow)/0.1)] text-[hsl(var(--kuja-grow))] border-[hsl(var(--kuja-grow)/0.3)]',
  adequate: 'bg-[hsl(var(--kuja-sun)/0.1)] text-[hsl(var(--kuja-sun))] border-[hsl(var(--kuja-sun)/0.3)]',
  thin: 'bg-[hsl(var(--kuja-flag)/0.1)] text-[hsl(var(--kuja-flag))] border-[hsl(var(--kuja-flag)/0.3)]',
};

export interface ApplicationCompareDialogProps {
  applicationIds: number[];
  /** Optional map of application_id → short display label (org name) */
  appLabels?: Record<number, string>;
  /** External open control (so the trigger button can sit anywhere) */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationCompareDialog({
  applicationIds, appLabels, open, onOpenChange,
}: ApplicationCompareDialogProps) {
  const [data, setData] = useState<CompareResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load on open if not already loaded for the same set
  const sortedKey = JSON.stringify([...applicationIds].sort());
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<CompareResp>('/api/applications/compare', {
        application_ids: applicationIds,
      });
      setData(r);
      setLoadedKey(sortedKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (open && !loading && (data === null || loadedKey !== sortedKey)) {
    // Auto-fire on open if the set changed
    load();
  }

  const label = (id: number) => appLabels?.[id] || `Application #${id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="kuja-display text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[hsl(var(--kuja-spark))]" />
            Side-by-side comparison
          </DialogTitle>
          <DialogDescription>
            Reviewer-style comparison of {applicationIds.length} application{applicationIds.length === 1 ? '' : 's'} — Claude scored each on every criterion and flagged the differences that matter.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-10 flex flex-col items-center gap-3 text-[hsl(var(--kuja-ink-soft))]">
            <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--kuja-clay))]" />
            <span className="text-sm">Reading all {applicationIds.length} applications and building the comparison — this takes 10-25 seconds.</span>
          </div>
        )}

        {error && (
          <Card className="p-4 border-l-4 border-l-[hsl(var(--kuja-flag))]">
            <p className="text-sm text-[hsl(var(--kuja-flag))]">Could not compare: {error}</p>
            <button type="button" onClick={load} className="mt-2 text-xs text-[hsl(var(--kuja-clay))] hover:underline">Retry</button>
          </Card>
        )}

        {data && data.source === 'unavailable' && (
          <Card className="p-4">
            <p className="text-sm text-[hsl(var(--kuja-ink-soft))]">AI not available right now — try again in a moment.</p>
          </Card>
        )}

        {data && data.source === 'ai' && (
          <div className="space-y-4 mt-2">
            {/* Recommendation hero */}
            {data.recommendation && (
              <Card className="p-4 border-l-4 border-l-[hsl(var(--kuja-grow))] bg-[hsl(var(--kuja-grow)/0.04)]">
                <div className="flex items-start gap-3">
                  <Trophy className="w-6 h-6 text-[hsl(var(--kuja-grow))] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="kuja-eyebrow text-[hsl(var(--kuja-grow))]">Recommended top pick</div>
                    <h3 className="kuja-display text-xl mt-0.5">
                      {label(data.recommendation.top_pick_application_id)}
                    </h3>
                    <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
                      Confidence {data.recommendation.confidence}/100
                    </p>
                    <p className="text-sm mt-2 leading-relaxed">{data.recommendation.rationale}</p>
                    {data.recommendation.caveats && data.recommendation.caveats.length > 0 && (
                      <div className="mt-3">
                        <div className="kuja-label flex items-center gap-1 text-[hsl(var(--kuja-sun))]">
                          <AlertTriangle className="w-3 h-3" /> Caveats
                        </div>
                        <ul className="mt-1 space-y-1 text-xs">
                          {data.recommendation.caveats.map((c, i) => (
                            <li key={i} className="text-[hsl(var(--kuja-ink-soft))]">· {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Criterion-by-criterion matrix */}
            {data.criteria.length > 0 && (
              <div>
                <div className="kuja-label mb-2">Per-criterion breakdown ({data.criteria.length})</div>
                <div className="space-y-3">
                  {data.criteria.map((c, idx) => (
                    <Card key={idx} className="p-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold">{c.label}</h4>
                          <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">{c.why}</p>
                        </div>
                        {c.winner_application_id ? (
                          <Badge variant="outline" className="border-[hsl(var(--kuja-grow))] text-[hsl(var(--kuja-grow))]">
                            <Trophy className="w-3 h-3 mr-1" />
                            Winner: {label(c.winner_application_id)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[hsl(var(--kuja-ink-soft))]">
                            <Equal className="w-3 h-3 mr-1" /> Tie
                          </Badge>
                        )}
                      </div>
                      {Object.keys(c.per_app || {}).length > 0 && (
                        <div className={cn(
                          'mt-3 grid gap-2',
                          applicationIds.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                          applicationIds.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-4',
                        )}>
                          {Object.entries(c.per_app).map(([appId, p]) => (
                            <div
                              key={appId}
                              className={cn(
                                'rounded-md border p-2 text-xs',
                                VERDICT_TONE[p.verdict] ?? VERDICT_TONE.adequate,
                              )}
                            >
                              <div className="flex items-baseline justify-between gap-1">
                                <span className="font-semibold truncate">{label(Number(appId))}</span>
                                <span className="kuja-numeric font-bold text-xs whitespace-nowrap">
                                  {p.predicted_score}/100
                                </span>
                              </div>
                              <div className="text-[10px] uppercase tracking-wider font-semibold mt-0.5">
                                {p.verdict}
                              </div>
                              <p className="mt-1 line-clamp-3 text-[hsl(var(--kuja-ink))]">{p.reason}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Org differentiators + risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.org_differentiators.length > 0 && (
                <Card className="p-3 border-l-4 border-l-[hsl(var(--kuja-clay))]">
                  <div className="kuja-label">Org differentiators</div>
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                    {data.org_differentiators.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-[hsl(var(--kuja-clay))] shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {data.risk_differences.length > 0 && (
                <Card className="p-3 border-l-4 border-l-[hsl(var(--kuja-sun))]">
                  <div className="kuja-label">Risk differences</div>
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                    {data.risk_differences.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-[hsl(var(--kuja-sun))] shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>

            <div className="text-[10px] text-[hsl(var(--kuja-ink-soft))] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              AI comparison — confirm with a human reviewer before final decisions. Cached 30 minutes per set.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
