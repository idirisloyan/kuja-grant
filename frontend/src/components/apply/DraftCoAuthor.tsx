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
import { Sparkles, Loader2, X, CheckCircle2, AlertTriangle, Brain } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import {
  fetchDraftApplication,
  type ApplicationDraft,
  type MemoryUsedItem,
} from '@/lib/copilot-api';
import { AIConfidenceBadge } from '@/components/shared/ai-confidence-badge';
import { ProvenanceChips } from '@/components/shared/provenance-chips';
import { toast } from 'sonner';

interface Props {
  grantId: number;
  applicationId: number | null;
  /** Called after a successful draft so the parent can refresh the form. */
  onApplied?: (draft: ApplicationDraft) => void;
  className?: string;
}

export function DraftCoAuthor({ grantId, applicationId, onApplied, className = '' }: Props) {
  const { t } = useTranslation();
  const formatError = useApiError();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [memoryUsed, setMemoryUsed] = useState<MemoryUsedItem[]>([]);
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
      setMemoryUsed(res.data.memory_used ?? []);
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
          {/* Phase 11.2 — "Drew on N facts from your memory" transparency.
              The team's spec: "visible proof that memory is being used" +
              "reused in this draft signals." Each item shows kind+label so
              the NGO sees exactly what the AI pulled. */}
          {memoryUsed.length > 0 && (
            <div className="rounded-md border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[hsl(var(--kuja-clay))]">
                <Brain className="h-3.5 w-3.5" />
                {t('coauthor.memory_used_title', { n: memoryUsed.length })}
              </div>
              <ul className="space-y-1">
                {memoryUsed.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start gap-2 text-[11px] text-foreground"
                  >
                    <span className="mt-0.5 inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex-shrink-0">
                      {m.kind}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold">{m.label || '—'}</span>
                      {m.label && ' — '}
                      <span className="text-muted-foreground">
                        {m.content.length > 120
                          ? `${m.content.slice(0, 117)}…`
                          : m.content}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] italic text-muted-foreground">
                {t('coauthor.memory_used_note')}
              </p>
            </div>
          )}

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
                const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
                // Filter draft.claim_provenance down to this criterion so we
                // can show the chip count + lazy-load the rest on demand.
                const criterionProvenance = draft.claim_provenance.filter(
                  (p) => p.criterion_key === key,
                );
                return (
                  <li
                    key={key}
                    className="rounded-md border border-border bg-background px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{key}</span>
                      <AIConfidenceBadge confidence={conf} variant="badge" />
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {text}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{t('applications.word_count', { n: wordCount })}</span>
                      {criterionProvenance.length > 0 && applicationId != null && (
                        <ProvenanceChips
                          subjectKind="application"
                          subjectId={applicationId}
                          subjectField={key}
                          // Pre-populate from the draft response to avoid an
                          // immediate refetch — same shape as the backend row.
                          rows={criterionProvenance.map((p, i) => ({
                            id: -i - 1,
                            ai_call_id: null,
                            subject: { kind: 'application', id: applicationId, field: key },
                            claim: p.claim,
                            source: {
                              kind: p.source_kind,
                              id: p.source_id ?? null,
                              locator: p.source_locator ?? null,
                              excerpt: p.source_excerpt ?? null,
                            },
                            confidence: p.confidence,
                            created_at: new Date().toISOString(),
                          }))}
                        />
                      )}
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
