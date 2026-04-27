'use client';

/**
 * DraftCoAuthor — Phase 1.1
 *
 * The "Generate first draft" experience on the application form. Lets an
 * NGO type a brief in any language and get a complete first draft of every
 * criterion + eligibility response, with per-claim provenance and per-
 * criterion confidence chips. The draft fills empty fields by default
 * (non-destructive); users can toggle "replace my existing answers" to
 * regenerate over a draft they want to discard.
 *
 * Design choices:
 *   - The brief is OPTIONAL. A 0-character brief produces a strong default
 *     first cut from the org profile + grant criteria alone — that's the
 *     "I have nothing yet" entry point. With a brief, the AI tailors more.
 *   - Confidence chips are shown PER CRITERION (high/medium/low) so the
 *     user knows which sections need their attention vs which the AI
 *     grounded confidently.
 *   - voice_note surfaces above the per-criterion preview so the user can
 *     understand the AI's tonal choices in one line.
 *   - After applying, we ask for a helpfulness signal (used/edited/dismissed)
 *     on close. This feeds back into Phase 9.2's AI helpfulness dashboard.
 */

import { useState } from 'react';
import { Sparkles, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import {
  fetchDraftApplication,
  type ApplicationDraft,
} from '@/lib/copilot-api';
import { toast } from 'sonner';

interface Props {
  grantId: number;
  applicationId: number | null;
  /** Called after a successful draft so the parent can refresh the form. */
  onApplied?: (draft: ApplicationDraft) => void;
  className?: string;
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-rose-200 bg-rose-50 text-rose-800',
};

export function DraftCoAuthor({ grantId, applicationId, onApplied, className = '' }: Props) {
  const { t } = useTranslation();
  const formatError = useApiError();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const briefMaxLen = 500;

  const run = async () => {
    if (!grantId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchDraftApplication({
        grant_id: grantId,
        application_id: applicationId ?? undefined,
        brief: brief.trim() || undefined,
        replace_existing: replaceExisting,
        save: applicationId != null,
      });
      if (!res.ok) {
        setErrorMsg(res.message);
        return;
      }
      setDraft(res.data.draft);
      if (res.data.application_id && onApplied) {
        onApplied(res.data.draft);
      }
      const provCount = res.data.provenance_saved;
      toast.success(
        t('coauthor.toast.draft_ready', {
          n: Object.keys(res.data.draft.responses || {}).length,
          provenance: provCount,
        }),
      );
    } catch (e) {
      const norm = formatError(e);
      setErrorMsg(norm.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:opacity-90 ${className}`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t('coauthor.cta.open')}
      </button>
    );
  }

  return (
    <div
      className={`rounded-[12px] border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-4 ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--kuja-spark))]">
          <Sparkles className="h-4 w-4" />
          <span>{t('coauthor.heading')}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setDraft(null);
            setErrorMsg(null);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={t('common.close')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-foreground/80">
        {t('coauthor.subtitle')}
      </p>

      {!draft && (
        <>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('coauthor.brief_label')}
          </label>
          <textarea
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value.slice(0, briefMaxLen))}
            placeholder={t('coauthor.brief_placeholder')}
            disabled={loading}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
          />
          <div className="mt-0.5 flex justify-end text-[10px] text-muted-foreground">
            {brief.length}/{briefMaxLen}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-input accent-[hsl(var(--kuja-clay))]"
            />
            <span>{t('coauthor.replace_existing')}</span>
          </label>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? t('coauthor.cta.generating') : t('coauthor.cta.generate')}
            </button>
          </div>

          {errorMsg && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </>
      )}

      {draft && (
        <div className="space-y-3">
          {draft.voice_note && (
            <div className="rounded-md border border-border bg-background p-2.5 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                {t('coauthor.voice_note_label')}:
              </span>{' '}
              {draft.voice_note}
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('coauthor.draft_summary', {
                n: Object.keys(draft.responses || {}).length,
                citations: draft.claim_provenance.length,
              })}
            </div>

            <ul className="space-y-1.5">
              {Object.entries(draft.responses || {}).map(([key, text]) => {
                const conf = draft.confidence_per_criterion?.[key] || 'medium';
                const tone = CONFIDENCE_TONE[conf] || CONFIDENCE_TONE.medium;
                const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
                return (
                  <li
                    key={key}
                    className="rounded-md border border-border bg-background px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{key}</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
                      >
                        {t(`coauthor.confidence.${conf}`)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {text}
                    </p>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {t('applications.word_count', { n: wordCount })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {draft.claim_provenance.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('coauthor.provenance_label')}
              </div>
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {draft.claim_provenance.slice(0, 5).map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 inline-flex flex-shrink-0 items-center rounded-full border border-border bg-background px-1.5 py-0 text-[10px]">
                      {p.source_kind}
                      {p.source_locator ? ` · ${p.source_locator}` : ''}
                    </span>
                    <span className="line-clamp-2">{p.claim}</span>
                  </li>
                ))}
                {draft.claim_provenance.length > 5 && (
                  <li className="text-muted-foreground">
                    +{draft.claim_provenance.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-[hsl(var(--kuja-spark-soft))] pt-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {applicationId
                ? t('coauthor.applied_to_form')
                : t('coauthor.preview_only')}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setBrief('');
              }}
              className="text-xs font-medium text-[hsl(var(--kuja-clay))] hover:underline"
            >
              {t('coauthor.cta.regenerate')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
