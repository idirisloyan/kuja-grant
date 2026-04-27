'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAssessmentFrameworks } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';
import {
  ArrowLeft, ArrowRight, Building2, ClipboardList, Upload,
  BarChart3, Play, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssessmentFramework, FrameworkInfo } from '@/lib/types';

interface OrgProfile {
  name: string; country: string; year_established: string;
  annual_budget: string; staff_count: string; mission: string; sectors: string;
}

interface DocFile { file: File | null; fileName: string; }

interface AssessmentResult {
  overall_score: number;
  category_scores: Record<string, number>;
  gaps: string[];
}

const STEP_KEYS = [
  'assessment.step.org_profile',
  'assessment.step.compliance',
  'assessment.step.documents',
  'assessment.step.results',
] as const;

// Framework labels and descriptions are now i18n-keyed (framework.<key>.label
// and framework.<key>.description). The backend still ships English defaults
// for compatibility with API clients; the UI overrides with translations.
const FRAMEWORK_OPTIONS: { key: AssessmentFramework }[] = [
  { key: 'kuja' },
  { key: 'step' },
  { key: 'un_hact' },
  { key: 'chs' },
  { key: 'nupas' },
];

const DOC_TYPES = [
  { key: 'registration', label: 'Registration certificate', description: 'Official registration document from government' },
  { key: 'financial', label: 'Financial statements', description: 'Most recent audited financial statements' },
  { key: 'audit', label: 'Audit report', description: 'External audit report (last 2 years)' },
  { key: 'psea', label: 'PSEA policy', description: 'Protection from Sexual Exploitation and Abuse policy' },
  { key: 'strategic_plan', label: 'Strategic plan', description: 'Current organizational strategic plan' },
];

const inputCls =
  'w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]';

