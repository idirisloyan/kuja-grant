'use client';

/**
 * PreviewAsReviewer — Phase 4.1
 *
 * The NGO clicks "Preview as reviewer" and sees their submission laid out
 * exactly the way the reviewer scoring page will render it. This is the
 * "moment of truth" surface: NGOs immediately see which criteria are thin,
 * which read strong, which need more evidence — before they submit.
 *
 * No new backend is required: we render the responses + grant criteria
 * the NGO already has in local state, with read-only word-count badges
 * and a heuristic completeness signal so the NGO knows what the reviewer
 * will see at a glance.
 *
 * Heuristic completeness:
 *   strong   = ≥80% of max_words AND mentions criterion keywords
 *   adequate = ≥40% of max_words
 *   thin     = below 40% or empty
 *
 * Gated by ui.preview_as_reviewer (default OFF).
 */

import { useState } from 'react';
import { Eye, X, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { cn } from '@/lib/utils';
import type { Criterion } from '@/lib/types';

interface Props {
  criteria: Criterion[];
  responses: Record<string, string>;
  /** Optional grant title, shown in the modal header. */
  grantTitle?: string;
  className?: string;
}

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function completeness(text: string, maxWords: number, criterionLabel: string): {
  level: 'strong' | 'adequate' | 'thin';
  pct: number;
} {
  const wc = wordCount(text);
  const target = maxWords || 500;
  const pct = Math.min(100, Math.round((wc / target) * 100));
  if (pct >= 80) {
    // Light keyword check — if the criterion has identifiable terms in
    // its label and the response references them at all, treat as strong.
    const labelTokens = (criterionLabel || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3);
    const lower = text.toLowerCase();
    const hasKeyword = labelTokens.some((t) => lower.includes(t));
    return { level: hasKeyword ? 'strong' : 'adequate', pct };
  }
  if (pct >= 40) return { level: 'adequate', pct };
  return { level: 'thin', pct };
}

const TONE: Record<string, string> = {
  strong: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  adequate: 'border-amber-200 bg-amber-50 text-amber-800',
  thin: 'border-rose-200 bg-rose-50 text-rose-800',
};

export function PreviewAsReviewer({ criteria, responses, grantTitle, className = '' }: Props) {
  const { t } = useTranslation();
  const { enabled, ready } = useFlag('ui.preview_as_reviewer');
  const [open, setOpen] = useState(false);

  if (!ready || !enabled) return null;

  const totals = criteria.reduce(
    (acc, c) => {
      const text = responses[c.key] ?? '';
      const r = completeness(text, c.max_words || 500, c.label);
      acc[r.level] = (acc[r.level] || 0) + 1;
      return acc;
    },
    { strong: 0, adequate: 0, thin: 0 } as Record<string, number>,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted',
          className,
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        {t('preview_reviewer.cta.open')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/40 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl rounded-xl border border-border bg-background shadow-[var(--kuja-elev-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-xl border-b border-border bg-card px-5 py-4">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--kuja-clay))]">
                  <Eye className="h-4 w-4" />
                  {t('preview_reviewer.heading')}
                </div>
                {grantTitle && (
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">{grantTitle}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label={t('common.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-5 py-4">
              <p className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {t('preview_reviewer.subtitle')}
              </p>

              {/* Summary row */}
              <div className="mb-5 flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('preview_reviewer.count.strong', { n: totals.strong })}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                  <FileText className="h-3 w-3" />
                  {t('preview_reviewer.count.adequate', { n: totals.adequate })}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-medium text-rose-800">
                  <AlertTriangle className="h-3 w-3" />
                  {t('preview_reviewer.count.thin', { n: totals.thin })}
                </span>
              </div>

              {/* Per-criterion preview */}
              <ol className="space-y-4">
                {criteria.map((c) => {
                  const text = responses[c.key] ?? '';
                  const wc = wordCount(text);
                  const r = completeness(text, c.max_words || 500, c.label);
                  return (
                    <li
                      key={c.key}
                      className="rounded-md border border-border bg-card p-4"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{c.label}</div>
                          {c.description && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {c.description}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {c.weight}%
                          </span>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                              TONE[r.level],
                            )}
                          >
                            {t(`preview_reviewer.level.${r.level}`)}
                            <span className="ml-0.5">· {r.pct}%</span>
                          </span>
                        </div>
                      </div>
                      <p className={cn(
                        'whitespace-pre-wrap text-sm',
                        text ? 'text-foreground' : 'italic text-muted-foreground/60',
                      )}>
                        {text || t('preview_reviewer.empty_response')}
                      </p>
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        {t('applications.word_count', { n: wc })}
                        {c.max_words ? ` / ${c.max_words}` : ''}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {totals.thin > 0 && (
                <div className="mt-5 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{t('preview_reviewer.thin_warning', { n: totals.thin })}</span>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 rounded-b-xl border-t border-border bg-card px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {t('preview_reviewer.cta.back_to_edit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
