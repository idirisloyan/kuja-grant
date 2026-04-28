'use client';

/**
 * ReviewerSummary — Phase 10.3
 *
 * One-screen reviewer summary with extracted evidence per criterion and
 * an editable draft rationale. The team's spec: "summarize each
 * application in one screen, extract evidence for and against each
 * criterion, propose a rationale the reviewer can edit, not write from
 * scratch." This is the reviewer-time-saving move.
 *
 * The draft rationale is intentionally editable — we paste it into the
 * comment field for the highest-weighted criterion if the reviewer
 * accepts it. Reviewers retain full agency.
 *
 * Gated by ui.reviewer_summary (default OFF).
 */

import { useState, useCallback } from 'react';
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, Flag, FileText,
  ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Copy, Check,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchReviewerSummary, type ReviewerSummary as Summary, type ReviewerJudgment } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  applicationId: number | null;
  /** When the reviewer clicks "Use this rationale", paste it into a comment field. */
  onUseRationale?: (rationale: string) => void;
  className?: string;
}

const judgmentTone: Record<ReviewerJudgment, { bg: string; text: string; label: string }> = {
  strong:   { bg: 'bg-[hsl(142_68%_96%)]', text: 'text-[hsl(var(--kuja-grow))]', label: 'STRONG' },
  adequate: { bg: 'bg-[hsl(38_92%_96%)]',  text: 'text-[hsl(var(--kuja-sun))]',  label: 'ADEQUATE' },
  thin:     { bg: 'bg-[hsl(0_85%_96%)]',   text: 'text-[hsl(var(--kuja-flag))]', label: 'THIN' },
};

