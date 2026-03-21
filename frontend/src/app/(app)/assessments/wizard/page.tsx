'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAssessmentFrameworks } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, ArrowRight, Check, Building2, ClipboardList, Upload,
  BarChart3, Loader2, Play, CheckCircle, AlertCircle,
} from 'lucide-react';
import type { AssessmentFramework, FrameworkInfo } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgProfile {
  name: string;
  country: string;
  year_established: string;
  annual_budget: string;
  staff_count: string;
  mission: string;
  sectors: string;
}

interface DocFile {
  file: File | null;
  fileName: string;
}

interface AssessmentResult {
  overall_score: number;
  category_scores: Record<string, number>;
  gaps: string[];
}

const STEPS = [
  { num: 1, label: 'Org Profile', icon: Building2 },
  { num: 2, label: 'Compliance', icon: ClipboardList },
  { num: 3, label: 'Documents', icon: Upload },
  { num: 4, label: 'Results', icon: BarChart3 },
];

const FRAMEWORK_OPTIONS: { key: AssessmentFramework; label: string }[] = [
  { key: 'kuja', label: 'Kuja Framework' },
  { key: 'step', label: 'STEP Framework' },
  { key: 'un_hact', label: 'UN-HACT' },
  { key: 'chs', label: 'CHS (Core Humanitarian Standard)' },
  { key: 'nupas', label: 'NUPAS' },
];

