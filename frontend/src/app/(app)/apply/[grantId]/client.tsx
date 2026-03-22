'use client';
import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGrant } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';

import {
  ArrowLeft, ArrowRight, ClipboardList, FileText,
  Upload, Send, Sparkles, AlertCircle, CheckCircle,
} from 'lucide-react';
import type { EligibilityRequirement, Criterion, DocRequirement } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EligibilityResponse {
  checked: boolean;
  evidence: string;
}

interface ProposalResponse {
  text: string;
  wordCount: number;
  guidance?: string;
  qualityScore?: number;
}

interface DocUpload {
  file: File | null;
  fileName: string;
}

const STEPS = ['Eligibility', 'Proposal', 'Documents', 'Review & Submit'];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ApplyWizardClient() {
  const params = useParams();
  const grantId = Number(params.grantId);
  const router = useRouter();
  const { data, isLoading } = useGrant(grantId || null);
  const grant = data?.grant;

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Step 1: Eligibility responses
  const [eligibilityResponses, setEligibilityResponses] = useState<Record<string, EligibilityResponse>>({});

  // Step 2: Proposal responses
  const [proposalResponses, setProposalResponses] = useState<Record<string, ProposalResponse>>({});

  // Step 3: Document uploads
  const [docUploads, setDocUploads] = useState<Record<string, DocUpload>>({});

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleEligibilityChange = useCallback((key: string, field: 'checked' | 'evidence', value: boolean | string) => {
    setEligibilityResponses((prev) => ({
      ...prev,
      [key]: {
        ...prev[key] || { checked: false, evidence: '' },
        [field]: value,
      },
    }));
  }, []);

  const handleProposalChange = useCallback((key: string, text: string) => {
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    setProposalResponses((prev) => ({
      ...prev,
      [key]: {
        ...prev[key] || { text: '', wordCount: 0 },
        text,
        wordCount,
      },
    }));
  }, []);

  const handleDocChange = useCallback((key: string, file: File | null) => {
    setDocUploads((prev) => ({
      ...prev,
      [key]: { file, fileName: file?.name ?? '' },
    }));
  }, []);

  const [guidanceLoading, setGuidanceLoading] = useState<Record<string, boolean>>({});

  const handleGetGuidance = useCallback(async (criterionKey: string, text: string) => {
    setGuidanceLoading((prev) => ({ ...prev, [criterionKey]: true }));
    try {
      const res = await api.post<{ guidance: string; quality_score: number }>('/ai/guidance', {
        grant_id: grantId,
        criterion_key: criterionKey,
        response_text: text,
      });
      setProposalResponses((prev) => ({
        ...prev,
        [criterionKey]: {
          ...prev[criterionKey] || { text: '', wordCount: 0 },
          guidance: res.guidance,
          qualityScore: res.quality_score,
        },
      }));
    } catch {
      // Guidance is optional - fail silently
    } finally {
      setGuidanceLoading((prev) => ({ ...prev, [criterionKey]: false }));
    }
  }, [grantId]);

  const handleSubmit = useCallback(async () => {
    if (!grant) return;
    setSubmitting(true);
    try {
      // Build responses
      const responses: Record<string, string> = {};
      Object.entries(proposalResponses).forEach(([key, val]) => {
        responses[key] = val.text;
      });

      const eligibility: Record<string, unknown> = {};
      Object.entries(eligibilityResponses).forEach(([key, val]) => {
        eligibility[key] = { met: val.checked, evidence: val.evidence };
      });

      // Create application
      const appRes = await api.post<{ application_id: number; success: boolean }>(
        `/grants/${grantId}/apply`,
        { responses, eligibility_responses: eligibility },
      );

      // Upload documents if any
      if (appRes.application_id) {
        for (const [docType, upload] of Object.entries(docUploads)) {
          if (upload.file) {
            const formData = new FormData();
            formData.append('file', upload.file);
            formData.append('doc_type', docType);
            await api.upload(`/applications/${appRes.application_id}/documents`, formData);
          }
        }

        // Submit the application
        await api.post(`/applications/${appRes.application_id}/submit`);
      }

      setSubmitted(true);
    } catch {
      // Error handling via toast would go here
    } finally {
      setSubmitting(false);
    }
  }, [grant, grantId, proposalResponses, eligibilityResponses, docUploads]);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <Stack spacing={3}>
        <Skeleton variant="text" width={200} height={32} />
        <Skeleton variant="text" width={400} height={20} />
        <Skeleton variant="rounded" height={64} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  if (!grant) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <AlertCircle size={48} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
        <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>Grant not found</Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/grants')}
          sx={{ mt: 2 }}
        >
          Back to Grants
        </Button>
      </Box>
    );
  }

  if (submitted) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: '#ECFDF5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2.5,
          }}
        >
          <CheckCircle size={32} color="#059669" />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
          Application Submitted!
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 400, mx: 'auto', mb: 4 }}>
          Your application for &quot;{grant.title}&quot; has been submitted successfully.
          You will be notified when reviews are complete.
        </Typography>
        <Stack direction="row" spacing={1.5} justifyContent="center">
          <Button variant="outlined" onClick={() => router.push('/applications')}>
            View My Applications
          </Button>
          <Button variant="contained" onClick={() => router.push('/grants')}>
            Browse More Grants
          </Button>
        </Stack>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Stack spacing={3}>
      {/* Back & Title */}
      <Button
        size="small"
        startIcon={<ArrowLeft size={16} />}
        onClick={() => router.push(`/grants/${grantId}`)}
        sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
      >
        Back to Grant
      </Button>

      <Box>
        <Typography variant="h2" sx={{ color: 'text.primary' }}>
          Apply: {grant.title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{grant.donor_org_name}</Typography>
      </Box>

      {/* MUI Stepper */}
      <Stepper activeStep={currentStep - 1} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step Content */}
      {currentStep === 1 && (
        <EligibilityStep
          requirements={grant.eligibility ?? []}
          responses={eligibilityResponses}
          onChange={handleEligibilityChange}
        />
      )}
      {currentStep === 2 && (
        <ProposalStep
          criteria={grant.criteria ?? []}
          responses={proposalResponses}
          onChange={handleProposalChange}
          onGetGuidance={handleGetGuidance}
          guidanceLoading={guidanceLoading}
        />
      )}
      {currentStep === 3 && (
        <DocumentsStep
          requirements={grant.doc_requirements ?? []}
          uploads={docUploads}
          onChange={handleDocChange}
        />
      )}
      {currentStep === 4 && (
        <ReviewStep
          grant={grant}
          eligibilityResponses={eligibilityResponses}
          proposalResponses={proposalResponses}
          docUploads={docUploads}
        />
      )}

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button
          variant="outlined"
          disabled={currentStep === 1}
          startIcon={<ArrowLeft size={16} />}
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
        >
          Previous
        </Button>
        {currentStep < 4 ? (
          <Button
            variant="contained"
            endIcon={<ArrowRight size={16} />}
            onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Submit Application'}
          </Button>
        )}
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Eligibility
// ---------------------------------------------------------------------------

