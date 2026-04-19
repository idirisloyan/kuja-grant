'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGrant } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { ScoreRing } from '@/components/shared/score-ring';
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
  Loader2,
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
  if (!maxWords || maxWords === 0) return 'text-muted-foreground';
  const ratio = count / maxWords;
  if (ratio < 0.5) return 'text-red-600';
  if (ratio < 0.7) return 'text-amber-600';
  return 'text-emerald-600';
}

function scoreToneCls(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

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

const TA_CLS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] placeholder:text-muted-foreground';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[10px] border border-border bg-card shadow-[var(--kuja-elev-1)] ${className}`}>
      {children}
    </div>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
}) {
  const palette: Record<typeof tone, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-sky-50 border-sky-200 text-sky-800',
  };
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${palette[tone]}`}>{children}</div>
  );
}

function Chip({
  children,
  tone = 'default',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'red' | 'spark' | 'emerald' | 'amber' | 'clay';
  className?: string;
}) {
  const palette: Record<string, string> = {
    default: 'bg-background border-border text-foreground',
    red: 'bg-red-50 border-red-200 text-red-700',
    spark: 'bg-[hsl(var(--kuja-spark-soft))] border-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-spark))]',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    clay: 'bg-[hsl(var(--kuja-sand-50))] border-[hsl(var(--kuja-clay)/0.25)] text-[hsl(var(--kuja-clay))]',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${palette[tone]} ${className}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ApplyWizardClient() {
  const params = useParams();
  const grantId = Number(params.grantId);
  const router = useRouter();
  const { data, isLoading } = useGrant(grantId || null);
  const grant = data?.grant;

  const [step, setStep] = useState(0);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionScore, setSubmissionScore] = useState<number | null>(null);

  const [eligibility, setEligibility] = useState<Record<string, EligibilityResponse>>({});
  const [profileImported, setProfileImported] = useState(false);
  const [importingProfile, setImportingProfile] = useState(false);

  const [responses, setResponses] = useState<Record<string, string>>({});
  const [guidanceResults, setGuidanceResults] = useState<Record<string, GuidanceResult>>({});
  const [guidanceLoading, setGuidanceLoading] = useState<Record<string, boolean>>({});
  const [profileImportedProposal, setProfileImportedProposal] = useState(false);

  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({});
  const [orgProfile, setOrgProfile] = useState<Organization | null>(null);

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

  const ensureApplication = useCallback(async (): Promise<number | null> => {
    if (applicationId) return applicationId;
    try {
      const res = await api.post<{ application_id: number; id?: number }>('/applications/', {
        grant_id: grantId,
      });
      const id = res.application_id ?? res.id;
      setApplicationId(id as number);
      return id as number;
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
        /* best-effort */
      }
    },
    [eligibility, responses],
  );

  const canProceedFromEligibility = useCallback((): boolean => {
    const requirements = grant?.eligibility ?? [];
    const requiredItems = requirements.filter((r) => r.required);
    return requiredItems.every((r) => eligibility[r.key]?.checked);
  }, [grant, eligibility]);

  const handleNext = useCallback(async () => {
    if (step === 0 && !canProceedFromEligibility()) {
      toast.error('Please confirm all required eligibility items before proceeding');
      return;
    }
    const appId = await ensureApplication();
    if (!appId) return;
    await autoSave(appId);
    setStep((s) => Math.min(3, s + 1));
  }, [step, canProceedFromEligibility, ensureApplication, autoSave]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const handleEligibilityChange = useCallback(
    (key: string, field: 'checked' | 'evidence', value: boolean | string) => {
      setEligibility((prev) => ({
        ...prev,
        [key]: { ...(prev[key] || { checked: false, evidence: '' }), [field]: value },
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
      if ((key.includes('country') || label.includes('country') || label.includes('region')) && org.country) {
        autoChecked = true;
        autoEvidence = `Registered in ${org.country}`;
      }
      if ((key.includes('sector') || label.includes('sector') || label.includes('focus')) && org.sectors?.length) {
        autoChecked = true;
        autoEvidence = `Organization sectors: ${org.sectors.join(', ')}`;
      }
      if ((key.includes('budget') || label.includes('budget') || label.includes('financial')) && org.annual_budget) {
        autoChecked = true;
        autoEvidence = `Annual budget: ${org.annual_budget}`;
      }
      if ((key.includes('regist') || label.includes('regist') || label.includes('legal')) && org.registration_number) {
        autoChecked = true;
        autoEvidence = `Registration #${org.registration_number} (${org.registration_status})`;
      }
      if ((key.includes('year') || label.includes('established') || label.includes('experience')) && org.year_established) {
        const years = new Date().getFullYear() - org.year_established;
        autoChecked = true;
        autoEvidence = `Established ${org.year_established} (${years} years of experience)`;
      }
      if ((key.includes('staff') || label.includes('staff') || label.includes('capacity')) && org.staff_count) {
        autoChecked = true;
        autoEvidence = `Staff count: ${org.staff_count}`;
      }
      if (autoChecked) {
        updated[req.key] = { checked: true, evidence: updated[req.key]?.evidence || autoEvidence };
      }
    }
    setEligibility(updated);
    setProfileImported(true);
    setImportingProfile(false);
    toast.success('Profile data imported successfully');
  }, [eligibility, grant, fetchOrgProfile]);

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
    setGuidanceResults((prev) => ({ ...prev, [key]: { ...prev[key], visible: false } }));
  }, []);

  const handleApplySuggestions = useCallback(
    (key: string) => {
      const guidance = guidanceResults[key];
      if (!guidance) return;
      const current = responses[key] ?? '';
      const updated = current
        ? `${current}\n\n[AI Suggestions]\n${guidance.guidance}`
        : guidance.guidance;
      setResponses((prev) => ({ ...prev, [key]: updated }));
      setGuidanceResults((prev) => ({ ...prev, [key]: { ...prev[key], visible: false } }));
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
        if (org.geographic_areas?.length) parts.push(`Operating in: ${org.geographic_areas.join(', ')}.`);
        if (parts.length > 0 && !updated[c.key]?.trim()) {
          updated[c.key] = parts.join('\n');
        }
      }
    }
    setResponses(updated);
    setProfileImportedProposal(true);
    toast.success('Organization profile imported into relevant responses');
  }, [responses, grant, fetchOrgProfile]);

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

  const handleSubmit = useCallback(async () => {
    if (!grant) return;
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
      const eligibilityPayload: Record<string, { met: boolean; evidence: string }> = {};
      for (const [key, val] of Object.entries(eligibility)) {
        eligibilityPayload[key] = { met: val.checked, evidence: val.evidence };
      }
      await api.put(`/applications/${appId}`, {
        responses,
        eligibility_responses: eligibilityPayload,
      });
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
  // States
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-96 animate-pulse rounded-md bg-muted" />
        <div className="h-16 animate-pulse rounded-[10px] bg-muted" />
        <div className="h-64 animate-pulse rounded-[10px] bg-muted" />
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="py-16 text-center">
        <AlertCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <div className="text-sm font-medium text-muted-foreground">Grant not found</div>
        <button
          onClick={() => router.push('/grants')}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Grants
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle className="h-10 w-10 text-emerald-600" />
        </div>
        <h2 className="kuja-display text-2xl font-bold">Application Submitted!</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your application for &quot;{grant.title}&quot; has been submitted and is now being reviewed.
          You will be notified when scoring is complete.
        </p>
        {submissionScore !== null && (
          <div className="mt-4 flex justify-center">
            <div className="flex flex-col items-center">
              <ScoreRing score={submissionScore} size={96} strokeWidth={6} />
              <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                AI Score
              </span>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={() => router.push('/applications')}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            View My Applications
          </button>
          <button
            onClick={() => router.push('/grants')}
            className="rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
          >
            Browse More Grants
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Completeness
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

  return (
    <div className="max-w-[960px] space-y-5">
      <button
        onClick={() => router.push(`/grants/${grantId}`)}
        className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Grant
      </button>

      <div>
        <h1 className="kuja-display text-[2rem] font-semibold leading-[1.1] text-foreground">
          Apply: {grant.title}
        </h1>
        <div className="mt-1 text-sm text-muted-foreground">{grant.donor_org_name}</div>
      </div>

      {/* Custom stepper */}
      <div className="flex items-center gap-0 overflow-x-auto py-2">
        {STEPS.map((label, i) => {
          const active = i === step;
          const complete = i < step;
          return (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                    active
                      ? 'bg-[hsl(var(--kuja-clay))] text-white'
                      : complete
                        ? 'bg-[hsl(var(--kuja-savanna))] text-white'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {complete ? <CheckCircle className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={`hidden text-xs font-medium sm:inline ${
                    active || complete ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-px flex-1 ${
                    complete ? 'bg-[hsl(var(--kuja-savanna))]' : 'bg-border'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

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

      <div className="flex items-center justify-between border-t border-border pt-4">
        <button
          onClick={handleBack}
          disabled={step === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Previous
        </button>
        {step < 3 ? (
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || hasMissingItems}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:bg-[hsl(var(--kuja-clay-dark))] disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Step 1: Eligibility
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
      <Card className="py-10 text-center">
        <CheckCircle className="mx-auto mb-2 h-10 w-10 text-emerald-400" />
        <p className="text-sm text-muted-foreground">
          No specific eligibility requirements. Proceed to the next step.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">Eligibility Requirements</div>
          <div className="text-xs text-muted-foreground">
            Confirm your organization meets each requirement
          </div>
        </div>
        <button
          onClick={onImportProfile}
          disabled={importingProfile}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark-soft))]/80 disabled:opacity-50"
        >
          {importingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Import from Profile
        </button>
      </div>

      {profileImported && (
        <Alert tone="success">Profile data imported. Review and confirm each item below.</Alert>
      )}

      <Card className="p-5">
        <div className="divide-y divide-border">
          {requirements.map((req, idx) => {
            const resp = responses[req.key] || { checked: false, evidence: '' };
            return (
              <div key={req.key} className={idx === 0 ? 'pb-4' : idx === requirements.length - 1 ? 'pt-4' : 'py-4'}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={resp.checked}
                    onChange={(e) => onChange(req.key, 'checked', e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-input accent-[hsl(var(--kuja-clay))]"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{req.label}</span>
                      {req.required && <Chip tone="red">Required</Chip>}
                    </div>
                    {req.details && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{req.details}</div>
                    )}
                  </div>
                </div>
                <div className="ml-7 mt-2">
                  <textarea
                    rows={2}
                    placeholder="Provide evidence or explanation..."
                    value={resp.evidence}
                    onChange={(e) => onChange(req.key, 'evidence', e.target.value)}
                    className={TA_CLS}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Step 2: Proposal
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
      <Card className="py-10 text-center">
        <FileText className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No proposal criteria defined. Proceed to the next step.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">Proposal Responses</div>
          <div className="text-xs text-muted-foreground">
            Address each criterion. Use AI Help for real-time scoring and suggestions.
          </div>
        </div>
        <button
          onClick={onImportProfile}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark-soft))]/80"
        >
          <Download className="h-3.5 w-3.5" />
          Import from Profile
        </button>
      </div>

      {profileImported && (
        <Alert tone="success">
          Organization data imported into relevant criteria. Edit to strengthen your responses.
        </Alert>
      )}

      {criteria.map((c) => {
        const text = responses[c.key] ?? '';
        const wc = wordCount(text);
        const isLoadingGuidance = guidanceLoading[c.key] || false;
        const guidance = guidanceResults[c.key];
        const wcCls = wordCountColor(wc, c.max_words);

        return (
          <Card key={c.key} className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">{c.label}</div>
                {c.description && (
                  <div className="mt-1 text-sm text-muted-foreground">{c.description}</div>
                )}
                {c.instructions && (
                  <div className="mt-1 text-xs italic text-muted-foreground/70">{c.instructions}</div>
                )}
              </div>
              <Chip tone="clay">{c.weight}%</Chip>
            </div>

            <textarea
              rows={8}
              placeholder={c.example || `Write your response for "${c.label}"...`}
              value={text}
              onChange={(e) => onResponseChange(c.key, e.target.value)}
              className={TA_CLS}
            />

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${wcCls}`}>
                  {wc} words{c.max_words ? ` / ${c.max_words} max` : ''}
                </span>
                {c.max_words && c.max_words > 0 && (
                  <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        wc / c.max_words < 0.5
                          ? 'bg-red-500'
                          : wc / c.max_words < 0.7
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (wc / c.max_words) * 100)}%` }}
                    />
                  </div>
                )}
                {guidance && guidance.quality_score !== undefined && (
                  <ScoreRing score={guidance.quality_score} size={36} strokeWidth={3} />
                )}
              </div>
              <button
                onClick={() => onGetGuidance(c)}
                disabled={!text.trim() || isLoadingGuidance}
                className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark-soft))]/80 disabled:opacity-50"
              >
                {isLoadingGuidance ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isLoadingGuidance ? 'Analyzing...' : 'AI Help'}
              </button>
            </div>

            {guidance?.visible && (
              <div className="mt-3 rounded-[10px] border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--kuja-spark))]">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Guidance
                  </div>
                  <div className="flex flex-col items-center">
                    <ScoreRing score={guidance.quality_score} size={48} strokeWidth={3.5} />
                    <span className={`text-[9px] uppercase ${scoreToneCls(guidance.quality_score)}`}>score</span>
                  </div>
                </div>
                <p className="mb-3 whitespace-pre-line text-sm text-[#4C1D95]">{guidance.guidance}</p>
                <div className="flex justify-end gap-1.5 border-t border-[hsl(var(--kuja-spark)/0.15)] pt-2">
                  <button
                    onClick={() => onDismissGuidance(c.key)}
                    className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-background"
                  >
                    <X className="h-3 w-3" /> Dismiss
                  </button>
                  <button
                    onClick={() => onApplySuggestions(c.key)}
                    className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                  >
                    <Sparkles className="h-3 w-3" /> Apply Suggestions
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// =============================================================================
// Step 3: Documents
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
      <Card className="py-10 text-center">
        <Upload className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No documents required. Proceed to review.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold text-foreground">Document Upload</div>
        <div className="text-xs text-muted-foreground">
          Upload the required documents for your application
        </div>
      </div>

      <Card className="p-5">
        <div className="space-y-3">
          {requirements.map((doc) => {
            const upload = uploadedDocs[doc.key];
            return (
              <div
                key={doc.key}
                className={`rounded-[10px] border p-3 ${
                  upload?.uploaded
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : 'border-border bg-transparent'
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{doc.label}</span>
                      {doc.required && <Chip tone="red">Required</Chip>}
                      {doc.ai_review && <Chip tone="spark">AI Review</Chip>}
                    </div>
                    {doc.specific_requirements && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {doc.specific_requirements}
                      </div>
                    )}
                  </div>
                  {upload?.uploaded && upload.score !== null && upload.score !== undefined && (
                    <Chip tone={upload.score >= 80 ? 'emerald' : upload.score >= 60 ? 'amber' : 'red'}>
                      Score: {upload.score}
                    </Chip>
                  )}
                </div>

                {upload?.uploading ? (
                  <div className="flex items-center justify-center gap-2 p-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Uploading {upload.fileName}...
                    </span>
                  </div>
                ) : upload?.uploaded ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
                    <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                    <span className="flex-1 truncate text-sm text-emerald-700">{upload.fileName}</span>
                    <button
                      onClick={() => onRemove(doc.key)}
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      className="hidden"
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
                    <button
                      onClick={() => fileInputRefs.current[doc.key]?.click()}
                      className="flex w-full flex-col items-center gap-2 rounded-[10px] border-2 border-dashed border-border p-8 transition hover:border-[hsl(var(--kuja-clay))] hover:bg-muted/30"
                    >
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload</span>
                      <span className="text-xs text-muted-foreground/70">
                        PDF, DOC, DOCX, XLS, XLSX up to 10MB
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Step 4: Review
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

  const Section = ({
    title,
    chipText,
    chipTone,
    children,
  }: {
    title: string;
    chipText: string;
    chipTone: 'emerald' | 'amber';
    children: React.ReactNode;
  }) => (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <Chip tone={chipTone}>{chipText}</Chip>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      {hasMissingItems && (
        <Alert tone="warning">
          Some required items are missing. Please go back and complete them before submitting.
        </Alert>
      )}

      <Card className="p-5">
        <div className="mb-1 flex items-center gap-1.5">
          <Eye className="h-4 w-4" />
          <span className="text-sm font-semibold">Review Your Application</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Verify everything looks correct before submitting
        </p>

        <div className="space-y-3">
          <Section
            title="Eligibility"
            chipText={`${metCount} / ${eligibilityReqs.length} confirmed`}
            chipTone={metCount === eligibilityReqs.length && eligibilityReqs.length > 0 ? 'emerald' : 'amber'}
          >
            {eligibilityReqs.map((req) => {
              const resp = eligibility[req.key];
              const checked = resp?.checked;
              return (
                <div key={req.key} className="flex items-center gap-2 text-sm">
                  {checked ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className={`h-4 w-4 ${req.required ? 'text-red-500' : 'text-muted-foreground'}`} />
                  )}
                  <span
                    className={
                      checked
                        ? 'text-muted-foreground'
                        : req.required
                          ? 'text-red-600'
                          : 'text-muted-foreground/70'
                    }
                  >
                    {req.label}
                    {req.required && !checked && ' (required)'}
                  </span>
                </div>
              );
            })}
          </Section>

          <Section
            title="Proposal Responses"
            chipText={`${answeredCount} / ${criteria.length} answered`}
            chipTone={answeredCount === criteria.length && criteria.length > 0 ? 'emerald' : 'amber'}
          >
            {criteria.map((c) => {
              const text = responses[c.key] ?? '';
              const hasText = text.trim().length > 0;
              const wc = wordCount(text);
              return (
                <div key={c.key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {hasText ? (
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className={hasText ? 'text-muted-foreground' : 'text-red-600'}>
                      {c.label}
                      {!hasText && ' (missing)'}
                    </span>
                  </div>
                  {hasText && (
                    <span className="text-xs text-muted-foreground/70">{wc} words</span>
                  )}
                </div>
              );
            })}
          </Section>

          <Section
            title="Documents"
            chipText={`${uploadedCount} / ${docs.length} uploaded`}
            chipTone={requiredUploaded === requiredDocs.length && requiredDocs.length > 0 ? 'emerald' : 'amber'}
          >
            {docs.map((d) => {
              const upload = uploadedDocs[d.key];
              const uploaded = upload?.uploaded;
              return (
                <div key={d.key} className="flex items-center gap-2 text-sm">
                  {uploaded ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className={`h-4 w-4 ${d.required ? 'text-red-500' : 'text-muted-foreground'}`} />
                  )}
                  <span
                    className={`flex-1 ${
                      uploaded
                        ? 'text-muted-foreground'
                        : d.required
                          ? 'text-red-600'
                          : 'text-muted-foreground/70'
                    }`}
                  >
                    {d.label}
                    {d.required && !uploaded && ' (required)'}
                  </span>
                  {uploaded && (
                    <span className="truncate text-xs text-muted-foreground/70">{upload.fileName}</span>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      </Card>
    </div>
  );
}
