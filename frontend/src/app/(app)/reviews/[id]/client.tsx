'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication, useGrant } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import {
  ArrowLeft, Send, Cpu, Loader2, FileText, Star, MessageSquare, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Criterion, Document as DocType } from '@/lib/types';

interface ScoreEntry { score: number; comment: string; }

export default function ReviewDetailClient() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const { data: appData, isLoading: appLoading, mutate: mutateApp } = useApplication(id || null);
  const application = appData?.application ?? null;

  const grantId = application?.grant_id ?? null;
  const { data: grantData, isLoading: grantLoading } = useGrant(grantId);
  const grant = grantData?.grant ?? null;

  const criteria: Criterion[] = grant?.criteria ?? [];
  const responses = (application?.responses ?? {}) as Record<string, string>;

  const [scores, setScores] = useState<Record<string, ScoreEntry>>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiScoring, setAiScoring] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [tab, setTab] = useState<'responses' | 'documents' | 'scores'>('scores');

  useEffect(() => {
    if (criteria.length > 0 && Object.keys(scores).length === 0) {
      const initial: Record<string, ScoreEntry> = {};
      for (const c of criteria) initial[c.key] = { score: 0, comment: '' };
      setScores(initial);
    }
  }, [criteria, scores]);

  useEffect(() => {
    if (!id) return;
    setDocsLoading(true);
    api.get<{ documents: DocType[] }>(`/applications/${id}/documents`)
      .then((res) => setDocuments(res.documents ?? []))
      .catch(() => setDocuments([]))
      .finally(() => setDocsLoading(false));
  }, [id]);

  const updateScore = useCallback((key: string, field: 'score' | 'comment', value: number | string) => {
    setScores((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  const handleAiScore = useCallback(async () => {
    if (!id) return;
    setAiScoring(true);
    setError('');
    try {
      const res = await api.post<{
        success: boolean;
        scores: { criterion_scores?: Record<string, { score: number; feedback: string }> };
      }>(`/ai/score-application`, { application_id: id });
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
  }, [id, mutateApp]);

  const handleSubmit = useCallback(async () => {
    if (!id) return;
    setSubmitting(true);
    setError('');
    try {
      const scoreMap: Record<string, number> = {};
      const commentMap: Record<string, string> = {};
      for (const [key, val] of Object.entries(scores)) {
        scoreMap[key] = val.score;
        commentMap[key] = val.comment;
      }
      await api.post('/reviews/', { application_id: id, scores: scoreMap, comments: commentMap });
      setSuccess(true);
      await mutateApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit scores');
    } finally {
      setSubmitting(false);
    }
  }, [id, scores, mutateApp]);

  if (appLoading || grantLoading) {
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
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">Application not found</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="rounded-xl border border-border bg-background px-6 py-16 text-center">
          <CheckCircle className="h-16 w-16 mx-auto text-[hsl(var(--kuja-grow))] mb-3" />
          <p className="kuja-display text-2xl">Scores submitted</p>
          <p className="text-sm text-muted-foreground mt-1">Your review has been recorded successfully.</p>
          <button
            type="button"
            onClick={() => router.push('/reviews')}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2"
          >
            Back to reviews
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
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div>
          <h1 className="kuja-display text-2xl">Score application</h1>
          <p className="text-sm text-muted-foreground">Application #{id}</p>
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
          <StatusBadge status={application.status} />
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
          { id: 'responses', label: 'Responses', icon: MessageSquare },
          { id: 'documents', label: 'Documents', icon: FileText },
          { id: 'scores', label: 'Scores', icon: Star },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === t.id
                  ? 'text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]'
                  : 'text-muted-foreground border-transparent hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Responses */}
      {tab === 'responses' && (
        <div className="space-y-3">
          {criteria.length === 0 && Object.keys(responses).length === 0 ? (
            <EmptyBox label="No responses available for this application." />
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
                      <span className="italic text-muted-foreground">No response provided</span>
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
            <EmptyBox label="No documents uploaded for this application." />
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
            <p className="text-sm text-muted-foreground">
              Score each criterion below (0-100). The weighted total updates automatically.
            </p>
            <button
              type="button"
              onClick={handleAiScore}
              disabled={aiScoring}
              className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-spark))] text-sm font-medium px-3 py-1.5 hover:bg-[hsl(var(--kuja-spark))]/15 disabled:opacity-50"
            >
              {aiScoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
              {aiScoring ? 'Scoring…' : 'AI auto-score'}
            </button>
          </div>

          {criteria.length === 0 ? (
            <EmptyBox label="No evaluation criteria defined for this grant." />
          ) : (
            criteria.map((c) => {
              const entry = scores[c.key] ?? { score: 0, comment: '' };
              return (
                <div key={c.key} className="rounded-xl border border-border bg-background p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{c.label}</div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      )}
                    </div>
                    <span className="kuja-severity kuja-severity-info">Weight: {c.weight}%</span>
                  </div>

                  {application.ai_score != null && (
                    <div className="inline-flex items-center gap-1.5 rounded bg-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-spark))] px-2 py-0.5 text-xs">
                      <Cpu className="h-3 w-3" /> AI reference available
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="kuja-label text-[10px] mb-1">Score (0-100)</div>
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
                    <div className="kuja-label text-[10px] mb-1">Comment</div>
                    <textarea
                      value={entry.comment}
                      onChange={(e) => updateScore(c.key, 'comment', e.target.value)}
                      placeholder="Provide feedback on this criterion…"
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
                    />
                  </div>
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
              <ScoreRing score={overallScore} size={64} strokeWidth={5} label="Total" />
              <div>
                <div className="text-sm font-semibold">Weighted total: {overallScore}%</div>
                <div className="text-xs text-muted-foreground">Based on {criteria.length} criteria</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || criteria.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Submitting…' : 'Submit scores'}
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