const DOC_TYPES = [
  { key: 'registration', label: 'Registration Certificate', description: 'Official registration document from government' },
  { key: 'financial', label: 'Financial Statements', description: 'Most recent audited financial statements' },
  { key: 'audit', label: 'Audit Report', description: 'External audit report (last 2 years)' },
  { key: 'psea', label: 'PSEA Policy', description: 'Protection from Sexual Exploitation and Abuse policy' },
  { key: 'strategic_plan', label: 'Strategic Plan', description: 'Current organizational strategic plan' },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AssessmentWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { data: fwData, isLoading: fwLoading } = useAssessmentFrameworks();
  const frameworks = useMemo(() => fwData?.frameworks ?? {}, [fwData]);

  const initialFramework = (searchParams.get('framework') as AssessmentFramework) || '';
  const [selectedFramework, setSelectedFramework] = useState<AssessmentFramework | ''>(initialFramework);
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Org Profile
  const [orgProfile, setOrgProfile] = useState<OrgProfile>({
    name: user?.org_name || '',
    country: '',
    year_established: '',
    annual_budget: '',
    staff_count: '',
    mission: '',
    sectors: '',
  });

  // Step 2: Checklist
  const [checklistResponses, setChecklistResponses] = useState<Record<string, boolean>>({});

  // Step 3: Documents
  const [docUploads, setDocUploads] = useState<Record<string, DocFile>>({});

  // Step 4: Results
  const [results, setResults] = useState<AssessmentResult | null>(null);

  // ---------------------------------------------------------------------------
  // Get framework info for checklist categories
  // ---------------------------------------------------------------------------

  const frameworkInfo: FrameworkInfo | null = useMemo(() => {
    if (!selectedFramework || !frameworks[selectedFramework]) return null;
    return frameworks[selectedFramework] as FrameworkInfo;
  }, [selectedFramework, frameworks]);

  // Generate checklist items from framework categories
  const checklistCategories = useMemo(() => {
    if (!frameworkInfo) return [];
    return frameworkInfo.categories.map((cat) => ({
      category: cat,
      items: [
        { key: `${cat}_policy`, label: `Has a documented ${cat.toLowerCase()} policy` },
        { key: `${cat}_procedures`, label: `Has established ${cat.toLowerCase()} procedures` },
        { key: `${cat}_training`, label: `Staff trained on ${cat.toLowerCase()}` },
        { key: `${cat}_monitoring`, label: `Regular ${cat.toLowerCase()} monitoring in place` },
      ],
    }));
  }, [frameworkInfo]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleProfileChange = useCallback((field: keyof OrgProfile, value: string) => {
    setOrgProfile((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleChecklistChange = useCallback((key: string, checked: boolean) => {
    setChecklistResponses((prev) => ({ ...prev, [key]: checked }));
  }, []);

  const handleDocChange = useCallback((key: string, file: File | null) => {
    setDocUploads((prev) => ({
      ...prev,
      [key]: { file, fileName: file?.name ?? '' },
    }));
  }, []);

  const handleSubmitAssessment = useCallback(async () => {
    if (!selectedFramework) return;
    setSubmitting(true);
    try {
      const res = await api.post<{
        assessment_id: number;
        overall_score: number;
        category_scores: Record<string, number>;
        gaps: string[];
        success: boolean;
      }>('/assessments/', {
        framework: selectedFramework,
        org_profile: orgProfile,
        checklist_responses: checklistResponses,
      });

      // Upload documents if any
      if (res.assessment_id) {
        for (const [docType, upload] of Object.entries(docUploads)) {
          if (upload.file) {
            const formData = new FormData();
            formData.append('file', upload.file);
            formData.append('doc_type', docType);
            await api.upload(`/assessments/${res.assessment_id}/documents`, formData);
          }
        }
      }

      setResults({
        overall_score: res.overall_score ?? 0,
        category_scores: res.category_scores ?? {},
        gaps: res.gaps ?? [],
      });
      setCurrentStep(4);
    } catch {
      // Error handling
    } finally {
      setSubmitting(false);
    }
  }, [selectedFramework, orgProfile, checklistResponses, docUploads]);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (fwLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Framework Selection (before wizard starts)
  // ---------------------------------------------------------------------------

  if (!selectedFramework) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-slate-500" onClick={() => router.push('/assessments')}>
          <ArrowLeft className="w-4 h-4" /> Back to Assessments
        </Button>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Select Framework</h1>
          <p className="text-sm text-slate-500 mt-1">Choose a capacity assessment framework to begin</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FRAMEWORK_OPTIONS.map((opt) => {
            const info = frameworks[opt.key] as FrameworkInfo | undefined;
            return (
              <Card
                key={opt.key}
                className="cursor-pointer hover:shadow-md hover:border-brand-300 transition-all"
                onClick={() => setSelectedFramework(opt.key)}
              >
                <CardContent className="py-6">
                  <h3 className="text-base font-semibold text-slate-900">{opt.label}</h3>
                  {info && (
                    <>
                      <p className="text-sm text-slate-500 mt-1">{info.description}</p>
                      <div className="flex gap-3 mt-3 text-xs text-slate-400">
                        <span>{info.estimated_time}</span>
                        <span>{info.total_items} items</span>
                      </div>
                    </>
                  )}
                  <Button variant="outline" size="sm" className="w-full mt-4 gap-1">
                    <Play className="w-3 h-3" /> Select
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Wizard
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back & Title */}
      <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-slate-500" onClick={() => router.push('/assessments')}>
        <ArrowLeft className="w-4 h-4" /> Back to Assessments
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Capacity Assessment</h1>
          <p className="text-sm text-slate-500 mt-1">
            Framework: {FRAMEWORK_OPTIONS.find((f) => f.key === selectedFramework)?.label}
          </p>
        </div>
        {currentStep < 4 && (
          <Button variant="outline" size="sm" onClick={() => setSelectedFramework('')}>
            Change Framework
          </Button>
        )}
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
        <OrgProfileStep profile={orgProfile} onChange={handleProfileChange} />
      )}
      {currentStep === 2 && (
        <ComplianceStep
          categories={checklistCategories}
          responses={checklistResponses}
          onChange={handleChecklistChange}
        />
      )}
      {currentStep === 3 && (
        <DocumentUploadStep uploads={docUploads} onChange={handleDocChange} />
      )}
      {currentStep === 4 && results && (
        <ResultsStep results={results} framework={selectedFramework} />
      )}

      {/* Navigation */}
      {currentStep < 4 && (
        <div className="flex justify-between pt-4 border-t border-slate-200">
          <Button
            variant="outline"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            className="gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Previous
          </Button>
          {currentStep < 3 ? (
            <Button
              className="gap-1 bg-brand-600 hover:bg-brand-700"
              onClick={() => setCurrentStep((s) => s + 1)}
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              className="gap-1 bg-brand-600 hover:bg-brand-700"
              disabled={submitting}
              onClick={handleSubmitAssessment}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4" /> Submit & Get Results
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {currentStep === 4 && (
        <div className="flex justify-center gap-3 pt-4 border-t border-slate-200">
          <Button variant="outline" onClick={() => router.push('/assessments')}>
            Back to Assessments
          </Button>
          <Button className="bg-brand-600 hover:bg-brand-700" onClick={() => router.push('/grants')}>
            Browse Grants
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Org Profile
// ---------------------------------------------------------------------------

function OrgProfileStep({
  profile,
  onChange,
}: {
  profile: OrgProfile;
  onChange: (field: keyof OrgProfile, value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4 text-brand-600" />
          Organization Profile
        </CardTitle>
        <p className="text-sm text-slate-500">Provide basic information about your organization</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={profile.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="Enter organization name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-country">Country</Label>
            <Input
              id="org-country"
              value={profile.country}
              onChange={(e) => onChange('country', e.target.value)}
              placeholder="e.g., Kenya"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-year">Year Established</Label>
            <Input
              id="org-year"
              type="number"
              value={profile.year_established}
              onChange={(e) => onChange('year_established', e.target.value)}
              placeholder="e.g., 2010"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-budget">Annual Budget (USD)</Label>
            <Input
              id="org-budget"
              value={profile.annual_budget}
              onChange={(e) => onChange('annual_budget', e.target.value)}
              placeholder="e.g., 500000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-staff">Staff Count</Label>
            <Input
              id="org-staff"
              value={profile.staff_count}
              onChange={(e) => onChange('staff_count', e.target.value)}
              placeholder="e.g., 50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-sectors">Sectors (comma-separated)</Label>
            <Input
              id="org-sectors"
              value={profile.sectors}
              onChange={(e) => onChange('sectors', e.target.value)}
              placeholder="e.g., Health, Education, WASH"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-mission">Mission Statement</Label>
          <Textarea
            id="org-mission"
            value={profile.mission}
            onChange={(e) => onChange('mission', e.target.value)}
            placeholder="Describe your organization's mission..."
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Compliance Checklist
// ---------------------------------------------------------------------------

function ComplianceStep({
  categories,
  responses,
  onChange,
}: {
  categories: { category: string; items: { key: string; label: string }[] }[];
  responses: Record<string, boolean>;
  onChange: (key: string, checked: boolean) => void;
}) {
  if (categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No checklist items for this framework</p>
        </CardContent>
      </Card>
    );
  }

  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const checkedItems = Object.values(responses).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {checkedItems} of {totalItems} items checked
        </p>
        <Badge variant="outline" className={checkedItems === totalItems ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}>
          {totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0}% Complete
        </Badge>
      </div>

      {categories.map((cat) => (
        <Card key={cat.category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              {cat.category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cat.items.map((item) => (
              <div key={item.key} className="flex items-center gap-3">
                <Checkbox
                  checked={responses[item.key] || false}
                  onCheckedChange={(val: boolean) => onChange(item.key, val)}
                />
                <Label className="text-sm text-slate-700 cursor-pointer font-normal">
                  {item.label}
                </Label>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Document Upload
// ---------------------------------------------------------------------------

function DocumentUploadStep({
  uploads,
  onChange,
}: {
  uploads: Record<string, DocFile>;
  onChange: (key: string, file: File | null) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="w-4 h-4 text-brand-600" />
          Supporting Documents
        </CardTitle>
        <p className="text-sm text-slate-500">Upload documents to support your assessment (optional but recommended)</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {DOC_TYPES.map((doc) => {
          const upload = uploads[doc.key];
          return (
            <div key={doc.key} className="p-4 border border-slate-200 rounded-lg">
              <div className="mb-2">
                <p className="text-sm font-medium text-slate-900">{doc.label}</p>
                <p className="text-xs text-slate-500">{doc.description}</p>
              </div>
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
                <label className="flex flex-col items-center gap-1 p-4 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-sm text-slate-500">Click to upload</span>
                  <Input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      onChange(doc.key, file);
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Results
// ---------------------------------------------------------------------------

function ResultsStep({
  results,
  framework,
}: {
  results: AssessmentResult;
  framework: string;
}) {
  const categoryEntries = Object.entries(results.category_scores);

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center">
            <ScoreRing score={Math.round(results.overall_score)} size={140} strokeWidth={10} label="Overall" />
            <h2 className="text-xl font-bold text-slate-900 mt-4">
              {results.overall_score >= 80
                ? 'Excellent Capacity'
                : results.overall_score >= 60
                ? 'Good Capacity'
                : results.overall_score >= 40
                ? 'Developing Capacity'
                : 'Needs Improvement'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {framework.toUpperCase().replace('_', '-')} Framework Assessment
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      {categoryEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryEntries.map(([category, score]) => (
              <div key={category}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">{category}</span>
                  <span className={`text-sm font-bold ${
                    score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600'
                  }`}>
                    {Math.round(score)}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, score)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Gaps */}
      {results.gaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Areas for Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {results.gaps.map((gap, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {gap}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
