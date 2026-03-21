'use client';
import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication, useGrant } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Send, Cpu, Loader2, FileText, Star, MessageSquare,
  CheckCircle,
} from 'lucide-react';
import type { Criterion, Document as DocType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreEntry {
  score: number;
  comment: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ReviewDetailClient() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const { data: appData, isLoading: appLoading, mutate: mutateApp } = useApplication(id || null);
  const application = appData?.application ?? null;

  const grantId = application?.grant_id ?? null;
  const { data: grantData, isLoading: grantLoading } = useGrant(grantId);
  const grant = grantData?.grant ?? null;

  const criteria = grant?.criteria ?? [];
  const responses = application?.responses ?? {};

  // Scoring state
  const [scores, setScores] = useState<Record<string, ScoreEntry>>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiScoring, setAiScoring] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Documents state
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Initialize scores from criteria
  useEffect(() => {
    if (criteria.length > 0 && Object.keys(scores).length === 0) {
      const initial: Record<string, ScoreEntry> = {};
      for (const c of criteria) {
        initial[c.key] = { score: 0, comment: '' };
      }
      setScores(initial);
    }
  }, [criteria, scores]);

  // Fetch documents
  useEffect(() => {
    if (!id) return;
    setDocsLoading(true);
    api.get<{ documents: DocType[] }>(`/applications/${id}/documents`)
      .then((res) => setDocuments(res.documents ?? []))
      .catch(() => setDocuments([]))
      .finally(() => setDocsLoading(false));
  }, [id]);

  const updateScore = useCallback((key: string, field: 'score' | 'comment', value: number | string) => {
    setScores((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }, []);

  // AI Auto-Score
  const handleAiScore = useCallback(async () => {
    if (!id) return;
    setAiScoring(true);
    setError('');
    try {
      const res = await api.post<{
        success: boolean;
        scores: {
          criterion_scores?: Record<string, { score: number; feedback: string }>;
        };
      }>(`/ai/score-application`, { application_id: id });

      if (res.success && res.scores?.criterion_scores) {
        const aiScores = res.scores.criterion_scores;
        setScores((prev) => {
          const updated = { ...prev };
          for (const [key, val] of Object.entries(aiScores)) {
            updated[key] = {
              score: Math.round(val.score),
              comment: val.feedback || updated[key]?.comment || '',
            };
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

  // Submit scores
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

      await api.post(`/reviews/`, {
        application_id: id,
        scores: scoreMap,
        comments: commentMap,
      });

      setSuccess(true);
      await mutateApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit scores');
    } finally {
      setSubmitting(false);
    }
  }, [id, scores, mutateApp]);

  const isLoading = appLoading || grantLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/reviews')} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Application not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Scores Submitted</h2>
            <p className="text-sm text-slate-500 mb-6">Your review has been recorded successfully.</p>
            <Button onClick={() => router.push('/reviews')} className="bg-brand-600 hover:bg-brand-700">
              Back to Reviews
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate overall score
  const overallScore = criteria.length > 0
    ? Math.round(
        criteria.reduce((sum, c) => {
          const s = scores[c.key]?.score ?? 0;
          return sum + (s * c.weight / 100);
        }, 0),
      )
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/reviews')} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Score Application</h1>
          <p className="text-sm text-slate-500 mt-0.5">Application #{id}</p>
        </div>
      </div>

      {/* Application Summary */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {application.ngo_org_name || application.org_name || `Org #${application.ngo_org_id}`}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {grant?.title || `Grant #${application.grant_id}`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <StatusBadge status={application.status} />
              <ScoreRing score={overallScore} size={64} strokeWidth={5} label="Total" />
            </div>
          </div>
          {application.ai_score != null && (
            <div className="mt-2 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-xs text-slate-500">AI Pre-Score: {application.ai_score}%</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="scores">
        <TabsList>
          <TabsTrigger value="responses">
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> Responses
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="w-3.5 h-3.5 mr-1" /> Documents
          </TabsTrigger>
          <TabsTrigger value="scores">
            <Star className="w-3.5 h-3.5 mr-1" /> Scores
          </TabsTrigger>
        </TabsList>

        {/* Responses Tab */}
        <TabsContent value="responses">
          {criteria.length === 0 && Object.keys(responses).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-400">
                No responses available for this application.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {criteria.map((c) => (
                <Card key={c.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      {c.label}
                      <Badge variant="outline" className="text-xs font-normal">
                        {c.weight}%
                      </Badge>
                    </CardTitle>
                    {c.description && (
                      <p className="text-xs text-slate-500">{c.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="bg-slate-50 rounded-md p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {responses[c.key] || <span className="text-slate-400 italic">No response provided</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Additional responses not mapped to criteria */}
              {Object.entries(responses)
                .filter(([key]) => !criteria.some((c) => c.key === key))
                .map(([key, value]) => (
                  <Card key={key}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">{key}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-slate-50 rounded-md p-3 text-sm text-slate-700 whitespace-pre-wrap">
                        {value || <span className="text-slate-400 italic">No response</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          {docsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : documents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-400">
                No documents uploaded for this application.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{doc.original_filename}</p>
                          <p className="text-xs text-slate-500">
                            {doc.doc_type} | {(doc.file_size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      {doc.score != null && (
                        <div className="flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-violet-500" />
                          <span className={`text-sm font-semibold ${
                            doc.score >= 80 ? 'text-emerald-600' :
                            doc.score >= 60 ? 'text-amber-600' : 'text-rose-600'
                          }`}>
                            {doc.score}%
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Scores Tab */}
        <TabsContent value="scores">
          <div className="space-y-4">
            {/* AI Auto-Score Button */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Score each criterion below (0-100). The weighted total updates automatically.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={aiScoring}
                onClick={handleAiScore}
              >
                {aiScoring ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cpu className="w-3.5 h-3.5" />
                )}
                {aiScoring ? 'Scoring...' : 'AI Auto-Score'}
              </Button>
            </div>

            {/* Criterion Scoring Cards */}
            {criteria.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-slate-400">
                  No evaluation criteria defined for this grant.
                </CardContent>
              </Card>
            ) : (
              criteria.map((c) => {
                const entry = scores[c.key] ?? { score: 0, comment: '' };
                return (
                  <Card key={c.key}>
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">{c.label}</h4>
                          {c.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">Weight: {c.weight}%</Badge>
                      </div>

                      {/* Reference: AI score if available */}
                      {application.ai_score != null && (
                        <div className="flex items-center gap-2 text-xs text-violet-600 bg-violet-50 px-2 py-1 rounded">
                          <Cpu className="w-3 h-3" />
                          AI reference available
                        </div>
                      )}

                      {/* Score Input */}
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">Score (0-100)</Label>
                          <div className="flex items-center gap-3 mt-1">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={entry.score}
                              onChange={(e) => updateScore(c.key, 'score', Number(e.target.value))}
                              className="flex-1 h-2 accent-brand-600"
                            />
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={entry.score}
                              onChange={(e) => updateScore(c.key, 'score', Math.min(100, Math.max(0, Number(e.target.value))))}
                              className="w-20 text-center"
                            />
                          </div>
                        </div>
                        <ScoreRing score={entry.score} size={56} strokeWidth={4} />
                      </div>

                      {/* Comment */}
                      <div>
                        <Label className="text-xs text-slate-500">Comment</Label>
                        <Textarea
                          placeholder="Provide feedback on this criterion..."
                          value={entry.comment}
                          onChange={(e) => updateScore(c.key, 'comment', e.target.value)}
                          className="mt-1 min-h-[60px]"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}

            {/* Error */}
            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-4">
                <ScoreRing score={overallScore} size={64} strokeWidth={5} label="Total" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">Weighted Total: {overallScore}%</p>
                  <p className="text-slate-500 text-xs">Based on {criteria.length} criteria</p>
                </div>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={submitting || criteria.length === 0}
                className="gap-1 bg-brand-600 hover:bg-brand-700"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? 'Submitting...' : 'Submit Scores'}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