export default function AssessmentWizardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { data: fwData, isLoading: fwLoading } = useAssessmentFrameworks();
  const frameworks = useMemo(() => fwData?.frameworks ?? {}, [fwData]);

  const initialFramework = (searchParams.get('framework') as AssessmentFramework) || '';
  const [selectedFramework, setSelectedFramework] = useState<AssessmentFramework | ''>(initialFramework);
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [orgProfile, setOrgProfile] = useState<OrgProfile>({
    name: user?.org_name || '', country: '', year_established: '',
    annual_budget: '', staff_count: '', mission: '', sectors: '',
  });
  const [checklistResponses, setChecklistResponses] = useState<Record<string, boolean>>({});
  const [docUploads, setDocUploads] = useState<Record<string, DocFile>>({});
  const [results, setResults] = useState<AssessmentResult | null>(null);

  const frameworkInfo: FrameworkInfo | null = useMemo(() => {
    if (!selectedFramework || !frameworks[selectedFramework]) return null;
    return frameworks[selectedFramework] as FrameworkInfo;
  }, [selectedFramework, frameworks]);

  const checklistCategories = useMemo(() => {
    if (!frameworkInfo) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catItems = (frameworkInfo as any).category_items as
      Record<string, { weight: number; label: string; items: { key: string; label: string }[] }> | undefined;
    if (catItems) {
      return Object.entries(catItems).map(([, catData]) => ({
        category: catData.label,
        items: catData.items.map((item) => ({
          key: item.key,
          label: item.label.replace(/ Hact| Nupas| Chs| Psea/gi, (m) => m.toUpperCase()),
        })),
      }));
    }
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

  const handleProfileChange = useCallback((field: keyof OrgProfile, value: string) => {
    setOrgProfile((prev) => ({ ...prev, [field]: value }));
  }, []);
  const handleChecklistChange = useCallback((key: string, checked: boolean) => {
    setChecklistResponses((prev) => ({ ...prev, [key]: checked }));
  }, []);
  const handleDocChange = useCallback((key: string, file: File | null) => {
    setDocUploads((prev) => ({ ...prev, [key]: { file, fileName: file?.name ?? '' } }));
  }, []);

  const handleSubmitAssessment = useCallback(async () => {
    if (!selectedFramework) return;
    setSubmitting(true);
    try {
      const res = await api.post<{
        success: boolean;
        assessment: {
          id: number;
          overall_score: number;
          category_scores: Record<string, { score: number; met: number; total: number; weight: number }>;
          gaps: Array<{ category: string; item: string; label: string; priority: string }>;
        };
      }>('/assessments/', {
        framework: selectedFramework,
        org_profile: orgProfile,
        checklist_responses: checklistResponses,
      });

      const assessmentId = res.assessment?.id;
      const docTypeMap: Record<string, string> = {
        registration: 'registration_certificate', financial: 'financial_report',
        audit: 'audit_report', psea: 'policy_document', strategic_plan: 'policy_document',
      };
      if (assessmentId) {
        for (const [docType, upload] of Object.entries(docUploads)) {
          if (upload.file) {
            const formData = new FormData();
            formData.append('file', upload.file);
            formData.append('doc_type', docTypeMap[docType] || 'general');
            formData.append('assessment_id', String(assessmentId));
            await api.upload('/documents/upload', formData);
          }
        }
      }

      const catScores: Record<string, number> = {};
      for (const [k, v] of Object.entries(res.assessment?.category_scores ?? {})) {
        catScores[k] = typeof v === 'number' ? v : v.score;
      }
      setResults({
        overall_score: res.assessment?.overall_score ?? 0,
        category_scores: catScores,
        gaps: (res.assessment?.gaps ?? []).map((g) => typeof g === 'string' ? g : g.label),
      });
      setCurrentStep(4);
    } catch { /* noop */ } finally { setSubmitting(false); }
  }, [selectedFramework, orgProfile, checklistResponses, docUploads]);

  if (fwLoading) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-8 w-48 rounded" />
        <div className="kuja-shimmer h-64 rounded-xl" />
      </div>
    );
  }

  // Framework selection
  if (!selectedFramework) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => router.push('/assessments')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t('assessment.back_to_assessments')}
        </button>
        <div>
          <h1 className="kuja-display text-3xl">{t('assessment.select_framework_title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('assessment.select_framework_subtitle')}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FRAMEWORK_OPTIONS.map((opt) => {
            const info = frameworks[opt.key] as FrameworkInfo | undefined;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelectedFramework(opt.key)}
                className="text-left rounded-xl border border-border bg-background p-5 hover:border-[hsl(var(--kuja-clay))] hover:shadow-md transition-all"
              >
                <div className="text-sm font-semibold">{t(`framework.${opt.key}.label`)}</div>
                {info && (
                  <>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t(`framework.${opt.key}.description`)}</p>
                    <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                      <span>{info.estimated_time}</span>
                      <span>{t('framework.items_count', { n: info.total_items })}</span>
                    </div>
                  </>
                )}
                <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--kuja-clay))]">
                  <Play className="h-3.5 w-3.5" /> {t('framework.select_cta')}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push('/assessments')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to assessments
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="kuja-display text-3xl">{t('assessment.wizard_title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedFramework ? t(`framework.${selectedFramework}.label`) : ''}
          </p>
        </div>
        {currentStep < 4 && (
          <button
            type="button"
            onClick={() => setSelectedFramework('')}
            className="inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] text-sm font-medium px-3 py-1.5"
          >
            {t('assessment.change_framework')}
          </button>
        )}
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEP_KEYS.map((stepKey, i) => {
          const n = i + 1;
          const done = currentStep > n;
          const active = currentStep === n;
          return (
            <div key={stepKey} className="flex items-center gap-2 whitespace-nowrap">
              <div className={cn(
                'w-7 h-7 rounded-full grid place-items-center text-xs font-semibold',
                done ? 'bg-[hsl(var(--kuja-grow))] text-white'
                  : active ? 'bg-[hsl(var(--kuja-clay))] text-white'
                  : 'bg-muted text-muted-foreground',
              )}>
                {done ? <CheckCircle className="h-4 w-4" /> : n}
              </div>
              <span className={cn('text-sm', active ? 'font-semibold' : 'text-muted-foreground')}>
                {t(stepKey)}
              </span>
              {n < STEP_KEYS.length && <div className="w-6 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      {currentStep === 1 && <OrgProfileStep profile={orgProfile} onChange={handleProfileChange} t={t} />}
      {currentStep === 2 && (
        <ComplianceStep
          categories={checklistCategories}
          responses={checklistResponses}
          onChange={handleChecklistChange}
          t={t}
        />
      )}
      {currentStep === 3 && <DocumentUploadStep uploads={docUploads} onChange={handleDocChange} t={t} />}
      {currentStep === 4 && results && <ResultsStep results={results} framework={selectedFramework} t={t} />}

      {/* Navigation */}
      {currentStep < 4 && (
        <div className="flex justify-between pt-3 border-t border-border">
          <button
            type="button"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] text-sm font-medium px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4" /> {t('common.previous')}
          </button>
          {currentStep < 3 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((s) => s + 1)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2"
            >
              {t('common.next')} <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitAssessment}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              {submitting ? 'Analyzing…' : t('assessment.submit_get_results')}
            </button>
          )}
        </div>
      )}

      {currentStep === 4 && (
        <div className="flex justify-center gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/assessments')}
            className="rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] text-sm font-medium px-4 py-2"
          >
            Back to assessments
          </button>
          <button
            type="button"
            onClick={() => router.push('/grants')}
            className="rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2"
          >
            Browse grants
          </button>
        </div>
      )}
    </div>
  );
}

function OrgProfileStep({
  profile, onChange, t,
}: { profile: OrgProfile; onChange: (field: keyof OrgProfile, value: string) => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{t('assessment.org_profile')}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t('assessment.org_profile_subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Organization name">
          <input type="text" value={profile.name} onChange={(e) => onChange('name', e.target.value)}
            placeholder="Enter organization name" className={inputCls} />
        </Field>
        <Field label="Country">
          <input type="text" value={profile.country} onChange={(e) => onChange('country', e.target.value)}
            placeholder="e.g., Kenya" className={inputCls} />
        </Field>
        <Field label="Year established">
          <input type="number" value={profile.year_established} onChange={(e) => onChange('year_established', e.target.value)}
            placeholder="e.g., 2010" className={inputCls} />
        </Field>
        <Field label="Annual budget (USD)">
          <input type="text" value={profile.annual_budget} onChange={(e) => onChange('annual_budget', e.target.value)}
            placeholder="e.g., 500000" className={inputCls} />
        </Field>
        <Field label="Staff count">
          <input type="text" value={profile.staff_count} onChange={(e) => onChange('staff_count', e.target.value)}
            placeholder="e.g., 50" className={inputCls} />
        </Field>
        <Field label="Sectors (comma-separated)">
          <input type="text" value={profile.sectors} onChange={(e) => onChange('sectors', e.target.value)}
            placeholder="e.g., Health, Education, WASH" className={inputCls} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Mission statement">
          <textarea value={profile.mission} onChange={(e) => onChange('mission', e.target.value)}
            rows={3} placeholder="Describe your organization's mission…"
            className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]" />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}

function ComplianceStep({
  categories, responses, onChange, t,
}: {
  categories: { category: string; items: { key: string; label: string }[] }[];
  responses: Record<string, boolean>;
  onChange: (key: string, checked: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background px-6 py-12 text-center">
        <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">{t('assessment.no_checklist_items')}</p>
      </div>
    );
  }

  const total = categories.reduce((s, c) => s + c.items.length, 0);
  const checked = Object.values(responses).filter(Boolean).length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{checked} of {total} items checked</p>
        <span className={cn(
          'kuja-severity',
          checked === total ? 'kuja-severity-good' : 'kuja-severity-info',
        )}>
          {pct}% complete
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded overflow-hidden">
        <div className="h-full bg-[hsl(var(--kuja-clay))] transition-all" style={{ width: `${pct}%` }} />
      </div>

      {categories.map((cat) => (
        <div key={cat.category} className="rounded-xl border border-border bg-background p-5">
          <div className="kuja-label text-[11px] mb-2">{cat.category}</div>
          <div className="space-y-1.5">
            {cat.items.map((item) => (
              <label key={item.key} className="flex items-start gap-2.5 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={responses[item.key] || false}
                  onChange={(e) => onChange(item.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--kuja-clay))]"
                />
                <span className="text-sm text-muted-foreground">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentUploadStep({
  uploads, onChange, t,
}: { uploads: Record<string, DocFile>; onChange: (key: string, file: File | null) => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center gap-2 mb-1">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{t('assessment.supporting_documents')}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {t('assessment.supporting_subtitle')}
      </p>
      <div className="space-y-3">
        {DOC_TYPES.map((doc) => {
          const upload = uploads[doc.key];
          return (
            <div key={doc.key} className="border border-border rounded-lg p-4">
              <div className="mb-2">
                <div className="text-sm font-medium">{t(`doc_type.${doc.key}.label`)}</div>
                <div className="text-xs text-muted-foreground">{t(`doc_type.${doc.key}.description`)}</div>
              </div>
              {upload?.file ? (
                <div className="flex items-center gap-3 p-3 bg-[hsl(142_68%_96%)] border border-[hsl(142_55%_85%)] rounded-md">
                  <CheckCircle className="h-5 w-5 text-[hsl(var(--kuja-grow))] flex-shrink-0" />
                  <span className="flex-1 truncate text-sm text-[hsl(var(--kuja-grow))]">{upload.fileName}</span>
                  <button
                    type="button"
                    onClick={() => onChange(doc.key, null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('apply.remove')}
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-1 p-5 border-2 border-dashed border-border rounded-md cursor-pointer hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand-50))] transition-all">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('apply.click_to_upload')}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => onChange(doc.key, e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultsStep({ results, framework, t }: { results: AssessmentResult; framework: string; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const categoryEntries = Object.entries(results.category_scores);
  // Tier the score into a coaching headline + subhead + "what this unlocks"
  // string so the result feels like a guided conversation, not a verdict.
  const tier = results.overall_score >= 80 ? 'excellent'
    : results.overall_score >= 60 ? 'good'
    : results.overall_score >= 40 ? 'developing'
    : 'starting';
  const headline = t(`assessment.results.headline_${tier}`);
  const subhead = t(`assessment.results.subhead_${tier}`);
  const unlocks = t(`assessment.results.unlocks_${tier}`);
  const tierTone = tier === 'excellent' ? 'success' : tier === 'good' ? 'success' : tier === 'developing' ? 'warn' : 'warn';
  const tierBadgeCls = tierTone === 'success'
    ? 'bg-[hsl(var(--kuja-grow)/0.1)] text-[hsl(var(--kuja-grow))] border-[hsl(var(--kuja-grow)/0.2)]'
    : 'bg-[hsl(var(--kuja-sun)/0.1)] text-[hsl(var(--kuja-sun))] border-[hsl(var(--kuja-sun)/0.3)]';

  return (
    <div className="space-y-4">
      {/* Hero verdict with coaching headline + framework tag */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-background to-[hsl(var(--kuja-sand-50))] p-8 sm:p-10">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <ScoreRing score={Math.round(results.overall_score)} size={140} strokeWidth={10} label={t('assessment.overall')} />
          <div className="flex-1 text-center sm:text-left">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tierBadgeCls}`}>
              {framework.toUpperCase().replace('_', '-')}
            </span>
            <h2 className="kuja-display text-2xl sm:text-3xl mt-2 leading-tight text-balance">{headline}</h2>
            <p className="mt-2 text-sm text-[hsl(var(--kuja-ink-soft))] leading-relaxed">{subhead}</p>
          </div>
        </div>
        {/* What your current capacity unlocks */}
        <div className="mt-6 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/50 p-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--kuja-spark))] mb-1">
            {t('assessment.results.what_unlocks')}
          </div>
          <div className="text-sm text-foreground">{unlocks}</div>
        </div>
      </div>

      {categoryEntries.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="text-sm font-semibold mb-3">{t('assessment.category_breakdown')}</div>
          <div className="space-y-3">
            {categoryEntries.map(([category, score]) => {
              const color = score >= 80 ? 'hsl(var(--kuja-grow))' : score >= 60 ? 'hsl(var(--kuja-sun))' : 'hsl(var(--kuja-flag))';
              return (
                <div key={category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">{category}</span>
                    <span className="kuja-numeric font-semibold" style={{ color }}>{Math.round(score)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div className="h-full transition-all" style={{ width: `${Math.min(100, score)}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {results.gaps.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-[hsl(var(--kuja-sun))]" />
            <span className="text-sm font-semibold">{t('assessment.areas_for_improvement')}</span>
          </div>
          <ul className="space-y-2">
            {results.gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[hsl(32_100%_95%)] text-[hsl(var(--kuja-sun))] grid place-items-center text-[11px] font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-muted-foreground">{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concrete next-step actions — wired so the user can leave the
          results screen with a clear thing to do, not just a number. */}
      <div className="rounded-xl border border-border bg-background p-5">
        <div className="text-sm font-semibold mb-3">{t('assessment.results.next_steps')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <a
            href="/grants"
            className="inline-flex items-center justify-between gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-xs font-medium px-3 py-2"
          >
            <span>{t('assessment.results.action_browse_grants')}</span>
            <span aria-hidden>→</span>
          </a>
          <a
            href="/organizations/profile"
            className="inline-flex items-center justify-between gap-1.5 rounded-md border border-border hover:bg-muted text-xs font-medium px-3 py-2"
          >
            <span>{t('assessment.results.action_strengthen_profile')}</span>
            <span aria-hidden>→</span>
          </a>
          <a
            href="/assessments/wizard"
            className="inline-flex items-center justify-between gap-1.5 rounded-md border border-border hover:bg-muted text-xs font-medium px-3 py-2"
          >
            <span>{t('assessment.results.action_retake')}</span>
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
