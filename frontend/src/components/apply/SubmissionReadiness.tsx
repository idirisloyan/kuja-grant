'use client';

/**
 * SubmissionReadiness — Phase 10.1
 *
 * The category-defining move. Before an NGO clicks Submit, we run a
 * structured AI pre-flight pass over their responses and tell them
 * exactly what's missing, weak, generic, or overclaimed — with one-click
 * apply for AI-suggested rewrites.
 *
 * The team's spec said: "NGOs should never wonder 'is this good enough?'
 * The product should tell them, honestly." This component implements
 * that promise.
 *
 * Surface:
 *   - readiness score 0-100 with verdict tone (ready / needs_work / not_ready)
 *   - one-line honest summary
 *   - blocker / weak / polish gaps with concrete suggestions
 *   - missing evidence, overclaims, generic answers, strengths
 *   - per-gap "Apply rewrite" button when AI provided one
 *
 * Apply rewrite:
 *   When the AI returned a `rewrite` for a gap, we expose a button that
 *   calls back to the parent's onApplyRewrite(criterion_key, text)
 *   handler so the parent can patch the response in place.
 *
 * Gated by ui.submission_readiness (default OFF). Feature-flag-aware so
 * we can roll it out per cohort.
 */

import { useState, useCallback } from 'react';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Loader2, Sparkles, X,
  AlertOctagon, FileQuestion, Lightbulb,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchSubmissionReadiness, type SubmissionReadiness as Readiness, type ReadinessGap } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

interface Props {
  applicationId: number | null;
  /** Called when the NGO clicks "Apply rewrite" on a gap with AI rewrite text. */
  onApplyRewrite?: (criterionKey: string, rewrite: string) => void;
  className?: string;
}

const verdictTone = {
  ready: {
    bg: 'bg-[hsl(142_68%_96%)]',
    border: 'border-[hsl(var(--kuja-grow))]/30',
    text: 'text-[hsl(var(--kuja-grow))]',
    icon: CheckCircle2,
  },
  needs_work: {
    bg: 'bg-[hsl(38_92%_96%)]',
    border: 'border-[hsl(var(--kuja-sun))]/30',
    text: 'text-[hsl(var(--kuja-sun))]',
    icon: AlertTriangle,
  },
  not_ready: {
    bg: 'bg-[hsl(0_85%_96%)]',
    border: 'border-[hsl(var(--kuja-flag))]/30',
    text: 'text-[hsl(var(--kuja-flag))]',
    icon: XCircle,
  },
} as const;

const severityTone: Record<ReadinessGap['severity'], { bg: string; text: string; label: string }> = {
  blocker: { bg: 'bg-[hsl(0_85%_96%)]', text: 'text-[hsl(var(--kuja-flag))]', label: 'BLOCKER' },
  weak:    { bg: 'bg-[hsl(38_92%_96%)]', text: 'text-[hsl(var(--kuja-sun))]', label: 'WEAK' },
  polish:  { bg: 'bg-muted/50', text: 'text-muted-foreground', label: 'POLISH' },
};

