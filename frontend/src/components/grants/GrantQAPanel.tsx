'use client';

/**
 * GrantQAPanel — Phase 4.3 UI
 *
 * Inline questions on a grant. Renders both sides of the conversation:
 *   - NGO mode: lists every answered question + their own pending; can ask new
 *   - Donor mode: lists every question (incl. pending + moderated); can answer
 *                 or moderate
 *
 * Visibility rules are enforced server-side; the UI just adapts what
 * affordances it shows based on the caller's role.
 *
 * Anchored questions (about a specific criterion / eligibility item) render
 * with a small chip showing the anchor, so the donor can quickly see what
 * the question is about and other NGOs can match it to the right field.
 */

import { useEffect, useState } from 'react';
import {
  MessageSquare,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Send,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import { useAuthStore } from '@/stores/auth-store';
import {
  fetchGrantQuestions,
  postGrantQuestion,
  answerGrantQuestion,
  moderateGrantQuestion,
  type GrantQuestion,
} from '@/lib/copilot-api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  grantId: number;
  /** When set, the panel is anchored to a specific criterion/eligibility/doc.
   *  Anchored mode only shows questions for that anchor + the new-question
   *  form prefills with the anchor; useful inline next to a criterion. */
  anchorKind?: 'criterion' | 'eligibility' | 'document';
  anchorKey?: string;
  /** Override visual density. 'compact' is suitable for sidebar surfaces. */
  variant?: 'default' | 'compact';
  className?: string;
}

const STATUS_TONE: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  answered: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  moderated: 'border-rose-200 bg-rose-50 text-rose-800',
};

export function GrantQAPanel({
  grantId,
  anchorKind,
  anchorKey,
  variant = 'default',
  className = '',
}: Props) {
  const { t, formatDate } = useTranslation();
  const formatError = useApiError();
  const role = useAuthStore((s) => s.user?.role);
  const isDonor = role === 'donor' || role === 'admin';
  const isNgo = role === 'ngo';

  const [questions, setQuestions] = useState<GrantQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state — NGO ask
  const [askText, setAskText] = useState('');
  // Donor answer state per question
  const [answerByQ, setAnswerByQ] = useState<Record<number, string>>({});
  const [savingQ, setSavingQ] = useState<Record<number, boolean>>({});

  const reload = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchGrantQuestions(grantId);
      if (res.ok) {
        let qs = res.data.questions;
        // When anchored, filter client-side so we only render relevant rows.
        if (anchorKind && anchorKey) {
          qs = qs.filter(
            (q) => q.anchor_kind === anchorKind && q.anchor_key === anchorKey,
          );
        }
        setQuestions(qs);
      } else {
        setErrorMsg(res.message);
        setQuestions([]);
      }
    } catch (e) {
      setErrorMsg(formatError(e).message);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantId, anchorKind, anchorKey]);

  const ask = async () => {
    if (!askText.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await postGrantQuestion({
        grant_id: grantId,
        question: askText.trim(),
        anchor_kind: anchorKind,
        anchor_key: anchorKey,
      });
      if (res.ok) {
        setAskText('');
        toast.success(t('grant_qa.toast.asked'));
        reload();
      } else {
        setErrorMsg(res.message);
      }
    } catch (e) {
      setErrorMsg(formatError(e).message);
    } finally {
      setSubmitting(false);
    }
  };

  const answer = async (qid: number) => {
    const text = (answerByQ[qid] || '').trim();
    if (!text) return;
    setSavingQ((s) => ({ ...s, [qid]: true }));
    try {
      const res = await answerGrantQuestion(grantId, qid, text);
      if (res.ok) {
        toast.success(t('grant_qa.toast.answered'));
        setAnswerByQ((s) => ({ ...s, [qid]: '' }));
        reload();
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(formatError(e).message);
    } finally {
      setSavingQ((s) => ({ ...s, [qid]: false }));
    }
  };

  const moderate = async (qid: number) => {
    if (!confirm(t('grant_qa.confirm_moderate'))) return;
    try {
      const res = await moderateGrantQuestion(grantId, qid);
      if (res.ok) {
        toast.success(t('grant_qa.toast.moderated'));
        reload();
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(formatError(e).message);
    }
  };

  if (!isDonor && !isNgo) return null; // reviewers can technically read, but UI is for NGO+donor

  const isCompact = variant === 'compact';

  return (
    <div
      className={cn(
        'rounded-[10px] border border-border bg-card',
        isCompact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquare className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        {anchorKind && anchorKey
          ? t('grant_qa.heading_anchored', { anchor: anchorKey })
          : t('grant_qa.heading')}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {isDonor ? t('grant_qa.donor_subtitle') : t('grant_qa.ngo_subtitle')}
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('grant_qa.loading')}
        </div>
      )}

      {!loading && questions && questions.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground">
          {t('grant_qa.empty')}
        </div>
      )}

      {!loading && questions && questions.length > 0 && (
        <ul className="space-y-2.5">
          {questions.map((q) => {
            const tone = STATUS_TONE[q.status] || STATUS_TONE.pending;
            const showAnswerForm =
              isDonor && (q.status === 'pending' || !q.answer);
            const showModerate = isDonor && q.status !== 'moderated';
            return (
              <li
                key={q.id}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                        tone,
                      )}
                    >
                      {t(`grant_qa.status.${q.status}`)}
                    </span>
                    {q.anchor_kind && q.anchor_key && (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {q.anchor_kind} · {q.anchor_key}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {q.created_at && formatDate(q.created_at)}
                    </span>
                  </div>
                  {showModerate && (
                    <button
                      type="button"
                      onClick={() => moderate(q.id)}
                      title={t('grant_qa.cta.moderate')}
                      className="text-[10px] text-muted-foreground hover:text-rose-700"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                  {q.question}
                </p>

                {q.answer && (
                  <div className="mt-2 rounded-md border-l-2 border-emerald-300 bg-emerald-50/50 p-2">
                    <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('grant_qa.answer_label')}
                      {q.answered_at && (
                        <span className="ml-1 font-normal text-emerald-700/70">
                          · {formatDate(q.answered_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-emerald-900">
                      {q.answer}
                    </p>
                  </div>
                )}

                {showAnswerForm && (
                  <div className="mt-2">
                    <textarea
                      rows={2}
                      value={answerByQ[q.id] || ''}
                      onChange={(e) =>
                        setAnswerByQ((s) => ({ ...s, [q.id]: e.target.value }))
                      }
                      placeholder={t('grant_qa.answer_placeholder')}
                      disabled={!!savingQ[q.id]}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
                    />
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => answer(q.id)}
                        disabled={!!savingQ[q.id] || !(answerByQ[q.id] || '').trim()}
                        className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {savingQ[q.id] ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {t('grant_qa.cta.answer')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* New question form — NGO only */}
      {isNgo && (
        <div className="mt-3 border-t border-border pt-3">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('grant_qa.ask_label')}
          </label>
          <textarea
            rows={2}
            value={askText}
            onChange={(e) => setAskText(e.target.value.slice(0, 2000))}
            placeholder={t('grant_qa.ask_placeholder')}
            disabled={submitting}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] disabled:opacity-60"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {askText.length}/2000 · {t('grant_qa.public_after_answer')}
            </span>
            <button
              type="button"
              onClick={ask}
              disabled={submitting || !askText.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {t('grant_qa.cta.ask')}
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