function EligibilityStep({
  requirements,
  responses,
  onChange,
}: {
  requirements: EligibilityRequirement[];
  responses: Record<string, EligibilityResponse>;
  onChange: (key: string, field: 'checked' | 'evidence', value: boolean | string) => void;
}) {
  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <CheckCircle size={40} color="#A7F3D0" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No specific eligibility requirements. Proceed to the next step.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <ClipboardList size={16} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Eligibility Requirements
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2.5 }}>
            Confirm that your organization meets each requirement
          </Typography>
          <Stack spacing={2.5} divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
            {requirements.map((req) => {
              const resp = responses[req.key] || { checked: false, evidence: '' };
              return (
                <Box key={req.key}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Checkbox
                      checked={resp.checked}
                      onChange={(e) => onChange(req.key, 'checked', e.target.checked)}
                      size="small"
                      sx={{ mt: -0.5 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                        {req.label}
                        {req.required && (
                          <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Box>
                        )}
                      </Typography>
                      {req.details && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}>
                          {req.details}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  {resp.checked && (
                    <Box sx={{ ml: 5, mt: 1 }}>
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        rows={2}
                        placeholder="Provide evidence or explanation..."
                        value={resp.evidence}
                        onChange={(e) => onChange(req.key, 'evidence', e.target.value)}
                      />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Proposal
// ---------------------------------------------------------------------------

function ProposalStep({
  criteria,
  responses,
  onChange,
  onGetGuidance,
  guidanceLoading,
}: {
  criteria: Criterion[];
  responses: Record<string, ProposalResponse>;
  onChange: (key: string, text: string) => void;
  onGetGuidance: (key: string, text: string) => void;
  guidanceLoading: Record<string, boolean>;
}) {
  if (criteria.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <FileText size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No proposal criteria defined. Proceed to the next step.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {criteria.map((c) => {
        const resp = responses[c.key] || { text: '', wordCount: 0 };
        const isLoading = guidanceLoading[c.key] || false;
        return (
          <Card key={c.key}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {c.label}
                  </Typography>
                  {c.description && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{c.description}</Typography>
                  )}
                  {c.instructions && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                      {c.instructions}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={`Weight: ${c.weight}`}
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ flexShrink: 0, fontWeight: 500, fontSize: '0.6875rem' }}
                />
              </Box>
              <TextField
                size="small"
                fullWidth
                multiline
                rows={5}
                placeholder={c.example || `Write your response for "${c.label}"...`}
                value={resp.text}
                onChange={(e) => onChange(c.key, e.target.value)}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: c.max_words && resp.wordCount > c.max_words ? 'error.main' : 'text.disabled',
                      fontWeight: c.max_words && resp.wordCount > c.max_words ? 500 : 400,
                    }}
                  >
                    {resp.wordCount} words{c.max_words ? ` / ${c.max_words} max` : ''}
                  </Typography>
                  {resp.qualityScore !== undefined && (
                    <ScoreRing score={resp.qualityScore} size={36} strokeWidth={3} />
                  )}
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!resp.text.trim() || isLoading}
                  startIcon={isLoading ? <CircularProgress size={12} /> : <Sparkles size={12} />}
                  onClick={() => onGetGuidance(c.key, resp.text)}
                  sx={{ color: '#7C3AED', borderColor: '#DDD6FE', '&:hover': { bgcolor: '#F5F3FF', borderColor: '#C4B5FD' } }}
                >
                  AI Guidance
                </Button>
              </Box>
              {resp.guidance && (
                <Box sx={{ mt: 1.5, p: 2, bgcolor: '#F5F3FF', borderRadius: 2, border: '1px solid #EDE9FE' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                    <Sparkles size={12} color="#7C3AED" />
                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#7C3AED' }}>AI Guidance</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: '#6D28D9' }}>{resp.guidance}</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Documents
// ---------------------------------------------------------------------------

function DocumentsStep({
  requirements,
  uploads,
  onChange,
}: {
  requirements: DocRequirement[];
  uploads: Record<string, DocUpload>;
  onChange: (key: string, file: File | null) => void;
}) {
  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <Upload size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No documents required. Proceed to review.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Upload size={16} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Required Documents
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2.5 }}>
            Upload the requested documents for your application
          </Typography>
          <Stack spacing={2}>
            {requirements.map((doc) => {
              const upload = uploads[doc.key];
              return (
                <Box key={doc.key} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                        {doc.label}
                        {doc.required && (
                          <Box component="span" sx={{ color: 'error.main', ml: 0.5 }}>*</Box>
                        )}
                      </Typography>
                      {doc.specific_requirements && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}>
                          {doc.specific_requirements}
                        </Typography>
                      )}
                    </Box>
                    {doc.ai_review && (
                      <Chip
                        label="AI Review"
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.625rem', height: 22, color: '#7C3AED', borderColor: '#DDD6FE', bgcolor: '#F5F3FF' }}
                      />
                    )}
                  </Box>
                  {upload?.file ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#ECFDF5', borderRadius: 2, border: '1px solid #A7F3D0' }}>
                      <CheckCircle size={20} color="#059669" />
                      <Typography variant="body2" noWrap sx={{ flex: 1, color: '#059669' }}>{upload.fileName}</Typography>
                      <Button size="small" onClick={() => onChange(doc.key, null)} sx={{ color: 'text.secondary' }}>
                        Remove
                      </Button>
                    </Box>
                  ) : (
                    <Box
                      component="label"
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1,
                        p: 4,
                        border: '2px dashed',
                        borderColor: 'divider',
                        borderRadius: 2,
                        cursor: 'pointer',
                        '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                        transition: 'all 0.2s',
                      }}
                    >
                      <Upload size={24} color="#94A3B8" />
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Click to upload</Typography>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>PDF, DOC, DOCX, XLS, XLSX up to 10MB</Typography>
                      <input
                        type="file"
                        hidden
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          onChange(doc.key, file);
                        }}
                      />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Review
// ---------------------------------------------------------------------------

function ReviewStep({
  grant,
  eligibilityResponses,
  proposalResponses,
  docUploads,
}: {
  grant: { title: string; eligibility?: EligibilityRequirement[]; criteria?: Criterion[]; doc_requirements?: DocRequirement[] };
  eligibilityResponses: Record<string, EligibilityResponse>;
  proposalResponses: Record<string, ProposalResponse>;
  docUploads: Record<string, DocUpload>;
}) {
  const eligibility = grant.eligibility ?? [];
  const criteria = grant.criteria ?? [];
  const docs = grant.doc_requirements ?? [];

  const metCount = Object.values(eligibilityResponses).filter((r) => r.checked).length;
  const answeredCount = Object.values(proposalResponses).filter((r) => r.text.trim()).length;
  const uploadedCount = Object.values(docUploads).filter((u) => u.file).length;
  const requiredDocs = docs.filter((d) => d.required);
  const requiredUploaded = requiredDocs.filter((d) => docUploads[d.key]?.file).length;

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Send size={16} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Review Your Application
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2.5 }}>
            Please review before submitting
          </Typography>
          <Stack spacing={3}>
            {/* Eligibility Summary */}
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>Eligibility</Typography>
                <Chip
                  label={`${metCount} / ${eligibility.length} met`}
                  size="small"
                  variant="outlined"
                  color={metCount === eligibility.length && eligibility.length > 0 ? 'success' : 'warning'}
                  sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
                />
              </Box>
              <Stack spacing={0.75}>
                {eligibility.map((req) => {
                  const resp = eligibilityResponses[req.key];
                  return (
                    <Box key={req.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {resp?.checked ? (
                        <CheckCircle size={16} color="#059669" />
                      ) : (
                        <AlertCircle size={16} color="#CBD5E1" />
                      )}
                      <Typography variant="body2" sx={{ color: resp?.checked ? 'text.secondary' : 'text.disabled' }}>
                        {req.label}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Box>

            {/* Proposal Summary */}
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>Proposal Responses</Typography>
                <Chip
                  label={`${answeredCount} / ${criteria.length} answered`}
                  size="small"
                  variant="outlined"
                  color={answeredCount === criteria.length && criteria.length > 0 ? 'success' : 'warning'}
                  sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
                />
              </Box>
              <Stack spacing={0.75}>
                {criteria.map((c) => {
                  const resp = proposalResponses[c.key];
                  const hasText = resp?.text?.trim();
                  return (
                    <Box key={c.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {hasText ? (
                          <CheckCircle size={16} color="#059669" />
                        ) : (
                          <AlertCircle size={16} color="#CBD5E1" />
                        )}
                        <Typography variant="body2" sx={{ color: hasText ? 'text.secondary' : 'text.disabled' }}>
                          {c.label}
                        </Typography>
                      </Box>
                      {hasText && (
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>{resp.wordCount} words</Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>

            {/* Documents Summary */}
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>Documents</Typography>
                <Chip
                  label={`${uploadedCount} / ${docs.length} uploaded`}
                  size="small"
                  variant="outlined"
                  color={requiredUploaded === requiredDocs.length && requiredDocs.length > 0 ? 'success' : 'warning'}
                  sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
                />
              </Box>
              <Stack spacing={0.75}>
                {docs.map((d) => {
                  const uploaded = docUploads[d.key]?.file;
                  return (
                    <Box key={d.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {uploaded ? (
                        <CheckCircle size={16} color="#059669" />
                      ) : (
                        <AlertCircle size={16} color={d.required ? '#F87171' : '#CBD5E1'} />
                      )}
                      <Typography
                        variant="body2"
                        sx={{ color: uploaded ? 'text.secondary' : d.required ? 'error.main' : 'text.disabled', flex: 1 }}
                      >
                        {d.label}
                        {d.required && !uploaded && ' (required)'}
                      </Typography>
                      {uploaded && (
                        <Typography variant="caption" noWrap sx={{ color: 'text.disabled', ml: 'auto' }}>
                          {docUploads[d.key].fileName}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
