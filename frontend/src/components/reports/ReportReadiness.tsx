'use client';

/**
 * ReportReadiness — Phase 10.2
 *
 * Pre-submit AI gap analysis for reports, scanned from the donor's
 * perspective: what concerns will a busy program officer flag, what's
 * missing, what reads vague? Goal: catch issues before the donor sends
 * the report back for revision.
 *
 * Surface mirrors SubmissionReadiness:
 *   - readiness score 0-100 with verdict (ready / needs_work / not_ready)
 *   - donor concerns ranked by severity
 *   - missing evidence by section
 *   - vague claims with sharper reframings
 *   - budget variance lines that need explanation
 *   - strengths
 *
 * Gated by ui.report_readiness (default OFF, flipping ON via DB).
 */

import { useState, useCallback } from 'react';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Loader2, Sparkles, X,
  AlertOctagon, FileQuestion, DollarSign,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchReportReadiness, type ReportReadiness as Readiness } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

interface Props {
  reportId: number | null;
  className?: string;
  /**
   * 'button' (default) — small inline button that opens the modal.
   * 'banner' — prominent always-visible banner with title + body + CTA.
   * Use 'banner' on the report draft row so NGOs see the pre-flight
   * promise immediately rather than discovering a small button.
   */
  variant?: 'button' | 'banner';
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

export function ReportReadiness({ reportId, className, variant = 'button' }: Props) {
  const { t } = useTranslation();
  const { enabled } = useFlag('ui.report_readiness');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Readiness | null>(null);

  const run = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    setError(null);
    setOpen(true);
    const res = await fetchReportReadiness(reportId);
    if (res.ok) {
      setResult(res.data.readiness);
    } else {
      setError(res.message || 'Pre-flight failed');
    }
    setLoading(false);
  }, [reportId]);

  if (!enabled) return null;

  const tone = result ? verdictTone[result.verdict] : null;
  const VerdictIcon = tone?.icon ?? ShieldCheck;

  return (
    <>
      {variant === 'banner' ? (
        <div
          className={cn(
            'rounded-xl border-2 border-[hsl(var(--kuja-spark))]/40 bg-gradient-to-br from-[hsl(var(--kuja-spark-soft))]/60 to-[hsl(var(--kuja-spark-soft))]/30 p-4 flex items-start justify-between gap-3 flex-wrap shadow-sm',
            className,
          )}
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="rounded-lg bg-[hsl(var(--kuja-spark))]/10 p-2 flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-[hsl(var(--kuja-spark))]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="kuja-display text-base text-[hsl(var(--kuja-spark))]">
                {t('report_readiness.title')}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {t('report_readiness.intro')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={!reportId || loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 shadow-sm flex-shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? t('report_readiness.checking') : t('report_readiness.check')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={run}
          disabled={!reportId || loading}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark))]/15 disabled:opacity-50',
            className,
          )}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          {loading ? t('report_readiness.checking') : t('report_readiness.check')}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[hsl(var(--kuja-spark))]" />
                <h2 className="kuja-display text-lg">{t('report_readiness.title')}</h2>
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
                  <p className="text-sm">{t('report_readiness.scanning')}</p>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-3 text-sm text-[hsl(var(--kuja-flag))]">
                  {error}
                </div>
              )}

              {result && tone && !loading && (
                <>
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

                  {result.donor_concerns.length > 0 && (
                    <Section
                      icon={<AlertOctagon className="h-4 w-4 text-[hsl(var(--kuja-flag))]" />}
                      title={t('report_readiness.donor_concerns')}
                    >
                      <div className="space-y-2">
                        {result.donor_concerns.map((c, i) => (
                          <div key={i} className="rounded-md border border-border bg-background p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {c.section}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-foreground">{c.concern}</p>
                            <p className="mt-1 text-xs text-muted-foreground italic">{c.why}</p>
                            <p className="mt-1 text-sm text-foreground">
                              <span className="font-medium">{t('readiness.fix_label')}:</span>{' '}
                              {c.suggestion}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

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
                              <span className="text-xs font-mono text-muted-foreground">
                                {m.section}
                              </span>
                            </div>
                            <p className="text-sm text-foreground">{m.what}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium">{t('readiness.where_to_find')}:</span> {m.where_to_find}
                            </p>
                            {m.addresses && <AddressesNote text={m.addresses} t={t} />}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {result.vague_claims.length > 0 && (
                    <Section
                      icon={<AlertTriangle className="h-4 w-4 text-[hsl(var(--kuja-sun))]" />}
                      title={t('report_readiness.vague_claims')}
                    >
                      <div className="space-y-2">
                        {result.vague_claims.map((v, i) => (
                          <div key={i} className="rounded-md border border-border bg-background p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-muted-foreground">
                                {v.section}
                              </span>
                            </div>
                            <p className="text-sm text-foreground italic">&ldquo;{v.claim}&rdquo;</p>
                            <p className="mt-1 text-sm text-foreground">
                              <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-grow))] mr-1">
                                {t('report_readiness.vague_sharper')}:
                              </span>
                              {v.sharper}
                            </p>
                            {v.addresses && <AddressesNote text={v.addresses} t={t} />}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {result.budget_variance_unexplained.length > 0 && (
                    <Section
                      icon={<DollarSign className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />}
                      title={t('report_readiness.budget_variance')}
                    >
                      <div className="space-y-2">
                        {result.budget_variance_unexplained.map((b, i) => (
                          <div key={i} className="rounded-md border border-border bg-background p-3">
                            <p className="text-sm font-semibold text-foreground">{b.line}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{b.variance}</p>
                            <p className="mt-1 text-sm text-foreground">
                              <span className="font-medium">{t('readiness.fix_label')}:</span>{' '}
                              {b.suggestion}
                            </p>
                            {b.addresses && <AddressesNote text={b.addresses} t={t} />}
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
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/**
 * AddressesNote — Phase 11.4
 *
 * Renders the "this fix resolves: <concern>" line below each fix item
 * so NGOs can see WHAT donor concern they're closing, not just a
 * generic to-do. The team's polish ask: "explanation of what concern
 * each fix resolves."
 */
function AddressesNote({
  text, t,
}: { text: string; t: (key: string) => string }) {
  return (
    <div className="mt-2 flex items-start gap-1.5 rounded border-l-2 border-[hsl(var(--kuja-clay))]/50 bg-[hsl(var(--kuja-clay))]/5 px-2 py-1">
      <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-clay))] flex-shrink-0">
        {t('report_readiness.addresses')}:
      </span>
      <span className="text-xs text-foreground">{text}</span>
    </div>
  );
}
