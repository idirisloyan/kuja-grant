'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApplication, useGrant } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Slider from '@mui/material/Slider';
import Alert from '@mui/material/Alert';

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

  // Tab state
  const [tab, setTab] = useState(2); // default to "Scores" tab (index 2)

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
      <Stack spacing={3} sx={{ maxWidth: 960, mx: 'auto' }}>
        <Skeleton variant="text" width={260} height={36} />
        <Skeleton variant="rounded" height={128} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rounded" height={40} width={200} />
        <Skeleton variant="rounded" height={384} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  if (!application) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 960, mx: 'auto' }}>
        <Button
          size="small"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/reviews')}
          sx={{ color: 'text.secondary', alignSelf: 'flex-start' }}
        >
          Back
        </Button>
        <Card>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <FileText size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
            <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
              Application not found
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    );
  }

  if (success) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 960, mx: 'auto' }}>
        <Card>
          <CardContent sx={{ py: 8, textAlign: 'center' }}>
            <CheckCircle size={64} style={{ color: '#10B981', margin: '0 auto 16px' }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
              Scores Submitted
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              Your review has been recorded successfully.
            </Typography>
            <Button
              variant="contained"
              onClick={() => router.push('/reviews')}
            >
              Back to Reviews
            </Button>
          </CardContent>
        </Card>
      </Stack>
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
    <Stack spacing={3} sx={{ maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          size="small"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/reviews')}
          sx={{ color: 'text.secondary' }}
        >
          Back
        </Button>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Score Application
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            Application #{id}
          </Typography>
        </Box>
      </Box>

      {/* Application Summary */}
      <Card>
        <CardContent sx={{ py: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {application.ngo_org_name || application.org_name || `Org #${application.ngo_org_id}`}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
                {grant?.title || `Grant #${application.grant_id}`}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <StatusBadge status={application.status} />
              <ScoreRing score={overallScore} size={64} strokeWidth={5} label="Total" />
            </Box>
          </Box>
          {application.ai_score != null && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Cpu size={14} style={{ color: '#7C3AED' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                AI Pre-Score: {application.ai_score}%
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Box>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}
        >
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <MessageSquare size={14} /> Responses
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <FileText size={14} /> Documents
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Star size={14} /> Scores
              </Box>
            }
          />
        </Tabs>

        {/* Responses Tab */}
        {tab === 0 && (
          <>
            {criteria.length === 0 && Object.keys(responses).length === 0 ? (
              <Card>
                <CardContent sx={{ py: 6, textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                    No responses available for this application.
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              <Stack spacing={2}>
                {criteria.map((c) => (
                  <Card key={c.key}>
                    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {c.label}
                        </Typography>
                        <Chip
                          label={`${c.weight}%`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.6875rem' }}
                        />
                      </Box>
                      {c.description && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                          {c.description}
                        </Typography>
                      )}
                      <Box
                        sx={{
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                          p: 1.5,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        <Typography variant="body2" sx={{ color: 'text.primary' }}>
                          {responses[c.key] || (
                            <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                              No response provided
                            </Box>
                          )}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                ))}

                {/* Additional responses not mapped to criteria */}
                {Object.entries(responses)
                  .filter(([key]) => !criteria.some((c) => c.key === key))
                  .map(([key, value]) => (
                    <Card key={key}>
                      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}>
                          {key}
                        </Typography>
                        <Box
                          sx={{
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            p: 1.5,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          <Typography variant="body2" sx={{ color: 'text.primary' }}>
                            {value || (
                              <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                                No response
                              </Box>
                            )}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
              </Stack>
            )}
          </>
        )}

        {/* Documents Tab */}
        {tab === 1 && (
          <>
            {docsLoading ? (
              <Stack spacing={1.5}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 2 }} />
                ))}
              </Stack>
            ) : documents.length === 0 ? (
              <Card>
                <CardContent sx={{ py: 6, textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                    No documents uploaded for this application.
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              <Stack spacing={1.5}>
                {documents.map((doc) => (
                  <Card key={doc.id}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <FileText size={20} style={{ color: '#94A3B8' }} />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                              {doc.original_filename}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {doc.doc_type} | {(doc.file_size / 1024).toFixed(1)} KB
                            </Typography>
                          </Box>
                        </Box>
                        {doc.score != null && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Cpu size={14} style={{ color: '#7C3AED' }} />
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                color:
                                  doc.score >= 80 ? 'success.main' :
                                  doc.score >= 60 ? 'warning.main' : 'error.main',
                              }}
                            >
                              {doc.score}%
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </>
        )}

        {/* Scores Tab */}
        {tab === 2 && (
          <Stack spacing={2}>
            {/* AI Auto-Score Button */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Score each criterion below (0-100). The weighted total updates automatically.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                disabled={aiScoring}
                startIcon={
                  aiScoring
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Cpu size={14} />
                }
                onClick={handleAiScore}
              >
                {aiScoring ? 'Scoring...' : 'AI Auto-Score'}
              </Button>
            </Box>

            {/* Criterion Scoring Cards */}
            {criteria.length === 0 ? (
              <Card>
                <CardContent sx={{ py: 6, textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                    No evaluation criteria defined for this grant.
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              criteria.map((c) => {
                const entry = scores[c.key] ?? { score: 0, comment: '' };
                return (
                  <Card key={c.key}>
                    <CardContent sx={{ py: 2.5, '&:last-child': { pb: 2.5 } }}>
                      <Stack spacing={2}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                              {c.label}
                            </Typography>
                            {c.description && (
                              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}>
                                {c.description}
                              </Typography>
                            )}
                          </Box>
                          <Chip
                            label={`Weight: ${c.weight}%`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.6875rem' }}
                          />
                        </Box>

                        {/* Reference: AI score if available */}
                        {application.ai_score != null && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              bgcolor: '#F5F3FF',
                              color: '#7C3AED',
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 1,
                            }}
                          >
                            <Cpu size={12} />
                            <Typography variant="caption">AI reference available</Typography>
                          </Box>
                        )}

                        {/* Score Input */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                              Score (0-100)
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Slider
                                value={entry.score}
                                onChange={(_, val) => updateScore(c.key, 'score', val as number)}
                                min={0}
                                max={100}
                                sx={{ flex: 1 }}
                              />
                              <TextField
                                type="number"
                                inputProps={{ min: 0, max: 100 }}
                                value={entry.score}
                                onChange={(e) => updateScore(c.key, 'score', Math.min(100, Math.max(0, Number(e.target.value))))}
                                size="small"
                                sx={{ width: 80 }}
                              />
                            </Box>
                          </Box>
                          <ScoreRing score={entry.score} size={56} strokeWidth={4} />
                        </Box>

                        {/* Comment */}
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                            Comment
                          </Typography>
                          <TextField
                            placeholder="Provide feedback on this criterion..."
                            value={entry.comment}
                            onChange={(e) => updateScore(c.key, 'comment', e.target.value)}
                            fullWidth
                            multiline
                            minRows={2}
                            size="small"
                          />
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })
            )}

            {/* Error */}
            {error && (
              <Alert severity="error">{error}</Alert>
            )}

            {/* Submit */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ScoreRing score={overallScore} size={64} strokeWidth={5} label="Total" />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    Weighted Total: {overallScore}%
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Based on {criteria.length} criteria
                  </Typography>
                </Box>
              </Box>
              <Button
                variant="contained"
                disabled={submitting || criteria.length === 0}
                startIcon={
                  submitting
                    ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Send size={16} />
                }
                onClick={handleSubmit}
              >
                {submitting ? 'Submitting...' : 'Submit Scores'}
              </Button>
            </Box>
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
