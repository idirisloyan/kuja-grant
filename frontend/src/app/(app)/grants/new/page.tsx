'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, Info,
  FileText, DollarSign, ClipboardList, Upload, BarChart3, Send,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Basic Info', icon: FileText },
  { label: 'Eligibility', icon: ClipboardList },
  { label: 'Evaluation', icon: BarChart3 },
  { label: 'Documents', icon: Upload },
  { label: 'Reporting', icon: FileText },
  { label: 'Review', icon: Send },
];

const SECTOR_OPTIONS = [
  'Health', 'Education', 'WASH', 'Food Security', 'Livelihoods',
  'Protection', 'Shelter', 'Gender Equality', 'Climate', 'Governance',
];

const COUNTRY_OPTIONS = [
  'Kenya', 'Nigeria', 'South Africa', 'Uganda', 'Tanzania',
  'Somalia', 'Ethiopia', 'Sudan', 'Mozambique', 'DRC',
];

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'KES', 'NGN', 'ZAR'];

const ELIGIBILITY_CATEGORIES = [
  { key: 'geographic', label: 'Geographic Requirements' },
  { key: 'org_type', label: 'Organization Type' },
  { key: 'experience', label: 'Experience & Track Record' },
  { key: 'budget', label: 'Budget / Financial Capacity' },
  { key: 'sector', label: 'Sector Expertise' },
  { key: 'registration', label: 'Registration & Compliance' },
];

const DOC_TYPES = [
  { key: 'financial_report', label: 'Financial Report' },
  { key: 'registration', label: 'Registration Certificate' },
  { key: 'audit', label: 'Audit Report' },
  { key: 'PSEA', label: 'PSEA Policy' },
  { key: 'project_report', label: 'Project Report' },
  { key: 'budget', label: 'Budget Template' },
  { key: 'CV', label: 'Key Personnel CVs' },
  { key: 'strategic_plan', label: 'Strategic Plan' },
];

const FREQUENCY_OPTIONS = ['monthly', 'quarterly', 'semi-annual', 'annual'];
const REPORT_TYPE_OPTIONS = ['narrative', 'financial', 'monitoring', 'audit', 'compliance'];

// ---------------------------------------------------------------------------
// Form State Types
// ---------------------------------------------------------------------------

interface BasicInfo {
  title: string;
  description: string;
  total_funding: string;
  currency: string;
  deadline: string;
  sectors: string[];
  countries: string[];
}

interface EligibilityItem {
  key: string;
  label: string;
  enabled: boolean;
  details: string;
  weight: number;
}

interface CriterionItem {
  key: string;
  label: string;
  weight: number;
  description: string;
  instructions: string;
  example: string;
  max_words: number;
}

interface DocReqItem {
  key: string;
  label: string;
  required: boolean;
}

interface ReportReqItem {
  title: string;
  type: string;
  description: string;
  frequency: string;
  due_days: number;
}

