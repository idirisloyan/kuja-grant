'use client';

/**
 * ReportDraftCoAuthor — Phase 1.3 UI
 *
 * Companion to DraftCoAuthor for the reports page. NGO clicks "Generate
 * draft", optionally adds free-form notes about what happened this period
 * ("we trained 60 CHWs in Q3, attendance sheets attached"), and AI
 * produces a complete first-draft report covering every requirement +
 * KPI value. Gaps list is surfaced explicitly so the NGO knows what
 * evidence still needs to be uploaded.
 */

import { useState } from 'react';
import { Sparkles, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import {
  fetchDraftReport,
  type ReportDraft,
} from '@/lib/copilot-api';
import { AIConfidenceBadge } from '@/components/shared/ai-confidence-badge';
import { toast } from 'sonner';

interface Props {
  reportId: number;
  onApplied?: (draft: ReportDraft) => void;
  className?: string;
}

export function ReportDraftCoAuthor({ reportId, onApplied, className = '' }: Props) {
  const { t } = useTranslation();
  const formatError = useApiError();
  const { enabled, ready } = useFlag('ai.draft_report');
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!ready || !enabled) return null;

  const max = 3000;

  const run = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchDraftReport({
        report_id: reportId,
        notes: notes.trim() || undefined,
        replace_existing: replaceExisting,
      });
      if (!res.ok) {
        setErrorMsg(res.message);
        return;
      }
      setDraft(res.data.draft);
      onApplied?.(res.data.draft);
      toast.success(
        t('report_coauthor.toast.draft_ready', {
          n: Object.keys(res.data.draft.sections || {}).length,
          gaps: (res.data.draft.gaps || []).length,
        }),
      );
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
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:opacity-90 ${className}`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t('report_coauthor.cta.open')}
      </button>
    );
  }

  return (
    <div
      className={`mt-1 rounded-[10px] border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-3 space-y-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--kuja-spark))]">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{t('report_coauthor.heading')}</span>
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

      {!draft && (
        <>
          <p className="text-xs leading-relaxed text-foreground/80">
            {t('report_coauthor.subtitle')}
          </p>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, max))}
            placeholder={t('report_coauthor.notes_placeholder')}
            disabled={loading}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-input accent-[hsl(var(--kuja-clay))]"
              />
              <span>{t('report_coauthor.replace_existing')}</span>
            </label>
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {loading ? t('report_coauthor.cta.generating') : t('report_coauthor.cta.generate')}
            </button>
          </div>
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </>
      )}

      {draft && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('report_coauthor.sections_summary', {
                n: Object.keys(draft.sections || {}).length,
              })}
            </div>
            <ul className="space-y-1.5">
              {Object.entries(draft.sections || {}).map(([key, text]) => {
                const conf = draft.confidence_per_section?.[key] || 'medium';
                const wc = text.trim() ? text.trim().split(/\s+/).length : 0;
                return (
                  <li key={key} className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{key}</span>
                      <AIConfidenceBadge confidence={conf} variant="badge" />
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{text}</p>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {t('applications.word_count', { n: wc })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {draft.gaps && draft.gaps.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                {t('report_coauthor.gaps_label', { n: draft.gaps.length })}
              </div>
              <ul className="space-y-1 text-xs">
                {draft.gaps.map((g, i) => (
                  <li key={i} className="rounded-md border border-amber-200 bg-amber-50 p-2">
                    <div className="font-medium text-amber-900">{g.section_key}</div>
                    <div className="mt-0.5 text-amber-800">{g.issue}</div>
                    <div className="mt-1 text-[11px] italic text-amber-900">
                      → {g.what_to_provide}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-[hsl(var(--kuja-spark-soft))] pt-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('report_coauthor.applied_to_form')}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setNotes('');
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
