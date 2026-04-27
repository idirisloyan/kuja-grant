'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication, useGrant } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import { InfoTip } from '@/components/shared/info-tip';
import { AiBadge } from '@/components/shared/ai-badge';
import {
  ArrowLeft, Send, Cpu, Loader2, FileText, Star, MessageSquare, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Criterion, Document as DocType } from '@/lib/types';

interface ScoreEntry { score: number; comment: string; }

interface EvidenceQuote {
  quote: string;
  why: string;
}

interface PerCriterionEvidence {
  criterion_key: string;
  criterion_label: string;
  supports: EvidenceQuote[];
  contradicts: EvidenceQuote[];
  neutral: EvidenceQuote[];
}

interface EvidenceResult {
  per_criterion: PerCriterionEvidence[];
  overall_observation: string;
  source: string;
}

export default function ReviewDetailClient() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  // Static-export workaround: the placeholder /reviews/0/ is the only
  // prerendered HTML, so params.id hydrates as "0" for any real id. The URL
  // is the source of truth. We use useState so the resolved id is stable
  // across re-renders and SWR doesn't thrash on a derived value.
  const [urlId, setUrlId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/reviews\/(\d+)/);
      if (m && m[1] !== '0') return Number(m[1]);
    }
    const fromParams = Number(params.id);
    return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : null;
  });

  // Re-resolve from URL whenever params change (client-side nav between
  // /reviews/A and /reviews/B). Falls back gracefully when params is "0".
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/reviews\/(\d+)/);
    if (m && m[1] !== '0') {
      const n = Number(m[1]);
      if (n !== urlId) setUrlId(n);
      return;
    }
    const fromParams = Number(params.id);
    if (Number.isFinite(fromParams) && fromParams > 0 && fromParams !== urlId) {
      setUrlId(fromParams);
    }
  }, [params.id, urlId]);

  // The /reviews/<id> URL accepts BOTH review IDs and application IDs.
  // Try as a review first (canonical interpretation since we're under
  // /reviews/) — that covers links shared from notifications, queue rows
  // that pass review.id, and direct URL entry. Fall back to treating <id>
  // as an application_id (legacy queue rows + cross-portal links).
  const [appId, setAppId] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState(false);
  useEffect(() => {
    if (urlId == null) {
      setAppId(null);
      return;
    }
    let cancelled = false;
    setResolvingId(true);
    api.get<{ review: { application_id: number } }>(`/reviews/${urlId}`)
      .then((res) => {
        if (cancelled) return;
        const applicationId = res?.review?.application_id;
        setAppId(typeof applicationId === 'number' ? applicationId : urlId);
      })
      .catch(() => {
        // 404/403 from the review lookup — assume the URL id is itself an
        // application_id and let useApplication handle access control.
        if (!cancelled) setAppId(urlId);
      })
      .finally(() => { if (!cancelled) setResolvingId(false); });
    return () => { cancelled = true; };
  }, [urlId]);

  const { data: appData, isLoading: appLoading, mutate: mutateApp } = useApplication(appId);
  const application = appData?.application ?? null;

  const grantId = application?.grant_id ?? null;
  const { data: grantData, isLoading: grantLoading } = useGrant(grantId);
  const grant = grantData?.grant ?? null;

  const criteria: Criterion[] = grant?.criteria ?? [];
  const responses = (application?.responses ?? {}) as Record<string, string>;

  const [scores, setScores] = useState<Record<string, ScoreEntry>>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiScoring, setAiScoring] = useState(false);
  // Per-criterion "Suggest rationale" loading state — separate from bulk
  // aiScoring so reviewers can refine one row at a time without seeing the
  // whole panel disabled.
  const [criterionAiLoading, setCriterionAiLoading] = useState<Record<string, boolean>>({});
  // "Extract evidence" — pulls supports/contradicts/neutral quotes from the
  // application text per criterion. Hits /api/ai/extract-evidence.
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState<EvidenceResult | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // Documents come back as part of /api/applications/<id>; no separate fetch
  // is needed (the prior `/applications/<id>/documents` call 404'd in the
  // browser console because that endpoint doesn't exist).
  const documents: DocType[] = (application?.documents ?? []) as DocType[];
  const docsLoading = appLoading;
  const [tab, setTab] = useState<'responses' | 'documents' | 'scores'>('scores');

  useEffect(() => {
    if (criteria.length > 0 && Object.keys(scores).length === 0) {
      const initial: Record<string, ScoreEntry> = {};
      for (const c of criteria) initial[c.key] = { score: 0, comment: '' };
      setScores(initial);
    }
  }, [criteria, scores]);

  const updateScore = useCallback((key: string, field: 'score' | 'comment', value: number | string) => {
    setScores((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  const handleSuggestRationale = useCallback(async (criterionKey: string) => {
    if (!appId) return;
    setCriterionAiLoading((p) => ({ ...p, [criterionKey]: true }));
    try {
      const res = await api.post<{ success: boolean; score: number; rationale: string }>(
        '/ai/score-criterion',
        { application_id: appId, criterion_key: criterionKey },
      );
      if (res.success && res.rationale) {
        setScores((prev) => ({
          ...prev,
          [criterionKey]: {
            score: typeof res.score === 'number' && res.score > 0 ? Math.round(res.score) : (prev[criterionKey]?.score ?? 0),
            comment: res.rationale,
          },
        }));
      } else {
        setError(t('review.detail.rationale_failed'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('review.detail.rationale_failed'));
    } finally {
      setCriterionAiLoading((p) => ({ ...p, [criterionKey]: false }));
    }
  }, [appId, t]);

  const handleAiScore = useCallback(async () => {
    if (!appId) return;
    setAiScoring(true);
    setError('');
    try {
      const res = await api.post<{
        success: boolean;
        scores: { criterion_scores?: Record<string, { score: number; feedback: string }> };
      }>(`/ai/score-application`, { application_id: appId });
      if (res.success && res.scores?.criterion_scores) {
        const ai = res.scores.criterion_scores;
        setScores((prev) => {
          const updated = { ...prev };
          for (const [key, val] of Object.entries(ai)) {
            updated[key] = { score: Math.round(val.score), comment: val.feedback || updated[key]?.comment || '' };
          }
          return updated;
        });
      }
      await mutateApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI scoring failed');
    } finally {
      setAiScoring(false);
    }
  }, [appId, mutateApp]);

  const handleExtractEvidence = useCallback(async () => {
    if (!appId) return;
    setLoadingEvidence(true);
    setEvidenceError(null);
    try {
      const res = await api.post<EvidenceResult>('/ai/extract-evidence', {
        application_id: appId,
      });
      setEvidenceResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('review.detail.evidence_failed');
      setEvidenceError(msg);
      toast.error(t('review.detail.evidence_failed'));
    } finally {
      setLoadingEvidence(false);
    }
  }, [appId, t]);

  const handleSubmit = useCallback(async () => {
    if (!appId) return;
    setSubmitting(true);
    setError('');
    try {
      const scoreMap: Record<string, number> = {};
      const commentMap: Record<string, string> = {};
      for (const [key, val] of Object.entries(scores)) {
        scoreMap[key] = val.score;
        commentMap[key] = val.comment;
      }
      await api.post('/reviews/', { application_id: appId, scores: scoreMap, comments: commentMap });
      setSuccess(true);
      await mutateApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit scores');
    } finally {
      setSubmitting(false);
    }
  }, [appId, scores, mutateApp]);

  // Show skeleton while we resolve id from URL, while we figure out
  // whether the URL id was a review or application id, OR while SWR is
  // fetching. Without the guards, the static-export placeholder or the
  // pre-resolution gap briefly fires the not-found UI.
  if (urlId == null || resolvingId || appId == null || appLoading || grantLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-3">
        <div className="kuja-shimmer h-8 w-64 rounded" />
        <div className="kuja-shimmer h-32 rounded-xl" />
        <div className="kuja-shimmer h-10 w-48 rounded" />
        <div className="kuja-shimmer h-96 rounded-xl" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="max-w-5xl mx-auto space-y-3">
        <button
          type="button"
          onClick={() => router.push('/reviews')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </button>
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">{t('application.not_found')}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="rounded-xl border border-border bg-background px-6 py-16 text-center">
          <CheckCircle className="h-16 w-16 mx-auto text-[hsl(var(--kuja-grow))] mb-3" />
          <p className="kuja-display text-2xl">{t('review.detail.scores_submitted')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('review.detail.scores_recorded')}</p>
          <button
            type="button"
            onClick={() => router.push('/reviews')}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2"
          >
            {t('review.detail.back')}
          </button>
        </div>
      </div>
    );
  }

  const overallScore = criteria.length > 0
    ? Math.round(criteria.reduce((sum, c) => sum + ((scores[c.key]?.score ?? 0) * c.weight / 100), 0))
    : 0;

  const toneBy = (s: number) =>
    s >= 70 ? 'text-[hsl(var(--kuja-grow))]' : s >= 50 ? 'text-[hsl(var(--kuja-sun))]' : 'text-[hsl(var(--kuja-flag))]';

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/reviews')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </button>
        <div>
          <h1 className="kuja-display text-2xl">{t('review.detail.score_app')}</h1>
          <p className="text-sm text-muted-foreground">Application #{appId}</p>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-border bg-background p-5 border-l-4 border-l-[hsl(var(--kuja-spark))]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-foreground">
              {application.ngo_org_name || application.org_name || `Org #${application.ngo_org_id}`}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {grant?.title || `Grant #${application.grant_id}`}
            </div>
          </div>
          <StatusBadge status={application.status} kind="app" />
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {application.ai_score != null && (
            <ScoreBox
              tone="spark"
              icon={<Cpu className="h-3 w-3" />}
              label="AI Score"
              value={`${application.ai_score}%`}
              valueCls={toneBy(application.ai_score)}
              footnote="Completeness 25% · Relevance 35% · Depth 40%"
            />
          )}
          <ScoreBox
            tone={overallScore > 0 ? 'success' : 'default'}
            icon={<Star className="h-3 w-3" />}
            label="Reviewer Score"
            value={overallScore > 0 ? `${overallScore}%` : '—'}
            valueCls={overallScore > 0 ? toneBy(overallScore) : 'text-muted-foreground'}
            footnote={overallScore > 0 ? 'Weighted criterion scores' : 'Not yet scored'}
          />
          {application.ai_score != null && overallScore > 0 && (
            <ScoreBox
              tone="info"
              label="Dual Score"
              value={`${Math.round((application.ai_score + overallScore) / 2)}%`}
              valueCls="text-[hsl(217_91%_45%)]"
              footnote="Average of AI + Reviewer"
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: 'responses', labelKey: 'review.detail.tab.responses', icon: MessageSquare },
          { id: 'documents', labelKey: 'review.detail.tab.documents', icon: FileText },
          { id: 'scores', labelKey: 'review.detail.tab.scores', icon: Star },
        ] as const).map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === tabItem.id
                  ? 'text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]'
                  : 'text-muted-foreground border-transparent hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(tabItem.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Responses */}
      {tab === 'responses' && (
        <div className="space-y-3">
          {criteria.length === 0 && Object.keys(responses).length === 0 ? (
            <EmptyBox label={t('review.detail.no_responses')} />
          ) : (
            <>
              {criteria.map((c) => (
                <div key={c.key} className="rounded-xl border border-border bg-background p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{c.label}</span>
                    <span className="kuja-severity kuja-severity-info">{c.weight}%</span>
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground mb-2">{c.description}</p>}
                  <div className="bg-muted/30 rounded-md p-3 text-sm whitespace-pre-wrap">
                    {responses[c.key] || (
                      <span className="italic text-muted-foreground">{t('review.detail.no_response')}</span>
                    )}
                  </div>
                </div>
              ))}
              {Object.entries(responses).filter(([key]) => !criteria.some((c) => c.key === key)).map(([key, val]) => (
                <div key={key} className="rounded-xl border border-border bg-background p-5">
                  <div className="text-sm font-semibold mb-2">{key}</div>
                  <div className="bg-muted/30 rounded-md p-3 text-sm whitespace-pre-wrap">
                    {val || <span className="italic text-muted-foreground">No response</span>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <div className="space-y-2">
          {docsLoading ? (
            [1,2,3].map((i) => <div key={i} className="kuja-shimmer h-16 rounded-xl" />)
          ) : documents.length === 0 ? (
            <EmptyBox label={t('review.detail.no_documents')} />
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-border bg-background px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">{doc.original_filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {doc.doc_type} · {(doc.file_size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
                {doc.score != null && (
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-[hsl(var(--kuja-spark))]" />
                    <span className={cn('font-semibold text-sm', toneBy(doc.score))}>{doc.score}%</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Scores */}
      {tab === 'scores' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5 flex-wrap">
              <span>{t('review.detail.score_intro')}</span>
              <InfoTip>{t('glossary.rubric')}</InfoTip>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExtractEvidence}
                disabled={loadingEvidence}
                className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-spark))] text-sm font-medium px-3 py-1.5 hover:bg-[hsl(var(--kuja-spark))]/15 disabled:opacity-50"
              >
                {loadingEvidence ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MessageSquare className="h-3.5 w-3.5" />
                )}
                {loadingEvidence ? t('review.detail.extracting_evidence') : t('review.detail.extract_evidence')}
              </button>
              <button
                type="button"
                onClick={handleAiScore}
                disabled={aiScoring}
                className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-spark))] text-sm font-medium px-3 py-1.5 hover:bg-[hsl(var(--kuja-spark))]/15 disabled:opacity-50"
              >
                {aiScoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                {aiScoring ? 'Scoring…' : t('review.detail.ai_auto_score')}
              </button>
            </div>
          </div>

          {evidenceError && (
            <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] text-[hsl(var(--kuja-flag))] px-4 py-2 text-sm">
              {evidenceError}
            </div>
          )}

          {evidenceResult?.overall_observation && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                <span>Overall observation</span>
                <AiBadge className="ml-auto" />
              </div>
              <p className="text-sm text-foreground whitespace-pre-line">{evidenceResult.overall_observation}</p>
            </div>
          )}

          {criteria.length === 0 ? (
            <EmptyBox label={t('review.detail.no_criteria')} />
          ) : (
            criteria.map((c) => {
              const entry = scores[c.key] ?? { score: 0, comment: '' };
              const evidence = evidenceResult?.per_criterion.find(
                (pc) => pc.criterion_key === c.key || pc.criterion_label === c.label,
              );
              return (
                <div key={c.key} className="rounded-xl border border-border bg-background p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{c.label}</div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('review.detail.weight')}</span>
                      <div className="w-16 h-1.5 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-[hsl(var(--kuja-clay))]" style={{ width: `${c.weight}%` }} />
                      </div>
                      <span className="kuja-numeric text-xs font-semibold tabular-nums">{c.weight}%</span>
                    </div>
                  </div>

                  {application.ai_score != null && (
                    <div className="inline-flex items-center gap-1.5 rounded bg-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-spark))] px-2 py-0.5 text-xs">
                      <Cpu className="h-3 w-3" /> {t('review.detail.ai_reference')}
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="kuja-label text-[10px] mb-1">{t('review.detail.score_label')}</div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0} max={100}
                          value={entry.score}
                          onChange={(e) => updateScore(c.key, 'score', Number(e.target.value))}
                          className="flex-1 accent-[hsl(var(--kuja-clay))]"
                        />
                        <input
                          type="number"
                          min={0} max={100}
                          value={entry.score}
                          onChange={(e) => updateScore(c.key, 'score', Math.min(100, Math.max(0, Number(e.target.value))))}
                          className="w-16 h-8 px-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
                        />
                      </div>
                    </div>
                    <ScoreRing score={entry.score} size={56} strokeWidth={4} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="kuja-label text-[10px]">{t('review.detail.comment')}</div>
                      <button
                        type="button"
                        onClick={() => handleSuggestRationale(c.key)}
                        disabled={!!criterionAiLoading[c.key]}
                        className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--kuja-spark))] hover:opacity-90 disabled:opacity-50"
                      >
                        {criterionAiLoading[c.key] ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Cpu className="h-3 w-3" />
                        )}
                        {criterionAiLoading[c.key] ? t('review.detail.suggesting') : t('review.detail.suggest_rationale')}
                      </button>
                    </div>
                    <textarea
                      value={entry.comment}
                      onChange={(e) => updateScore(c.key, 'comment', e.target.value)}
                      placeholder="Provide feedback on this criterion…"
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
                    />
                  </div>

                  {evidence && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        Evidence
                      </div>
                      {evidence.supports.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700">
                            {t('review.detail.evidence_supports')}
                          </div>
                          {evidence.supports.map((q, i) => (
                            <div key={i} className="border-l-4 border-emerald-500 bg-emerald-50/50 pl-3 py-1.5">
                              <p className="italic text-sm text-foreground">&ldquo;{q.quote}&rdquo;</p>
                              {q.why && (
                                <p className="text-xs text-muted-foreground mt-1">{q.why}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {evidence.contradicts.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-red-700">
                            {t('review.detail.evidence_contradicts')}
                          </div>
                          {evidence.contradicts.map((q, i) => (
                            <div key={i} className="border-l-4 border-red-500 bg-red-50/50 pl-3 py-1.5">
                              <p className="italic text-sm text-foreground">&ldquo;{q.quote}&rdquo;</p>
                              {q.why && (
                                <p className="text-xs text-muted-foreground mt-1">{q.why}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {evidence.neutral.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                            {t('review.detail.evidence_neutral')}
                          </div>
                          {evidence.neutral.map((q, i) => (
                            <div key={i} className="border-l-4 border-muted-foreground/40 bg-muted/30 pl-3 py-1.5">
                              <p className="italic text-sm text-foreground">&ldquo;{q.quote}&rdquo;</p>
                              {q.why && (
                                <p className="text-xs text-muted-foreground mt-1">{q.why}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {error && (
            <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] text-[hsl(var(--kuja-flag))] px-4 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            <div className="flex items-center gap-3">
              <ScoreRing score={overallScore} size={64} strokeWidth={5} label={t('review.detail.total_label')} />
              <div>
                <div className="text-sm font-semibold">{t('review.detail.weighted_total', { n: overallScore })}</div>
                <div className="text-xs text-muted-foreground">{t('review.detail.based_on_criteria', { n: criteria.length })}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || criteria.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? t('review.submitting') : t('review.detail.submit_btn')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBox({
  icon, label, value, valueCls, footnote, tone = 'default',
}: {
  icon?: React.ReactNode; label: string; value: string; valueCls?: string; footnote?: string;
  tone?: 'spark' | 'success' | 'info' | 'default';
}) {
  const bgCls =
    tone === 'spark' ? 'bg-[hsl(var(--kuja-spark-soft))] border-[hsl(var(--kuja-spark))]/20'
    : tone === 'success' ? 'bg-[hsl(142_68%_96%)] border-[hsl(142_55%_85%)]'
    : tone === 'info' ? 'bg-blue-50 border-blue-200'
    : 'bg-muted/30 border-border';
  const labelCls =
    tone === 'spark' ? 'text-[hsl(var(--kuja-spark))]'
    : tone === 'success' ? 'text-[hsl(var(--kuja-grow))]'
    : tone === 'info' ? 'text-blue-700'
    : 'text-muted-foreground';
  return (
    <div className={cn('flex-1 min-w-[160px] rounded-lg border px-3 py-2.5 text-center', bgCls)}>
      <div className={cn('flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider font-bold mb-1', labelCls)}>
        {icon} {label}
      </div>
      <div className={cn('kuja-numeric text-2xl font-semibold', valueCls)}>{value}</div>
      {footnote && <div className="text-[10px] text-muted-foreground mt-0.5">{footnote}</div>}
    </div>
  );
}

function EmptyBox({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
