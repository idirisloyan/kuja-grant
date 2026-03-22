'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGrant } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { toast } from 'sonner';

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
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';

import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Upload,
  Send,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Download,
  X,
  Eye,
} from 'lucide-react';

import type {
  EligibilityRequirement,
  Criterion,
  DocRequirement,
  Organization,
  AIGuidanceResponse,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function wordCountColor(count: number, maxWords?: number): string {
  if (!maxWords || maxWords === 0) return '#94A3B8';
  const ratio = count / maxWords;
  if (ratio < 0.5) return '#EF4444'; // red
  if (ratio < 0.7) return '#F59E0B'; // amber
  return '#22C55E'; // green
}

function scoreColor(score: number): string {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#D97706';
  return '#DC2626';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EligibilityResponse {
  checked: boolean;
  evidence: string;
}

interface GuidanceResult {
  guidance: string;
  quality_score: number;
  source: string;
  visible: boolean;
}

interface UploadedDoc {
  fileName: string;
  uploading: boolean;
  uploaded: boolean;
  score?: number | null;
  docId?: number;
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

  // Wizard state
  const [step, setStep] = useState(0);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionScore, setSubmissionScore] = useState<number | null>(null);

  // Step 1: Eligibility
  const [eligibility, setEligibility] = useState<Record<string, EligibilityResponse>>({});
  const [profileImported, setProfileImported] = useState(false);
  const [importingProfile, setImportingProfile] = useState(false);

  // Step 2: Proposal
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [guidanceResults, setGuidanceResults] = useState<Record<string, GuidanceResult>>({});
  const [guidanceLoading, setGuidanceLoading] = useState<Record<string, boolean>>({});
  const [profileImportedProposal, setProfileImportedProposal] = useState(false);

  // Step 3: Documents
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({});

  // Org profile cache
  const [orgProfile, setOrgProfile] = useState<Organization | null>(null);

  // ---------------------------------------------------------------------------
  // Org Profile Loader
  // ---------------------------------------------------------------------------

  const fetchOrgProfile = useCallback(async (): Promise<Organization | null> => {
    if (orgProfile) return orgProfile;
    try {
      const res = await api.get<{ organization: Organization }>('/organizations/me');
      setOrgProfile(res.organization);
      return res.organization;
    } catch {
      toast.error('Failed to load organization profile');
      return null;
    }
  }, [orgProfile]);

  // ---------------------------------------------------------------------------
  // Application lifecycle
  // ---------------------------------------------------------------------------

  const ensureApplication = useCallback(async (): Promise<number | null> => {
    if (applicationId) return applicationId;
    try {
      const res = await api.post<{ application_id: number; id?: number }>('/applications/', {
        grant_id: grantId,
      });
      const id = res.application_id ?? res.id;
      setApplicationId(id);
      return id;
    } catch {
      toast.error('Failed to create application draft');
      return null;
    }
  }, [applicationId, grantId]);

  const autoSave = useCallback(
    async (appId: number) => {
      try {
        const eligibilityPayload: Record<string, { met: boolean; evidence: string }> = {};
        for (const [key, val] of Object.entries(eligibility)) {
          eligibilityPayload[key] = { met: val.checked, evidence: val.evidence };
        }
        await api.put(`/applications/${appId}`, {
          responses,
          eligibility_responses: eligibilityPayload,
        });
      } catch {
        // Auto-save is best-effort; don't block the user
      }
    },
    [eligibility, responses],
  );

  // ---------------------------------------------------------------------------
  // Step Navigation
  // ---------------------------------------------------------------------------

  const canProceedFromEligibility = useCallback((): boolean => {
    const requirements = grant?.eligibility ?? [];
    const requiredItems = requirements.filter((r) => r.required);
    return requiredItems.every((r) => eligibility[r.key]?.checked);
  }, [grant, eligibility]);

  const handleNext = useCallback(async () => {
    // Validate eligibility step
    if (step === 0 && !canProceedFromEligibility()) {
      toast.error('Please confirm all required eligibility items before proceeding');
      return;
    }

    // Create application on first forward navigation if needed
    const appId = await ensureApplication();
    if (!appId) return;

    // Auto-save current state
    await autoSave(appId);

    setStep((s) => Math.min(3, s + 1));
  }, [step, canProceedFromEligibility, ensureApplication, autoSave]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // ---------------------------------------------------------------------------
  // Step 1: Eligibility handlers
  // ---------------------------------------------------------------------------

  const handleEligibilityChange = useCallback(
    (key: string, field: 'checked' | 'evidence', value: boolean | string) => {
      setEligibility((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || { checked: false, evidence: '' }),
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleImportProfileEligibility = useCallback(async () => {
    setImportingProfile(true);
    const org = await fetchOrgProfile();
    if (!org || !grant) {
      setImportingProfile(false);
      return;
    }

    const updated = { ...eligibility };
    for (const req of grant.eligibility ?? []) {
      const key = req.key.toLowerCase();
      const label = req.label.toLowerCase();
      let autoChecked = false;
      let autoEvidence = '';

      // Country match
      if (
        (key.includes('country') || label.includes('country') || label.includes('region')) &&
        org.country
      ) {
        autoChecked = true;
        autoEvidence = `Registered in ${org.country}`;
      }

      // Sector match
      if (
        (key.includes('sector') || label.includes('sector') || label.includes('focus')) &&
        org.sectors?.length
      ) {
        autoChecked = true;
        autoEvidence = `Organization sectors: ${org.sectors.join(', ')}`;
      }

      // Budget match
      if (
        (key.includes('budget') || label.includes('budget') || label.includes('financial')) &&
        org.annual_budget
      ) {
        autoChecked = true;
        autoEvidence = `Annual budget: ${org.annual_budget}`;
      }

      // Registration / legal
      if (
        (key.includes('regist') || label.includes('regist') || label.includes('legal')) &&
        org.registration_number
      ) {
        autoChecked = true;
        autoEvidence = `Registration #${org.registration_number} (${org.registration_status})`;
      }

      // Years established
      if (
        (key.includes('year') || label.includes('established') || label.includes('experience')) &&
        org.year_established
      ) {
        const years = new Date().getFullYear() - org.year_established;
        autoChecked = true;
        autoEvidence = `Established ${org.year_established} (${years} years of experience)`;
      }

      // Staff count
      if (
        (key.includes('staff') || label.includes('staff') || label.includes('capacity')) &&
        org.staff_count
      ) {
        autoChecked = true;
        autoEvidence = `Staff count: ${org.staff_count}`;
      }

      if (autoChecked) {
        updated[req.key] = {
          checked: true,
          evidence: updated[req.key]?.evidence || autoEvidence,
        };
      }
    }

    setEligibility(updated);
    setProfileImported(true);
    setImportingProfile(false);
    toast.success('Profile data imported successfully');
  }, [eligibility, grant, fetchOrgProfile]);

  // ---------------------------------------------------------------------------
  // Step 2: Proposal handlers
  // ---------------------------------------------------------------------------

  const handleResponseChange = useCallback((key: string, text: string) => {
    setResponses((prev) => ({ ...prev, [key]: text }));
  }, []);

  const handleGetGuidance = useCallback(
    async (criterion: Criterion) => {
      const currentText = responses[criterion.key] ?? '';
      setGuidanceLoading((prev) => ({ ...prev, [criterion.key]: true }));
      try {
        const res = await api.post<AIGuidanceResponse>('/ai/guidance', {
          field_name: criterion.label,
          criterion: {
            label: criterion.label,
            description: criterion.description ?? '',
            instructions: criterion.instructions ?? '',
          },
          current_text: currentText,
        });
        setGuidanceResults((prev) => ({
          ...prev,
          [criterion.key]: {
            guidance: res.guidance,
            quality_score: res.quality_score,
            source: res.source,
            visible: true,
          },
        }));
      } catch {
        toast.error('AI guidance unavailable right now. Please try again.');
      } finally {
        setGuidanceLoading((prev) => ({ ...prev, [criterion.key]: false }));
      }
    },
    [responses],
  );

  const handleDismissGuidance = useCallback((key: string) => {
    setGuidanceResults((prev) => ({
      ...prev,
      [key]: { ...prev[key], visible: false },
    }));
  }, []);

  const handleApplySuggestions = useCallback(
    (key: string) => {
      const guidance = guidanceResults[key];
      if (!guidance) return;
      const current = responses[key] ?? '';
      // Append guidance as a note for the user to integrate
      const updated = current
        ? `${current}\n\n[AI Suggestions]\n${guidance.guidance}`
        : guidance.guidance;
      setResponses((prev) => ({ ...prev, [key]: updated }));
      setGuidanceResults((prev) => ({
        ...prev,
        [key]: { ...prev[key], visible: false },
      }));
      toast.success('AI suggestions applied to your response');
    },
    [guidanceResults, responses],
  );

  const handleImportProfileProposal = useCallback(async () => {
    const org = await fetchOrgProfile();
    if (!org || !grant) return;

    const updated = { ...responses };
    for (const c of grant.criteria ?? []) {
      const key = c.key.toLowerCase();
      const label = c.label.toLowerCase();

      // Experience / background criteria
      if (
        key.includes('experience') ||
        key.includes('background') ||
        key.includes('capacity') ||
        label.includes('experience') ||
        label.includes('background') ||
        label.includes('organization')
      ) {
        const parts: string[] = [];
        if (org.name) parts.push(`${org.name} is a ${org.org_type} organization.`);
        if (org.description) parts.push(org.description);
        if (org.mission) parts.push(`Our mission: ${org.mission}`);
        if (org.country) parts.push(`Based in ${org.country}${org.city ? `, ${org.city}` : ''}.`);
        if (org.year_established) {
          const years = new Date().getFullYear() - org.year_established;
          parts.push(`Established in ${org.year_established} with ${years} years of experience.`);
        }
        if (org.sectors?.length) parts.push(`Key sectors: ${org.sectors.join(', ')}.`);
        if (org.staff_count) parts.push(`Team size: ${org.staff_count} staff.`);
        if (org.geographic_areas?.length)
          parts.push(`Operating in: ${org.geographic_areas.join(', ')}.`);

        if (parts.length > 0 && !updated[c.key]?.trim()) {
          updated[c.key] = parts.join('\n');
        }
      }
    }

    setResponses(updated);
    setProfileImportedProposal(true);
    toast.success('Organization profile imported into relevant responses');
  }, [responses, grant, fetchOrgProfile]);

  // ---------------------------------------------------------------------------
  // Step 3: Document upload
  // ---------------------------------------------------------------------------

  const handleFileUpload = useCallback(
    async (docKey: string, docType: string, file: File) => {
      const appId = applicationId ?? (await ensureApplication());
      if (!appId) return;

      setUploadedDocs((prev) => ({
        ...prev,
        [docKey]: { fileName: file.name, uploading: true, uploaded: false },
      }));

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('application_id', String(appId));
        formData.append('doc_type', docType);

        const res = await api.upload<{ document_id?: number; score?: number }>(
          '/documents/upload',
          formData,
        );

        setUploadedDocs((prev) => ({
          ...prev,
          [docKey]: {
            fileName: file.name,
            uploading: false,
            uploaded: true,
            score: res.score ?? null,
            docId: res.document_id,
          },
        }));
        toast.success(`${file.name} uploaded successfully`);
      } catch {
        setUploadedDocs((prev) => ({
          ...prev,
          [docKey]: { fileName: file.name, uploading: false, uploaded: false },
        }));
        toast.error(`Failed to upload ${file.name}`);
      }
    },
    [applicationId, ensureApplication],
  );

  const handleRemoveDoc = useCallback((docKey: string) => {
    setUploadedDocs((prev) => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Step 4: Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!grant) return;

    // Check completeness
    const requirements = grant.eligibility ?? [];
    const requiredEligibility = requirements.filter((r) => r.required);
    const unmetEligibility = requiredEligibility.filter((r) => !eligibility[r.key]?.checked);
    if (unmetEligibility.length > 0) {
      toast.error('Some required eligibility items are not confirmed');
      return;
    }

    const requiredDocs = (grant.doc_requirements ?? []).filter((d) => d.required);
    const missingDocs = requiredDocs.filter((d) => !uploadedDocs[d.key]?.uploaded);
    if (missingDocs.length > 0) {
      toast.error('Please upload all required documents before submitting');
      return;
    }

    setSubmitting(true);
    try {
      const appId = applicationId ?? (await ensureApplication());
      if (!appId) {
        setSubmitting(false);
        return;
      }

      // Final save
      const eligibilityPayload: Record<string, { met: boolean; evidence: string }> = {};
      for (const [key, val] of Object.entries(eligibility)) {
        eligibilityPayload[key] = { met: val.checked, evidence: val.evidence };
      }
      await api.put(`/applications/${appId}`, {
        responses,
        eligibility_responses: eligibilityPayload,
      });

      // Submit
      const result = await api.post<{
        success: boolean;
        ai_score?: number;
        scores?: { overall_score?: number };
      }>(`/applications/${appId}/submit`);

      const score = result.ai_score ?? result.scores?.overall_score ?? null;
      setSubmissionScore(score);
      setSubmitted(true);
      toast.success('Application submitted successfully!');
    } catch {
      toast.error('Failed to submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [grant, eligibility, responses, uploadedDocs, applicationId, ensureApplication]);

  // ---------------------------------------------------------------------------
  // Loading State
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
        <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
          Grant not found
        </Typography>
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

  // ---------------------------------------------------------------------------
  // Submitted State
  // ---------------------------------------------------------------------------

  if (submitted) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            bgcolor: '#ECFDF5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3,
          }}
        >
          <CheckCircle size={40} color="#059669" />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
          Application Submitted!
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', maxWidth: 440, mx: 'auto', mb: 2 }}
        >
          Your application for &quot;{grant.title}&quot; has been submitted and is now being
          reviewed. You will be notified when scoring is complete.
        </Typography>
        {submissionScore !== null && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress
                variant="determinate"
                value={submissionScore}
                size={96}
                thickness={4}
                sx={{ color: scoreColor(submissionScore) }}
              />
              <Box
                sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: 'absolute',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, color: scoreColor(submissionScore) }}
                >
                  {submissionScore}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.625rem' }}>
                  AI Score
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
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
  // Completeness calculations for review step
  // ---------------------------------------------------------------------------

  const eligibilityReqs = grant.eligibility ?? [];
  const criteria = grant.criteria ?? [];
  const docReqs = grant.doc_requirements ?? [];

  const requiredEligMet = eligibilityReqs
    .filter((r) => r.required)
    .every((r) => eligibility[r.key]?.checked);
  const allCriteriaAnswered = criteria.every((c) => (responses[c.key] ?? '').trim().length > 0);
  const requiredDocsUploaded = docReqs
    .filter((d) => d.required)
    .every((d) => uploadedDocs[d.key]?.uploaded);

  const hasMissingItems = !requiredEligMet || !allCriteriaAnswered || !requiredDocsUploaded;

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
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Apply: {grant.title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {grant.donor_org_name}
        </Typography>
      </Box>

      {/* MUI Stepper */}
      <Stepper activeStep={step} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step Content */}
      {step === 0 && (
        <EligibilityStep
          requirements={eligibilityReqs}
          responses={eligibility}
          onChange={handleEligibilityChange}
          onImportProfile={handleImportProfileEligibility}
          profileImported={profileImported}
          importingProfile={importingProfile}
        />
      )}
      {step === 1 && (
        <ProposalStep
          criteria={criteria}
          responses={responses}
          onResponseChange={handleResponseChange}
          guidanceResults={guidanceResults}
          guidanceLoading={guidanceLoading}
          onGetGuidance={handleGetGuidance}
          onDismissGuidance={handleDismissGuidance}
          onApplySuggestions={handleApplySuggestions}
          onImportProfile={handleImportProfileProposal}
          profileImported={profileImportedProposal}
        />
      )}
      {step === 2 && (
        <DocumentsStep
          requirements={docReqs}
          uploadedDocs={uploadedDocs}
          onUpload={handleFileUpload}
          onRemove={handleRemoveDoc}
        />
      )}
      {step === 3 && (
        <ReviewStep
          grant={grant}
          eligibility={eligibility}
          responses={responses}
          criteria={criteria}
          uploadedDocs={uploadedDocs}
          hasMissingItems={hasMissingItems}
        />
      )}

      {/* Navigation */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          pt: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Button
          variant="outlined"
          disabled={step === 0}
          startIcon={<ArrowLeft size={16} />}
          onClick={handleBack}
        >
          Previous
        </Button>
        {step < 3 ? (
          <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={handleNext}>
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={submitting || hasMissingItems}
            startIcon={
              submitting ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />
            }
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Submit Application'}
          </Button>
        )}
      </Box>
    </Stack>
  );
}

// =============================================================================
// Step 1: Eligibility Check
// =============================================================================

function EligibilityStep({
  requirements,
  responses,
  onChange,
  onImportProfile,
  profileImported,
  importingProfile,
}: {
  requirements: EligibilityRequirement[];
  responses: Record<string, EligibilityResponse>;
  onChange: (key: string, field: 'checked' | 'evidence', value: boolean | string) => void;
  onImportProfile: () => void;
  profileImported: boolean;
  importingProfile: boolean;
}) {
  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <CheckCircle size={40} color="#A7F3D0" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No specific eligibility requirements. Proceed to the next step.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {/* Import from Profile */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Eligibility Requirements
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Confirm your organization meets each requirement
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          disabled={importingProfile}
          startIcon={
            importingProfile ? <CircularProgress size={14} /> : <Download size={14} />
          }
          onClick={onImportProfile}
          sx={{
            borderColor: '#C7D2FE',
            color: '#4F46E5',
            '&:hover': { bgcolor: '#EEF2FF', borderColor: '#A5B4FC' },
          }}
        >
          Import from Profile
        </Button>
      </Box>

      {profileImported && (
        <Alert severity="success" sx={{ py: 0.5 }}>
          Profile data imported. Review and confirm each item below.
        </Alert>
      )}

      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Stack
            spacing={2.5}
            divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}
          >
            {requirements.map((req) => {
              const resp = responses[req.key] || { checked: false, evidence: '' };
              return (
                <Box key={req.key}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={resp.checked}
                          onChange={(e) => onChange(req.key, 'checked', e.target.checked)}
                          size="small"
                        />
                      }
                      label=""
                      sx={{ mr: 0, ml: -0.5 }}
                    />
                    <Box sx={{ flex: 1, pt: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                          {req.label}
                        </Typography>
                        {req.required && (
                          <Chip
                            label="Required"
                            size="small"
                            color="error"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.625rem' }}
                          />
                        )}
                      </Box>
                      {req.details && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}
                        >
                          {req.details}
                        </Typography>
                      )}
                    </Box>
                  </Box>
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
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

// =============================================================================
// Step 2: Proposal Responses (Key Step)
// =============================================================================

function ProposalStep({
  criteria,
  responses,
  onResponseChange,
  guidanceResults,
  guidanceLoading,
  onGetGuidance,
  onDismissGuidance,
  onApplySuggestions,
  onImportProfile,
  profileImported,
}: {
  criteria: Criterion[];
  responses: Record<string, string>;
  onResponseChange: (key: string, text: string) => void;
  guidanceResults: Record<string, GuidanceResult>;
  guidanceLoading: Record<string, boolean>;
  onGetGuidance: (criterion: Criterion) => void;
  onDismissGuidance: (key: string) => void;
  onApplySuggestions: (key: string) => void;
  onImportProfile: () => void;
  profileImported: boolean;
}) {
  if (criteria.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <FileText size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No proposal criteria defined. Proceed to the next step.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {/* Header with Import */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Proposal Responses
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Address each criterion. Use AI Help for real-time scoring and suggestions.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Download size={14} />}
          onClick={onImportProfile}
          sx={{
            borderColor: '#C7D2FE',
            color: '#4F46E5',
            '&:hover': { bgcolor: '#EEF2FF', borderColor: '#A5B4FC' },
          }}
        >
          Import from Profile
        </Button>
      </Box>

      {profileImported && (
        <Alert severity="success" sx={{ py: 0.5 }}>
          Organization data imported into relevant criteria. Edit to strengthen your responses.
        </Alert>
      )}

      {criteria.map((c) => {
        const text = responses[c.key] ?? '';
        const wc = wordCount(text);
        const isLoadingGuidance = guidanceLoading[c.key] || false;
        const guidance = guidanceResults[c.key];

        return (
          <Card key={c.key}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              {/* Criterion Header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  mb: 2,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {c.label}
                  </Typography>
                  {c.description && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                      {c.description}
                    </Typography>
                  )}
                  {c.instructions && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.disabled',
                        mt: 0.5,
                        display: 'block',
                        fontStyle: 'italic',
                      }}
                    >
                      {c.instructions}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={`${c.weight}%`}
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ flexShrink: 0, fontWeight: 600, fontSize: '0.75rem' }}
                />
              </Box>

              {/* Response TextField */}
              <TextField
                size="small"
                fullWidth
                multiline
                rows={8}
                placeholder={c.example || `Write your response for "${c.label}"...`}
                value={text}
                onChange={(e) => onResponseChange(c.key, e.target.value)}
              />

              {/* Word Count + AI Help */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mt: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: wordCountColor(wc, c.max_words),
                      fontWeight: 500,
                    }}
                  >
                    {wc} words{c.max_words ? ` / ${c.max_words} max` : ''}
                  </Typography>
                  {c.max_words && c.max_words > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, (wc / c.max_words) * 100)}
                      sx={{
                        width: 60,
                        height: 4,
                        borderRadius: 2,
                        bgcolor: '#F1F5F9',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: wordCountColor(wc, c.max_words),
                          borderRadius: 2,
                        },
                      }}
                    />
                  )}
                  {/* Inline score from last guidance */}
                  {guidance && guidance.quality_score !== undefined && (
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      <CircularProgress
                        variant="determinate"
                        value={guidance.quality_score}
                        size={36}
                        thickness={3}
                        sx={{ color: scoreColor(guidance.quality_score) }}
                      />
                      <Box
                        sx={{
                          top: 0,
                          left: 0,
                          bottom: 0,
                          right: 0,
                          position: 'absolute',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.625rem',
                            color: scoreColor(guidance.quality_score),
                          }}
                        >
                          {guidance.quality_score}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!text.trim() || isLoadingGuidance}
                  startIcon={
                    isLoadingGuidance ? (
                      <CircularProgress size={14} />
                    ) : (
                      <Sparkles size={14} />
                    )
                  }
                  onClick={() => onGetGuidance(c)}
                  sx={{
                    color: '#7C3AED',
                    borderColor: '#DDD6FE',
                    '&:hover': { bgcolor: '#F5F3FF', borderColor: '#C4B5FD' },
                  }}
                >
                  {isLoadingGuidance ? 'Analyzing...' : 'AI Help'}
                </Button>
              </Box>

              {/* AI Guidance Card */}
              {guidance?.visible && (
                <Card
                  variant="outlined"
                  sx={{
                    mt: 2,
                    bgcolor: '#F5F3FF',
                    borderColor: '#EDE9FE',
                  }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 1.5,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Sparkles size={14} color="#7C3AED" />
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#7C3AED' }}>
                          AI Guidance
                        </Typography>
                      </Box>
                      {/* Score ring */}
                      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                        <CircularProgress
                          variant="determinate"
                          value={guidance.quality_score}
                          size={48}
                          thickness={3.5}
                          sx={{ color: scoreColor(guidance.quality_score) }}
                        />
                        <Box
                          sx={{
                            top: 0,
                            left: 0,
                            bottom: 0,
                            right: 0,
                            position: 'absolute',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              lineHeight: 1,
                              color: scoreColor(guidance.quality_score),
                            }}
                          >
                            {guidance.quality_score}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.5rem', color: 'text.disabled', lineHeight: 1 }}
                          >
                            score
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Typography
                      variant="body2"
                      sx={{ color: '#4C1D95', whiteSpace: 'pre-line', mb: 2 }}
                    >
                      {guidance.guidance}
                    </Typography>

                    <Divider sx={{ mb: 1.5 }} />

                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<X size={14} />}
                        onClick={() => onDismissGuidance(c.key)}
                        sx={{ color: 'text.secondary' }}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<Sparkles size={14} />}
                        onClick={() => onApplySuggestions(c.key)}
                        sx={{
                          bgcolor: '#7C3AED',
                          '&:hover': { bgcolor: '#6D28D9' },
                        }}
                      >
                        Apply Suggestions
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}

// =============================================================================
// Step 3: Document Upload
// =============================================================================

function DocumentsStep({
  requirements,
  uploadedDocs,
  onUpload,
  onRemove,
}: {
  requirements: DocRequirement[];
  uploadedDocs: Record<string, UploadedDoc>;
  onUpload: (docKey: string, docType: string, file: File) => void;
  onRemove: (docKey: string) => void;
}) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <Upload size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No documents required. Proceed to review.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
          Document Upload
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Upload the required documents for your application
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Stack spacing={2}>
            {requirements.map((doc) => {
              const upload = uploadedDocs[doc.key];
              return (
                <Box
                  key={doc.key}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: upload?.uploaded ? '#A7F3D0' : 'divider',
                    borderRadius: 2,
                    bgcolor: upload?.uploaded ? '#F0FDF4' : 'transparent',
                  }}
                >
                  {/* Doc header */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 1.5,
                      mb: 1.5,
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, color: 'text.primary' }}
                        >
                          {doc.label}
                        </Typography>
                        {doc.required && (
                          <Chip
                            label="Required"
                            size="small"
                            color="error"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.625rem' }}
                          />
                        )}
                        {doc.ai_review && (
                          <Chip
                            label="AI Review"
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 20,
                              fontSize: '0.625rem',
                              color: '#7C3AED',
                              borderColor: '#DDD6FE',
                              bgcolor: '#F5F3FF',
                            }}
                          />
                        )}
                      </Box>
                      {doc.specific_requirements && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}
                        >
                          {doc.specific_requirements}
                        </Typography>
                      )}
                    </Box>
                    {/* Score badge if AI analysis returned */}
                    {upload?.uploaded && upload.score !== null && upload.score !== undefined && (
                      <Chip
                        label={`Score: ${upload.score}`}
                        size="small"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.6875rem',
                          bgcolor: scoreColor(upload.score) + '15',
                          color: scoreColor(upload.score),
                          border: `1px solid ${scoreColor(upload.score)}40`,
                        }}
                      />
                    )}
                  </Box>

                  {/* Upload state */}
                  {upload?.uploading ? (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        p: 3,
                        justifyContent: 'center',
                      }}
                    >
                      <CircularProgress size={24} />
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Uploading {upload.fileName}...
                      </Typography>
                    </Box>
                  ) : upload?.uploaded ? (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        p: 1.5,
                        bgcolor: '#ECFDF5',
                        borderRadius: 2,
                        border: '1px solid #A7F3D0',
                      }}
                    >
                      <CheckCircle size={20} color="#059669" />
                      <Typography variant="body2" noWrap sx={{ flex: 1, color: '#059669' }}>
                        {upload.fileName}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => onRemove(doc.key)}
                        sx={{ color: 'text.secondary', minWidth: 'auto' }}
                      >
                        Remove
                      </Button>
                    </Box>
                  ) : (
                    <Box>
                      <input
                        type="file"
                        hidden
                        ref={(el) => {
                          fileInputRefs.current[doc.key] = el;
                        }}
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onUpload(doc.key, doc.key, file);
                          e.target.value = '';
                        }}
                      />
                      <Box
                        onClick={() => fileInputRefs.current[doc.key]?.click()}
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
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Click to upload
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          PDF, DOC, DOCX, XLS, XLSX up to 10MB
                        </Typography>
                      </Box>
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

// =============================================================================
// Step 4: Review & Submit
// =============================================================================

function ReviewStep({
  grant,
  eligibility,
  responses,
  criteria,
  uploadedDocs,
  hasMissingItems,
}: {
  grant: {
    title: string;
    eligibility?: EligibilityRequirement[];
    criteria?: Criterion[];
    doc_requirements?: DocRequirement[];
  };
  eligibility: Record<string, EligibilityResponse>;
  responses: Record<string, string>;
  criteria: Criterion[];
  uploadedDocs: Record<string, UploadedDoc>;
  hasMissingItems: boolean;
}) {
  const eligibilityReqs = grant.eligibility ?? [];
  const docs = grant.doc_requirements ?? [];

  const metCount = Object.values(eligibility).filter((r) => r.checked).length;
  const answeredCount = criteria.filter((c) => (responses[c.key] ?? '').trim().length > 0).length;
  const uploadedCount = Object.values(uploadedDocs).filter((u) => u.uploaded).length;
  const requiredDocs = docs.filter((d) => d.required);
  const requiredUploaded = requiredDocs.filter((d) => uploadedDocs[d.key]?.uploaded).length;

  return (
    <Stack spacing={2}>
      {hasMissingItems && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Some required items are missing. Please go back and complete them before submitting.
        </Alert>
      )}

      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Eye size={16} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Review Your Application
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2.5 }}>
            Verify everything looks correct before submitting
          </Typography>

          <Stack spacing={3}>
            {/* Eligibility Summary */}
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.5,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  Eligibility
                </Typography>
                <Chip
                  label={`${metCount} / ${eligibilityReqs.length} confirmed`}
                  size="small"
                  variant="outlined"
                  color={
                    metCount === eligibilityReqs.length && eligibilityReqs.length > 0
                      ? 'success'
                      : 'warning'
                  }
                  sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
                />
              </Box>
              <Stack spacing={0.75}>
                {eligibilityReqs.map((req) => {
                  const resp = eligibility[req.key];
                  const checked = resp?.checked;
                  return (
                    <Box key={req.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {checked ? (
                        <CheckCircle size={16} color="#059669" />
                      ) : (
                        <AlertCircle
                          size={16}
                          color={req.required ? '#EF4444' : '#CBD5E1'}
                        />
                      )}
                      <Typography
                        variant="body2"
                        sx={{
                          color: checked
                            ? 'text.secondary'
                            : req.required
                              ? 'error.main'
                              : 'text.disabled',
                        }}
                      >
                        {req.label}
                        {req.required && !checked && ' (required)'}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Box>

            {/* Proposal Summary */}
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.5,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  Proposal Responses
                </Typography>
                <Chip
                  label={`${answeredCount} / ${criteria.length} answered`}
                  size="small"
                  variant="outlined"
                  color={
                    answeredCount === criteria.length && criteria.length > 0
                      ? 'success'
                      : 'warning'
                  }
                  sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
                />
              </Box>
              <Stack spacing={0.75}>
                {criteria.map((c) => {
                  const text = responses[c.key] ?? '';
                  const hasText = text.trim().length > 0;
                  const wc = wordCount(text);
                  return (
                    <Box
                      key={c.key}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {hasText ? (
                          <CheckCircle size={16} color="#059669" />
                        ) : (
                          <AlertCircle size={16} color="#EF4444" />
                        )}
                        <Typography
                          variant="body2"
                          sx={{
                            color: hasText ? 'text.secondary' : 'error.main',
                          }}
                        >
                          {c.label}
                          {!hasText && ' (missing)'}
                        </Typography>
                      </Box>
                      {hasText && (
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          {wc} words
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>

            {/* Documents Summary */}
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.5,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  Documents
                </Typography>
                <Chip
                  label={`${uploadedCount} / ${docs.length} uploaded`}
                  size="small"
                  variant="outlined"
                  color={
                    requiredUploaded === requiredDocs.length && requiredDocs.length > 0
                      ? 'success'
                      : 'warning'
                  }
                  sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
                />
              </Box>
              <Stack spacing={0.75}>
                {docs.map((d) => {
                  const upload = uploadedDocs[d.key];
                  const uploaded = upload?.uploaded;
                  return (
                    <Box key={d.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {uploaded ? (
                        <CheckCircle size={16} color="#059669" />
                      ) : (
                        <AlertCircle
                          size={16}
                          color={d.required ? '#EF4444' : '#CBD5E1'}
                        />
                      )}
                      <Typography
                        variant="body2"
                        sx={{
                          color: uploaded
                            ? 'text.secondary'
                            : d.required
                              ? 'error.main'
                              : 'text.disabled',
                          flex: 1,
                        }}
                      >
                        {d.label}
                        {d.required && !uploaded && ' (required)'}
                      </Typography>
                      {uploaded && (
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{ color: 'text.disabled', ml: 'auto' }}
                        >
                          {upload.fileName}
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
