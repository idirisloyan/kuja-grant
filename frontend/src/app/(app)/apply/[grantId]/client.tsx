'use client';
import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGrant } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, ArrowRight, Check, ClipboardList, FileText,
  Upload, Send, Sparkles, Loader2, AlertCircle, CheckCircle,
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

const STEPS = [
  { num: 1, label: 'Eligibility', icon: ClipboardList },
  { num: 2, label: 'Proposal', icon: FileText },
  { num: 3, label: 'Documents', icon: Upload },
  { num: 4, label: 'Review & Submit', icon: Send },
];

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
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Grant not found</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => router.push('/grants')}>
          <ArrowLeft className="w-4 h-4" /> Back to Grants
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Application Submitted!</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
          Your application for &quot;{grant.title}&quot; has been submitted successfully.
          You will be notified when reviews are complete.
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => router.push('/applications')}>
            View My Applications
          </Button>
          <Button className="bg-brand-600 hover:bg-brand-700" onClick={() => router.push('/grants')}>
            Browse More Grants
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back & Title */}
      <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-slate-500" onClick={() => router.push(`/grants/${grantId}`)}>
        <ArrowLeft className="w-4 h-4" /> Back to Grant
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Apply: {grant.title}</h1>
        <p className="text-sm text-slate-500 mt-1">{grant.donor_org_name}</p>
      </div>

      {/* Step Progress */}
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = currentStep === step.num;
          const isCompleted = currentStep > step.num;
          return (
            <div key={step.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    isCompleted
                      ? 'bg-emerald-100 text-emerald-600'
                      : isActive
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span
                  className={`text-xs mt-1.5 font-medium ${
                    isActive ? 'text-brand-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-16 sm:w-24 h-0.5 mx-2 mt-[-20px] ${
                    currentStep > step.num ? 'bg-emerald-300' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

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
      <div className="flex justify-between pt-4 border-t border-slate-200">
        <Button
          variant="outline"
          disabled={currentStep === 1}
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          className="gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Previous
        </Button>
        {currentStep < 4 ? (
          <Button
            className="gap-1 bg-brand-600 hover:bg-brand-700"
            onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}
          >
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            className="gap-1 bg-brand-600 hover:bg-brand-700"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Submit Application
              </>
            )}
          </Button>
        )}
      </div>
    </div>
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
        <CardContent className="py-8 text-center">
          <CheckCircle className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No specific eligibility requirements. Proceed to the next step.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-brand-600" />
            Eligibility Requirements
          </CardTitle>
          <p className="text-sm text-slate-500">Confirm that your organization meets each requirement</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {requirements.map((req) => {
            const resp = responses[req.key] || { checked: false, evidence: '' };
            return (
              <div key={req.key} className="space-y-2 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={resp.checked}
                    onCheckedChange={(val: boolean) => onChange(req.key, 'checked', val)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label className="text-sm font-medium text-slate-900 cursor-pointer">
                      {req.label}
                      {req.required && <span className="text-rose-500 ml-1">*</span>}
                    </Label>
                    {req.details && (
                      <p className="text-xs text-slate-500 mt-0.5">{req.details}</p>
                    )}
                  </div>
                </div>
                {resp.checked && (
                  <div className="ml-7">
                    <Textarea
                      placeholder="Provide evidence or explanation..."
                      value={resp.evidence}
                      onChange={(e) => onChange(req.key, 'evidence', e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
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
        <CardContent className="py-8 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No proposal criteria defined. Proceed to the next step.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {criteria.map((c) => {
        const resp = responses[c.key] || { text: '', wordCount: 0 };
        const isLoading = guidanceLoading[c.key] || false;
        return (
          <Card key={c.key}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{c.label}</CardTitle>
                  {c.description && (
                    <p className="text-sm text-slate-500 mt-1">{c.description}</p>
                  )}
                  {c.instructions && (
                    <p className="text-xs text-slate-400 mt-1 italic">{c.instructions}</p>
                  )}
                </div>
                <Badge variant="outline" className="shrink-0 bg-brand-50 text-brand-700 border-brand-200">
                  Weight: {c.weight}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={c.example || `Write your response for "${c.label}"...`}
                value={resp.text}
                onChange={(e) => onChange(c.key, e.target.value)}
                rows={5}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${c.max_words && resp.wordCount > c.max_words ? 'text-rose-500 font-medium' : 'text-slate-400'}`}>
                    {resp.wordCount} words{c.max_words ? ` / ${c.max_words} max` : ''}
                  </span>
                  {resp.qualityScore !== undefined && (
                    <ScoreRing score={resp.qualityScore} size={36} strokeWidth={3} />
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-violet-600 border-violet-200 hover:bg-violet-50"
                  disabled={!resp.text.trim() || isLoading}
                  onClick={() => onGetGuidance(c.key, resp.text)}
                >
                  {isLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  AI Guidance
                </Button>
              </div>
              {resp.guidance && (
                <div className="p-3 bg-violet-50 rounded-lg border border-violet-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3 h-3 text-violet-600" />
                    <span className="text-xs font-medium text-violet-700">AI Guidance</span>
                  </div>
                  <p className="text-sm text-violet-800">{resp.guidance}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
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
        <CardContent className="py-8 text-center">
          <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No documents required. Proceed to review.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-brand-600" />
            Required Documents
          </CardTitle>
          <p className="text-sm text-slate-500">Upload the requested documents for your application</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {requirements.map((doc) => {
            const upload = uploads[doc.key];
            return (
              <div key={doc.key} className="p-4 border border-slate-200 rounded-lg">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {doc.label}
                      {doc.required && <span className="text-rose-500 ml-1">*</span>}
                    </p>
                    {doc.specific_requirements && (
                      <p className="text-xs text-slate-500 mt-0.5">{doc.specific_requirements}</p>
                    )}
                  </div>
                  {doc.ai_review && (
                    <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600 border-violet-200 shrink-0">
                      AI Review
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  {upload?.file ? (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="text-sm text-emerald-700 truncate flex-1">{upload.fileName}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                        onClick={() => onChange(doc.key, null)}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                      <Upload className="w-6 h-6 text-slate-400" />
                      <span className="text-sm text-slate-500">Click to upload</span>
                      <span className="text-xs text-slate-400">PDF, DOC, DOCX, XLS, XLSX up to 10MB</span>
                      <Input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          onChange(doc.key, file);
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4 text-brand-600" />
            Review Your Application
          </CardTitle>
          <p className="text-sm text-slate-500">Please review before submitting</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Eligibility Summary */}
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-900">Eligibility</p>
              <Badge variant="outline" className={metCount === eligibility.length && eligibility.length > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                {metCount} / {eligibility.length} met
              </Badge>
            </div>
            <div className="space-y-1.5">
              {eligibility.map((req) => {
                const resp = eligibilityResponses[req.key];
                return (
                  <div key={req.key} className="flex items-center gap-2 text-sm">
                    {resp?.checked ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <span className={resp?.checked ? 'text-slate-700' : 'text-slate-400'}>{req.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Proposal Summary */}
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-900">Proposal Responses</p>
              <Badge variant="outline" className={answeredCount === criteria.length && criteria.length > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                {answeredCount} / {criteria.length} answered
              </Badge>
            </div>
            <div className="space-y-1.5">
              {criteria.map((c) => {
                const resp = proposalResponses[c.key];
                const hasText = resp?.text?.trim();
                return (
                  <div key={c.key} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {hasText ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <span className={hasText ? 'text-slate-700' : 'text-slate-400'}>{c.label}</span>
                    </div>
                    {hasText && (
                      <span className="text-xs text-slate-400">{resp.wordCount} words</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Documents Summary */}
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-900">Documents</p>
              <Badge variant="outline" className={requiredUploaded === requiredDocs.length && requiredDocs.length > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                {uploadedCount} / {docs.length} uploaded
              </Badge>
            </div>
            <div className="space-y-1.5">
              {docs.map((d) => {
                const uploaded = docUploads[d.key]?.file;
                return (
                  <div key={d.key} className="flex items-center gap-2 text-sm">
                    {uploaded ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className={`w-4 h-4 shrink-0 ${d.required ? 'text-rose-400' : 'text-slate-300'}`} />
                    )}
                    <span className={uploaded ? 'text-slate-700' : d.required ? 'text-rose-500' : 'text-slate-400'}>
                      {d.label}
                      {d.required && !uploaded && ' (required)'}
                    </span>
                    {uploaded && (
                      <span className="text-xs text-slate-400 truncate ml-auto">{docUploads[d.key].fileName}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