export function SubmissionReadiness({ applicationId, onApplyRewrite, className }: Props) {
  const { t } = useTranslation();
  const { enabled } = useFlag('ui.submission_readiness');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Readiness | null>(null);
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set());

  const run = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    setOpen(true);
    setAppliedKeys(new Set());
    const res = await fetchSubmissionReadiness(applicationId);
    if (res.ok) {
      setResult(res.data.readiness);
    } else {
      setError(res.message || 'Pre-flight failed');
    }
    setLoading(false);
  }, [applicationId]);

  const apply = useCallback((gap: ReadinessGap) => {
    if (!gap.rewrite || !onApplyRewrite) return;
    onApplyRewrite(gap.criterion_key, gap.rewrite);
    setAppliedKeys((prev) => new Set(prev).add(gap.criterion_key));
  }, [onApplyRewrite]);

  if (!enabled) return null;

  const tone = result ? verdictTone[result.verdict] : null;
  const VerdictIcon = tone?.icon ?? ShieldCheck;

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={!applicationId || loading}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))] px-3 py-2 text-sm font-medium text-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark))]/15 disabled:opacity-50',
          className,
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {loading ? t('readiness.checking') : t('readiness.check')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="readiness-title"
        >
          <div
            className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[hsl(var(--kuja-spark))]" />
                <h2 id="readiness-title" className="kuja-display text-lg">
                  {t('readiness.title')}
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
                <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--kuja-spark))]" />
                  <p className="text-sm">{t('readiness.scanning')}</p>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-3 text-sm text-[hsl(var(--kuja-flag))]">
                  {error}
                </div>
              )}

              {result && tone && !loading && (
                <>
                  {/* Verdict header */}
                  <div className={cn('rounded-lg border p-4', tone.bg, tone.border)}>
                    <div className="flex items-center gap-3">
                      <VerdictIcon className={cn('h-8 w-8', tone.text)} />
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className={cn('kuja-numeric text-3xl font-bold', tone.text)}>
                            {result.readiness_score}
                          </span>
                          <span className="text-sm text-muted-foreground">/100</span>
                          <span
                            className={cn(
                              'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                              tone.text,
                              tone.bg,
                            )}
                          >
                            {t(`readiness.verdict.${result.verdict}`)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-foreground">{result.summary}</p>
                      </div>
                    </div>
                  </div>

                  {/* Source disclosure */}
                  {result.source === 'fallback' && (
                    <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                      {t('readiness.fallback_notice')}
                    </div>
                  )}

                  {/* Strengths */}
                  {result.strengths.length > 0 && (
                    <Section
                      icon={<CheckCircle2 className="h-4 w-4 text-[hsl(var(--kuja-grow))]" />}
                      title={t('readiness.strengths')}
                    >
                      <ul className="space-y-1.5 text-sm text-foreground">
                        {result.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[hsl(var(--kuja-grow))]" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Gaps */}
                  {result.gaps.length > 0 && (
                    <Section
                      icon={<AlertOctagon className="h-4 w-4 text-[hsl(var(--kuja-flag))]" />}
                      title={t('readiness.gaps')}
                      subtitle={t('readiness.gaps_subtitle')}
                    >
                      <div className="space-y-2">
                        {result.gaps.map((g, i) => {
                          const sevTone = severityTone[g.severity];
                          const applied = appliedKeys.has(g.criterion_key);
                          return (
                            <div key={i} className="rounded-md border border-border bg-background p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span
                                  className={cn(
                                    'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                                    sevTone.bg,
                                    sevTone.text,
                                  )}
                                >
                                  {sevTone.label}
                                </span>
                                <span className="text-xs font-mono text-muted-foreground">
                                  {g.criterion_key}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-foreground">{g.issue}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {t('readiness.fix_label')}:
                                </span>{' '}
                                {g.suggestion}
                              </p>
                              {g.rewrite && onApplyRewrite && (
                                <div className="mt-2 rounded border border-dashed border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))] p-2">
                                  <div className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-spark))] mb-1 flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" />
                                    {t('readiness.suggested_rewrite')}
                                  </div>
                                  <p className="text-sm italic text-foreground whitespace-pre-line">
                                    {g.rewrite}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => apply(g)}
                                    disabled={applied}
                                    className="mt-2 inline-flex items-center gap-1 rounded bg-[hsl(var(--kuja-spark))] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                                  >
                                    {applied ? <CheckCircle2 className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                                    {applied ? t('readiness.applied') : t('readiness.apply_rewrite')}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Section>
                  )}

                  {/* Missing evidence */}
                  {result.missing_evidence.length > 0 && (
                    <Section
                      icon={<FileQuestion className="h-4 w-4 text-[hsl(var(--kuja-sun))]" />}
                      title={t('readiness.missing_evidence')}
                    >
                      <div className="space-y-2">
                        {result.missing_evidence.map((m, i) => (
                          <div key={i} className="rounded-md border border-border bg-background p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                                {m.evidence_type}
                              </span>
                              <span className="text-xs font-mono text-muted-foreground">{m.criterion_key}</span>
                            </div>
                            <p className="text-sm text-foreground">{m.what}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium">{t('readiness.where_to_find')}:</span> {m.where_to_find}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Overclaims */}
                  {result.overclaims.length > 0 && (
                    <Section
                      icon={<AlertTriangle className="h-4 w-4 text-[hsl(var(--kuja-flag))]" />}
                      title={t('readiness.overclaims')}
                    >
                      <div className="space-y-2">
                        {result.overclaims.map((o, i) => (
                          <div key={i} className="rounded-md border border-border bg-background p-3">
                            <p className="text-sm font-medium text-foreground italic">&ldquo;{o.claim}&rdquo;</p>
                            <p className="mt-1 text-xs text-muted-foreground">{o.why}</p>
                            <p className="mt-2 text-sm text-foreground">
                              <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-grow))] mr-1">
                                {t('readiness.softer')}:
                              </span>
                              {o.softer}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Generic answers */}
                  {result.generic_answers.length > 0 && (
                    <Section
                      icon={<Lightbulb className="h-4 w-4 text-[hsl(var(--kuja-sun))]" />}
                      title={t('readiness.generic_answers')}
                    >
                      <div className="space-y-2">
                        {result.generic_answers.map((g, i) => (
                          <div key={i} className="rounded-md border border-border bg-background p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-muted-foreground">{g.criterion_key}</span>
                            </div>
                            <p className="text-sm text-foreground">{g.issue}</p>
                            <p className="mt-1 text-sm text-foreground">
                              <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-grow))] mr-1">
                                {t('readiness.concrete_alt')}:
                              </span>
                              {g.concrete_alternative}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
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

function Section({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>}
      {children}
    </div>
  );
}
