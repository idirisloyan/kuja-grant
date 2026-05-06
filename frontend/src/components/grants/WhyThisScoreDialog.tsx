'use client';

/**
 * WhyThisScoreDialog — Phase 13.8
 *
 * PMO's UAT-driven win: "what does this score actually mean?" Users
 * don't argue with a number they can dissect. The dialog shows:
 *   - the 4 pillars sorted lowest-first ("here's what's pulling you down")
 *   - per-pillar contribution rows (the inputs that produced the value)
 *   - the calculator's explanatory note
 *   - the band chip (on track / at risk / high risk)
 *
 * Always renders rule-based output — the AI narrative layer is added
 * later from the same response shape if `computed_via='ai_narrative'`.
 *
 * Use:
 *   <WhyThisScoreDialog grantId={42} score={68} />
 */

import { useState, useCallback } from 'react';
import {
  Sparkles, X, Info, Loader2, CheckCircle2, AlertTriangle, AlertOctagon,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import {
  fetchGrantComplianceHealth, type ComplianceHealth, type ComplianceBand,
} from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

interface Props {
  grantId: number;
  /** Optional pre-computed score for the trigger button label. */
  score?: number;
  className?: string;
}

const bandTone: Record<ComplianceBand, { bg: string; text: string; border: string; icon: typeof CheckCircle2 }> = {
  on_track:  { bg: 'bg-[hsl(142_68%_96%)]', text: 'text-[hsl(var(--kuja-grow))]', border: 'border-[hsl(var(--kuja-grow))]/30', icon: CheckCircle2 },
  at_risk:   { bg: 'bg-[hsl(38_92%_96%)]',  text: 'text-[hsl(var(--kuja-sun))]',  border: 'border-[hsl(var(--kuja-sun))]/30',  icon: AlertTriangle },
  high_risk: { bg: 'bg-[hsl(0_85%_96%)]',   text: 'text-[hsl(var(--kuja-flag))]', border: 'border-[hsl(var(--kuja-flag))]/30', icon: AlertOctagon },
};

export function WhyThisScoreDialog({ grantId, score, className }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ComplianceHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setOpen(true);
    if (data) return;
    setLoading(true);
    setError(null);
    const res = await fetchGrantComplianceHealth(grantId);
    if (res.ok) setData(res.data);
    else setError(res.message || 'Failed to load');
    setLoading(false);
  }, [grantId, data]);

  const tone = data ? bandTone[data.band] : null;
  const ToneIcon = tone?.icon ?? Info;

  return (
    <>
      <button
        type="button"
        onClick={load}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted',
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" />
        {t('compliance_health.why_this_score')}
        {score != null && (
          <span className="kuja-numeric font-bold text-[hsl(var(--kuja-clay))]">{score}</span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[hsl(var(--kuja-clay))]" />
                <h2 className="kuja-display text-lg">
                  {t('compliance_health.dialog_title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-4 space-y-4">
              {loading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--kuja-clay))]" />
                </div>
              )}
              {error && !loading && (
                <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-3 text-sm text-[hsl(var(--kuja-flag))]">
                  {error}
                </div>
              )}

              {data && tone && !loading && (
                <>
                  <div className={cn('rounded-lg border p-4', tone.bg, tone.border)}>
                    <div className="flex items-center gap-3">
                      <ToneIcon className={cn('h-8 w-8', tone.text)} />
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className={cn('kuja-numeric text-3xl font-bold', tone.text)}>{data.score}</span>
                          <span className="text-sm text-muted-foreground">/100</span>
                          <span className={cn(
                            'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            tone.text, tone.bg,
                          )}>
                            {t(`compliance_health.band.${data.band}`)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('compliance_health.as_of', { ts: new Date(data.as_of).toLocaleString() })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground italic">
                      {t('compliance_health.lowest_first_hint')}
                    </p>
                    {data.pillars.map((p) => (
                      <div key={p.key} className="rounded-md border border-border bg-background p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold">
                            {t(`compliance_health.pillar.${p.key}`)}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              ×{Math.round(p.weight * 100)}%
                            </span>
                            <span className="kuja-numeric text-2xl font-bold tabular-nums">{p.value}</span>
                          </div>
                        </div>
                        {p.note && (
                          <p className="text-xs text-muted-foreground mb-2">{p.note}</p>
                        )}
                        {p.contributions && p.contributions.length > 0 && (
                          <ul className="space-y-1">
                            {p.contributions.map((c, i) => (
                              <li key={i} className="flex items-start justify-between gap-2 text-xs">
                                <span className="text-muted-foreground flex-1 min-w-0">{c.label}</span>
                                <span className="font-mono text-foreground flex-shrink-0">{c.value}</span>
                                {c.detail && (
                                  <span className="text-[10px] text-muted-foreground italic flex-shrink-0">{c.detail}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-border p-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