export function ReviewerSummary({ applicationId, onUseRationale, className }: Props) {
  const { t } = useTranslation();
  const { enabled } = useFlag('ui.reviewer_summary');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editedRationale, setEditedRationale] = useState('');
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    const res = await fetchReviewerSummary(applicationId);
    if (res.ok) {
      setSummary(res.data.summary);
      setEditedRationale(res.data.summary.draft_rationale || '');
      setExpanded(true);
    } else {
      setError(res.message || 'AI summary failed');
    }
    setLoading(false);
  }, [applicationId]);

  const copy = useCallback(async () => {
    if (!editedRationale) return;
    try {
      await navigator.clipboard.writeText(editedRationale);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('reviewer_summary.copy_failed'));
    }
  }, [editedRationale, t]);

  const useRationale = useCallback(() => {
    if (onUseRationale && editedRationale) {
      onUseRationale(editedRationale);
      toast.success(t('reviewer_summary.rationale_used'));
    }
  }, [onUseRationale, editedRationale, t]);

  if (!enabled) return null;

  return (
    <div className={cn('rounded-xl border border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))]/30', className)}>
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[hsl(var(--kuja-spark))]" />
          <span className="text-sm font-semibold text-[hsl(var(--kuja-spark))]">
            {t('reviewer_summary.title')}
          </span>
          {summary?.source === 'fallback' && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {t('reviewer_summary.fallback_label')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!summary && (
            <button
              type="button"
              onClick={run}
              disabled={!applicationId || loading}
              className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {loading ? t('reviewer_summary.generating') : t('reviewer_summary.generate')}
            </button>
          )}
          {summary && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="rounded p-1 hover:bg-muted"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-3 rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-2 text-xs text-[hsl(var(--kuja-flag))]">
          {error}
        </div>
      )}

      {summary && expanded && (
        <div className="border-t border-[hsl(var(--kuja-spark))]/20 p-3 space-y-3">
          {/* Executive read */}
          {summary.one_screen_summary && (
            <div className="rounded-md bg-background/80 p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
                {t('reviewer_summary.executive_read')}
              </div>
              <p className="text-sm text-foreground leading-relaxed">{summary.one_screen_summary}</p>
            </div>
          )}

          {/* NGO + program one-liners */}
          {(summary.who_is_the_ngo || summary.what_they_propose) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {summary.who_is_the_ngo && (
                <div className="rounded-md bg-background/80 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-0.5">
                    {t('reviewer_summary.who')}
                  </div>
                  <p className="text-xs text-foreground">{summary.who_is_the_ngo}</p>
                </div>
              )}
              {summary.what_they_propose && (
                <div className="rounded-md bg-background/80 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-0.5">
                    {t('reviewer_summary.what')}
                  </div>
                  <p className="text-xs text-foreground">{summary.what_they_propose}</p>
                </div>
              )}
            </div>
          )}

          {/* Why strong / Why weak */}
          {(summary.why_strong.length > 0 || summary.why_weak.length > 0) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {summary.why_strong.length > 0 && (
                <div className="rounded-md bg-[hsl(142_68%_98%)] border border-[hsl(142_55%_88%)] p-2.5">
                  <div className="flex items-center gap-1 mb-1.5">
                    <ThumbsUp className="h-3 w-3 text-[hsl(var(--kuja-grow))]" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-grow))]">
                      {t('reviewer_summary.why_strong')}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-foreground">
                    {summary.why_strong.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-[hsl(var(--kuja-grow))]" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.why_weak.length > 0 && (
                <div className="rounded-md bg-[hsl(0_85%_98%)] border border-[hsl(0_55%_88%)] p-2.5">
                  <div className="flex items-center gap-1 mb-1.5">
                    <ThumbsDown className="h-3 w-3 text-[hsl(var(--kuja-flag))]" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-flag))]">
                      {t('reviewer_summary.why_weak')}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-foreground">
                    {summary.why_weak.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-[hsl(var(--kuja-flag))]" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Per-criterion evidence */}
          {summary.evidence_per_criterion.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                {t('reviewer_summary.evidence_per_criterion')}
              </div>
              {summary.evidence_per_criterion.map((c, i) => {
                const tone = judgmentTone[c.judgment];
                return (
                  <div key={i} className="rounded-md border border-border bg-background/80 p-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-foreground">{c.criterion_label || c.criterion_key}</span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                          tone.bg,
                          tone.text,
                        )}
                      >
                        {tone.label}
                      </span>
                    </div>
                    {c.evidence_for.length > 0 && (
                      <div className="space-y-1 mb-1.5">
                        {c.evidence_for.map((q, j) => (
                          <div key={j} className="border-l-2 border-[hsl(var(--kuja-grow))] pl-2 py-0.5">
                            <p className="text-xs italic text-foreground">&ldquo;{q.quote}&rdquo;</p>
                            {q.why && <p className="text-[10px] text-muted-foreground">{q.why}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {c.evidence_against.length > 0 && (
                      <div className="space-y-1">
                        {c.evidence_against.map((q, j) => (
                          <div key={j} className="border-l-2 border-[hsl(var(--kuja-flag))] pl-2 py-0.5">
                            <p className="text-xs italic text-foreground">&ldquo;{q.quote}&rdquo;</p>
                            {q.why && <p className="text-[10px] text-muted-foreground">{q.why}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Red flags */}
          {summary.red_flags.length > 0 && (
            <div className="rounded-md border border-[hsl(var(--kuja-flag))]/40 bg-[hsl(0_85%_98%)] p-2.5">
              <div className="flex items-center gap-1 mb-1.5">
                <Flag className="h-3 w-3 text-[hsl(var(--kuja-flag))]" />
                <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-flag))]">
                  {t('reviewer_summary.red_flags')}
                </span>
              </div>
              <ul className="space-y-1 text-xs text-foreground">
                {summary.red_flags.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Comparable signal */}
          {summary.comparable_signal && (
            <div className="rounded-md bg-muted/30 p-2.5">
              <div className="flex items-center gap-1 mb-0.5">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  {t('reviewer_summary.comparable')}
                </span>
              </div>
              <p className="text-xs text-foreground">{summary.comparable_signal}</p>
            </div>
          )}

          {/* Editable rationale */}
          {summary.draft_rationale && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  {t('reviewer_summary.draft_rationale')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] hover:bg-muted"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? t('reviewer_summary.copied') : t('reviewer_summary.copy')}
                  </button>
                  {onUseRationale && (
                    <button
                      type="button"
                      onClick={useRationale}
                      className="inline-flex items-center gap-1 rounded bg-[hsl(var(--kuja-spark))] px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90"
                    >
                      <Sparkles className="h-3 w-3" />
                      {t('reviewer_summary.use_rationale')}
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={editedRationale}
                onChange={(e) => setEditedRationale(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-spark))]"
              />
              <p className="mt-1 text-[10px] text-muted-foreground italic">
                {t('reviewer_summary.editable_note')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
