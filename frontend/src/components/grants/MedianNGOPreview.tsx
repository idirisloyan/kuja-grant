'use client';

/**
 * MedianNGOPreview — Phase 2.1
 *
 * Donor-facing diagnostic. After drafting a grant, the donor clicks
 * "Preview applicant pool" and AI shows them what a median qualifying NGO
 * is likely to submit, plus rates how well each criterion will discriminate
 * between strong and weak applicants. The signal that matters most:
 * "low discrimination" criteria — the ones every applicant will write the
 * same answer for — are the donor's #1 fix-before-publish target.
 *
 * Gated by ai.median_ngo_preview (default OFF until verified per-org).
 */

import { useState } from 'react';
import {
  Eye, Loader2, X, AlertTriangle, CheckCircle2, TrendingUp, Wrench,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchMedianNGOPreview, type MedianNGOPreview as PreviewT } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

interface Props {
  /** Grant id when saved, else pass the unsaved draft via `grantDraft`. */
  grantId?: number | null;
  grantDraft?: {
    title?: string;
    description?: string;
    criteria?: Array<{ key: string; label: string; weight: number; description?: string }>;
    eligibility?: Array<{ key: string; label: string; details?: string }>;
  };
  className?: string;
}

const DISC_TONE: Record<string, string> = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-rose-200 bg-rose-50 text-rose-800',
};

const HEALTH_TONE: Record<string, string> = {
  strong: 'text-emerald-700',
  mixed: 'text-amber-700',
  weak: 'text-rose-700',
};

export function MedianNGOPreview({ grantId, grantDraft, className = '' }: Props) {
  const { t } = useTranslation();
  const formatError = useApiError();
  const { enabled, ready } = useFlag('ai.median_ngo_preview');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewT | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!ready || !enabled) return null;

  const run = async () => {
    if (!grantId && !grantDraft) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchMedianNGOPreview(
        grantId ? { grant_id: grantId } : { grant: grantDraft },
      );
      if (res.ok) setPreview(res.data.preview);
      else setErrorMsg(res.message);
    } catch (e) {
      setErrorMsg(formatError(e).message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          run();
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:opacity-90',
          className,
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        {t('median_preview.cta.open')}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-[12px] border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/30 p-4',
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--kuja-spark))]">
            <Eye className="h-4 w-4" />
            {t('median_preview.heading')}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('median_preview.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setErrorMsg(null);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={t('common.close')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('median_preview.loading')}
        </div>
      )}

      {!loading && errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!loading && preview && (
        <div className="space-y-3">
          {/* Header summary */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-semibold',
                HEALTH_TONE[preview.overall_health] || HEALTH_TONE.mixed,
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              {t(`median_preview.health.${preview.overall_health}`)}
            </span>
            {preview.rationale && (
              <p className="text-xs text-muted-foreground">{preview.rationale}</p>
            )}
          </div>

          {/* Discrimination scoreboard */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('median_preview.discrimination_label')}
            </div>
            <ul className="space-y-1">
              {Object.entries(preview.discrimination_score).map(([key, level]) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-1.5"
                >
                  <span className="truncate text-xs font-semibold">{key}</span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                      DISC_TONE[level] || DISC_TONE.medium,
                    )}
                  >
                    {t(`median_preview.discrimination.${level}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tightenings — donor's biggest fix opportunities */}
          {preview.tightenings && preview.tightenings.length > 0 && (
            <div>
              <div className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Wrench className="h-3 w-3" />
                {t('median_preview.tightenings_label')}
              </div>
              <ul className="space-y-1.5">
                {preview.tightenings.map((tg, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-amber-200 bg-amber-50/40 p-2.5"
                  >
                    <div className="text-[11px] font-semibold text-amber-900">
                      {tg.criterion_key}
                    </div>
                    <div className="mt-0.5 text-xs text-amber-900/80">{tg.current_problem}</div>
                    <div className="mt-1 text-xs italic text-amber-900">
                      → {tg.rewrite_hint}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pitfalls — what most applicants will get wrong */}
          {preview.common_pitfalls && preview.common_pitfalls.length > 0 && (
            <div>
              <div className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                {t('median_preview.pitfalls_label')}
              </div>
              <ul className="space-y-1 text-xs">
                {preview.common_pitfalls.map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 inline-flex flex-shrink-0 items-center rounded-full border border-border bg-background px-1.5 py-0 text-[10px] font-medium">
                      {p.criterion_key}
                    </span>
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{p.issue}</strong> · {p.suggestion}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sample median responses (collapsed by default to save space) */}
          {Object.keys(preview.preview_responses).length > 0 && (
            <details className="rounded-md border border-border bg-background p-2 text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                {t('median_preview.sample_responses_label', {
                  n: Object.keys(preview.preview_responses).length,
                })}
              </summary>
              <ol className="mt-2 space-y-2">
                {Object.entries(preview.preview_responses).map(([key, text]) => (
                  <li key={key} className="rounded-md border border-border bg-card p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {key}
                    </div>
                    <p className="mt-1 line-clamp-4 text-xs text-foreground">{text}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