// ---------------------------------------------------------------------------
// Step Progress Component
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const StepIcon = step.icon;
        const isActive = i === currentStep;
        const isComplete = i < currentStep;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isComplete
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isComplete ? <Check className="w-5 h-5" /> : <StepIcon className="w-4 h-4" />}
              </div>
              <span
                className={`text-xs mt-1.5 font-medium whitespace-nowrap ${
                  isActive ? 'text-brand-600' : isComplete ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-1 mt-[-18px] ${
                  i < currentStep ? 'bg-emerald-400' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-Select Toggle Component
// ---------------------------------------------------------------------------

function MultiSelectToggle({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt],
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Badge
          key={opt}
          variant="outline"
          className={`cursor-pointer px-3 py-1.5 text-sm transition-colors ${
            selected.includes(opt)
              ? 'bg-brand-50 text-brand-700 border-brand-300'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
          onClick={() => toggle(opt)}
        >
          {opt}
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function CreateGrantPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Basic Info
  const [basic, setBasic] = useState<BasicInfo>({
    title: '',
    description: '',
    total_funding: '',
    currency: 'USD',
    deadline: '',
    sectors: [],
    countries: [],
  });

  // Step 2: Eligibility
  const [eligibility, setEligibility] = useState<EligibilityItem[]>(
    ELIGIBILITY_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      enabled: false,
      details: '',
      weight: 10,
    })),
  );

  // Step 3: Criteria
  const [criteria, setCriteria] = useState<CriterionItem[]>([
    { key: 'criterion_1', label: '', weight: 100, description: '', instructions: '', example: '', max_words: 500 },
  ]);

  // Step 4: Document Requirements
  const [docReqs, setDocReqs] = useState<DocReqItem[]>(
    DOC_TYPES.map((d) => ({ key: d.key, label: d.label, required: false })),
  );

  // Step 5: Reporting
  const [reportingFrequency, setReportingFrequency] = useState('quarterly');
  const [reportReqs, setReportReqs] = useState<ReportReqItem[]>([]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const updateBasic = useCallback((field: keyof BasicInfo, value: string | string[]) => {
    setBasic((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleEligibility = (index: number) => {
    setEligibility((prev) =>
      prev.map((e, i) => (i === index ? { ...e, enabled: !e.enabled } : e)),
    );
  };

  const updateEligibility = (index: number, field: 'details' | 'weight', value: string | number) => {
    setEligibility((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    );
  };

  const addCriterion = () => {
    setCriteria((prev) => [
      ...prev,
      {
        key: `criterion_${prev.length + 1}`,
        label: '',
        weight: 0,
        description: '',
        instructions: '',
        example: '',
        max_words: 500,
      },
    ]);
  };

  const removeCriterion = (index: number) => {
    if (criteria.length <= 1) return;
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCriterion = (index: number, field: keyof CriterionItem, value: string | number) => {
    setCriteria((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
  };

  const toggleDocReq = (index: number) => {
    setDocReqs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, required: !d.required } : d)),
    );
  };

  const addReportReq = () => {
    setReportReqs((prev) => [
      ...prev,
      { title: '', type: 'narrative', description: '', frequency: 'quarterly', due_days: 30 },
    ]);
  };

  const removeReportReq = (index: number) => {
    setReportReqs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateReportReq = (index: number, field: keyof ReportReqItem, value: string | number) => {
    setReportReqs((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  };

  const criteriaWeightTotal = criteria.reduce((sum, c) => sum + c.weight, 0);

  // ---------------------------------------------------------------------------
  // Publish
  // ---------------------------------------------------------------------------

  const handlePublish = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        title: basic.title,
        description: basic.description,
        total_funding: basic.total_funding ? Number(basic.total_funding) : null,
        currency: basic.currency,
        deadline: basic.deadline || null,
        sectors: basic.sectors,
        countries: basic.countries,
        eligibility: eligibility
          .filter((e) => e.enabled)
          .map((e) => ({ key: e.key, label: e.label, details: e.details, weight: e.weight, required: true })),
        criteria: criteria
          .filter((c) => c.label.trim())
          .map((c, i) => ({
            key: `criterion_${i + 1}`,
            label: c.label,
            weight: c.weight,
            description: c.description,
            instructions: c.instructions,
            example: c.example,
            max_words: c.max_words,
          })),
        doc_requirements: docReqs
          .filter((d) => d.required)
          .map((d) => ({ key: d.key, label: d.label, required: true })),
        reporting_frequency: reportingFrequency,
        reporting_requirements: reportReqs.map((r) => ({
          title: r.title,
          type: r.type,
          description: r.description,
          frequency: r.frequency,
          due_days_after_period: r.due_days,
        })),
        status: 'open',
      };

      await api.post('/grants/', payload);
      router.push('/grants');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create grant');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render Steps
  // ---------------------------------------------------------------------------

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-5">
            <div>
              <Label htmlFor="title">Grant Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Community Health Resilience Program 2026"
                value={basic.title}
                onChange={(e) => updateBasic('title', e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the grant purpose, objectives, and target outcomes..."
                value={basic.description}
                onChange={(e) => updateBasic('description', e.target.value)}
                className="mt-1.5 min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="funding">Funding Amount</Label>
                <div className="relative mt-1.5">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="funding"
                    type="number"
                    placeholder="500000"
                    value={basic.total_funding}
                    onChange={(e) => updateBasic('total_funding', e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="currency">Currency</Label>
                <select
                  id="currency"
                  value={basic.currency}
                  onChange={(e) => updateBasic('currency', e.target.value)}
                  className="mt-1.5 w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="deadline">Application Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={basic.deadline}
                  onChange={(e) => updateBasic('deadline', e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label>Sectors</Label>
              <div className="mt-1.5">
                <MultiSelectToggle
                  options={SECTOR_OPTIONS}
                  selected={basic.sectors}
                  onChange={(val) => updateBasic('sectors', val)}
                />
              </div>
            </div>

            <div>
              <Label>Target Countries</Label>
              <div className="mt-1.5">
                <MultiSelectToggle
                  options={COUNTRY_OPTIONS}
                  selected={basic.countries}
                  onChange={(val) => updateBasic('countries', val)}
                />
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Toggle the eligibility categories you want applicants to meet. Add details and set relative weights.
            </p>
            {eligibility.map((item, i) => (
              <Card key={item.key} className={item.enabled ? 'border-brand-200 bg-brand-50/30' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={item.enabled}
                        onCheckedChange={() => toggleEligibility(i)}
                      />
                      <span className={`text-sm font-medium ${item.enabled ? 'text-slate-900' : 'text-slate-400'}`}>
                        {item.label}
                      </span>
                    </div>
                    {item.enabled && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Weight:</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={item.weight}
                          onChange={(e) => updateEligibility(i, 'weight', Number(e.target.value))}
                          className="w-24 h-2 accent-brand-600"
                        />
                        <span className="text-sm font-medium text-brand-600 w-10 text-right">
                          {item.weight}%
                        </span>
                      </div>
                    )}
                  </div>
                  {item.enabled && (
                    <div className="ml-12">
                      <Input
                        placeholder="Describe specific requirements..."
                        value={item.details}
                        onChange={(e) => updateEligibility(i, 'details', e.target.value)}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Define the criteria reviewers will use to evaluate applications.
              </p>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-medium ${
                    criteriaWeightTotal === 100
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  Total Weight: {criteriaWeightTotal}%
                  {criteriaWeightTotal !== 100 && ' (must equal 100%)'}
                </span>
                <Button variant="outline" size="sm" className="gap-1" onClick={addCriterion}>
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
            </div>

            {criteria.map((criterion, i) => (
              <Card key={i}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500">Criterion {i + 1}</span>
                    {criteria.length > 1 && (
                      <Button variant="ghost" size="sm" className="text-rose-500 h-7" onClick={() => removeCriterion(i)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-3">
                      <Label>Label *</Label>
                      <Input
                        placeholder="e.g., Technical Approach"
                        value={criterion.label}
                        onChange={(e) => updateCriterion(i, 'label', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Weight %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={criterion.weight}
                        onChange={(e) => updateCriterion(i, 'weight', Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Textarea
                      placeholder="What should applicants address..."
                      value={criterion.description}
                      onChange={(e) => updateCriterion(i, 'description', e.target.value)}
                      className="mt-1 min-h-[60px]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Instructions for Applicants</Label>
                      <Textarea
                        placeholder="Guidance on how to respond..."
                        value={criterion.instructions}
                        onChange={(e) => updateCriterion(i, 'instructions', e.target.value)}
                        className="mt-1 min-h-[60px]"
                      />
                    </div>
                    <div>
                      <Label>Example Response</Label>
                      <Textarea
                        placeholder="An example of a strong response..."
                        value={criterion.example}
                        onChange={(e) => updateCriterion(i, 'example', e.target.value)}
                        className="mt-1 min-h-[60px]"
                      />
                    </div>
                  </div>

                  <div className="w-32">
                    <Label>Max Words</Label>
                    <Input
                      type="number"
                      min={50}
                      max={5000}
                      value={criterion.max_words}
                      onChange={(e) => updateCriterion(i, 'max_words', Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Select which documents applicants must upload with their application.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {docReqs.map((doc, i) => (
                <Card
                  key={doc.key}
                  className={`cursor-pointer transition-colors ${
                    doc.required
                      ? 'border-brand-200 bg-brand-50/30'
                      : 'hover:border-slate-300'
                  }`}
                  onClick={() => toggleDocReq(i)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          doc.required
                            ? 'bg-brand-600 border-brand-600'
                            : 'border-slate-300'
                        }`}
                      >
                        {doc.required && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{doc.label}</p>
                        <p className="text-xs text-slate-500">{doc.key}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-5">
            <div>
              <Label htmlFor="freq">Reporting Frequency</Label>
              <select
                id="freq"
                value={reportingFrequency}
                onChange={(e) => setReportingFrequency(e.target.value)}
                className="mt-1.5 w-full max-w-xs h-9 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Reporting Requirements</Label>
              <Button variant="outline" size="sm" className="gap-1" onClick={addReportReq}>
                <Plus className="w-3 h-3" /> Add Requirement
              </Button>
            </div>

            {reportReqs.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No reporting requirements added yet.</p>
                  <p className="text-xs text-slate-400 mt-1">Click &quot;Add Requirement&quot; to define what grantees must report.</p>
                </CardContent>
              </Card>
            )}

            {reportReqs.map((req, i) => (
              <Card key={i}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500">Requirement {i + 1}</span>
                    <Button variant="ghost" size="sm" className="text-rose-500 h-7" onClick={() => removeReportReq(i)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Title *</Label>
                      <Input
                        placeholder="e.g., Quarterly Narrative Report"
                        value={req.title}
                        onChange={(e) => updateReportReq(i, 'title', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Type</Label>
                      <select
                        value={req.type}
                        onChange={(e) => updateReportReq(i, 'type', e.target.value)}
                        className="mt-1 w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {REPORT_TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Describe what the report should include..."
                      value={req.description}
                      onChange={(e) => updateReportReq(i, 'description', e.target.value)}
                      className="mt-1 min-h-[60px]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Frequency</Label>
                      <select
                        value={req.frequency}
                        onChange={(e) => updateReportReq(i, 'frequency', e.target.value)}
                        className="mt-1 w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {FREQUENCY_OPTIONS.map((f) => (
                          <option key={f} value={f}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Due Days After Period End</Label>
                      <Input
                        type="number"
                        min={1}
                        max={180}
                        value={req.due_days}
                        onChange={(e) => updateReportReq(i, 'due_days', Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-brand-600 mb-2">
              <Info className="w-4 h-4" />
              <span className="text-sm font-medium">Review your grant before publishing</span>
            </div>

            {/* Basic Info Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Title</span>
                  <span className="font-medium text-slate-900">{basic.title || '(not set)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Funding</span>
                  <span className="font-medium text-slate-900">
                    {basic.total_funding ? `${basic.currency} ${Number(basic.total_funding).toLocaleString()}` : '(not set)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Deadline</span>
                  <span className="font-medium text-slate-900">{basic.deadline || '(not set)'}</span>
                </div>
                {basic.sectors.length > 0 && (
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500">Sectors</span>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                      {basic.sectors.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {basic.countries.length > 0 && (
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500">Countries</span>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                      {basic.countries.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Eligibility Summary */}
            {eligibility.some((e) => e.enabled) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Eligibility Requirements</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {eligibility
                      .filter((e) => e.enabled)
                      .map((e) => (
                        <div key={e.key} className="flex justify-between text-sm">
                          <span className="text-slate-700">{e.label}</span>
                          <span className="text-slate-500">Weight: {e.weight}%</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Criteria Summary */}
            {criteria.some((c) => c.label.trim()) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Evaluation Criteria
                    <span className={`ml-2 text-sm font-normal ${criteriaWeightTotal === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      ({criteriaWeightTotal}%)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {criteria
                      .filter((c) => c.label.trim())
                      .map((c, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-slate-700">{c.label}</span>
                          <span className="text-slate-500">{c.weight}%</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Documents Summary */}
            {docReqs.some((d) => d.required) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Required Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {docReqs
                      .filter((d) => d.required)
                      .map((d) => (
                        <Badge key={d.key} variant="outline" className="text-xs">{d.label}</Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reporting Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Reporting</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-slate-600">
                  Frequency: <span className="font-medium">{reportingFrequency}</span>
                  {' | '}
                  Requirements: <span className="font-medium">{reportReqs.length}</span>
                </p>
              </CardContent>
            </Card>

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
                {error}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/grants')} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Create New Grant</h1>
          <p className="text-sm text-slate-500 mt-0.5">Step {step + 1} of {STEPS.length}: {STEPS[step].label}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Step Content */}
      <Card>
        <CardContent className="py-6">{renderStep()}</CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Previous
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="gap-1 bg-brand-600 hover:bg-brand-700"
          >
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handlePublish}
            disabled={submitting || !basic.title.trim()}
            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? 'Publishing...' : 'Publish Grant'}
            <Send className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
