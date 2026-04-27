'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fetchGrantScaffold } from '@/lib/copilot-api';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/hooks/use-translation';
import { AiBadge } from '@/components/shared/ai-badge';
import { GrantBriefPrompt } from '@/components/grants/GrantBriefPrompt';
import type { GeneratedGrantBrief } from '@/lib/copilot-api';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Info,
  FileText,
  DollarSign,
  ClipboardList,
  Upload,
  BarChart3,
  Send,
  Sparkles,
  CheckCircle2,
  CloudUpload,
  X,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Step labels live in i18n; we resolve them at render time so the donor
// wizard tracks the user's language. Icons stay in this constant since
// they don't translate.
const STEPS = [
  { labelKey: 'grant.wizard.step.upload_document', icon: CloudUpload },
  { labelKey: 'grant.wizard.step.basic_info', icon: FileText },
  { labelKey: 'grant.wizard.step.eligibility', icon: ClipboardList },
  { labelKey: 'grant.wizard.step.evaluation', icon: BarChart3 },
  { labelKey: 'grant.wizard.step.documents', icon: Upload },
  { labelKey: 'grant.wizard.step.review_publish', icon: Send },
];

// Sectors and countries: the underlying VALUE stays in English so the DB
// remains the canonical source for filtering, search, and cross-portal joins;
// the LABEL is resolved to the user's language at render time. labelKey maps
// to i18n keys defined in src/i18n/*.json.
const SECTOR_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: 'Health', labelKey: 'sector.health' },
  { value: 'Education', labelKey: 'sector.education' },
  { value: 'WASH', labelKey: 'sector.wash' },
  { value: 'Climate', labelKey: 'sector.climate' },
  { value: 'Protection', labelKey: 'sector.protection' },
  { value: 'Nutrition', labelKey: 'sector.nutrition' },
  { value: 'Livelihoods', labelKey: 'sector.livelihoods' },
  { value: 'Governance', labelKey: 'sector.governance' },
  { value: 'Agriculture', labelKey: 'sector.agriculture' },
  { value: 'Gender Equality', labelKey: 'sector.gender_equality' },
];

const COUNTRY_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: 'Kenya', labelKey: 'country.kenya' },
  { value: 'Somalia', labelKey: 'country.somalia' },
  { value: 'Ethiopia', labelKey: 'country.ethiopia' },
  { value: 'Uganda', labelKey: 'country.uganda' },
  { value: 'Tanzania', labelKey: 'country.tanzania' },
  { value: 'South Sudan', labelKey: 'country.south_sudan' },
  { value: 'Nigeria', labelKey: 'country.nigeria' },
  { value: 'South Africa', labelKey: 'country.south_africa' },
];

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'KES', 'CHF'];

const ELIGIBILITY_CATEGORIES: Array<{ key: string; labelKey: string }> = [
  { key: 'geographic', labelKey: 'eligibility.geographic' },
  { key: 'org_type', labelKey: 'eligibility.org_type' },
  { key: 'experience', labelKey: 'eligibility.experience' },
  { key: 'budget', labelKey: 'eligibility.budget' },
  { key: 'sector', labelKey: 'eligibility.sector' },
  { key: 'registration', labelKey: 'eligibility.registration' },
];

const DOC_TYPES: Array<{ key: string; labelKey: string; icon: string }> = [
  { key: 'financial_report', labelKey: 'doctype.financial_report', icon: '📊' },
  { key: 'registration', labelKey: 'doctype.registration', icon: '📋' },
  { key: 'audit', labelKey: 'doctype.audit', icon: '🔍' },
  { key: 'PSEA', labelKey: 'doctype.PSEA', icon: '🛡' },
  { key: 'project_report', labelKey: 'doctype.project_report', icon: '📄' },
  { key: 'budget', labelKey: 'doctype.budget', icon: '💰' },
  { key: 'CV', labelKey: 'doctype.CV', icon: '👤' },
  { key: 'strategic_plan', labelKey: 'doctype.strategic_plan', icon: '🗺' },
];

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.txt';

// ---------------------------------------------------------------------------
// Types
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
  // label is the rendered string (used when AI returns a custom requirement
  // or when the user adds one). For built-in categories we prefer labelKey
  // so the label re-localizes when the user switches language.
  label: string;
  labelKey?: string;
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
  max_words: number;
}

interface DocReqItem {
  key: string;
  // Same pattern as EligibilityItem: keep both. labelKey is preferred for
  // built-in doc types; label is used as a custom override / fallback.
  label: string;
  labelKey?: string;
  icon: string;
  enabled: boolean;
  specific_requirements: string;
  required: boolean;
}

interface ExtractedData {
  requirements?: Array<{ title?: string; type?: string; description?: string; frequency?: string }>;
  template_sections?: Array<{ name?: string; description?: string }>;
  indicators?: Array<{ name?: string; description?: string; target?: string }>;
}

interface GrantCreateResponse {
  success: boolean;
  grant: { id: number; title?: string; description?: string };
}

interface UploadResponse {
  success: boolean;
  grant_document?: string;
  original_filename?: string;
  extracted_requirements?: ExtractedData;
  requirements_saved?: boolean;
  content_extracted?: boolean;
  auto_saved?: boolean;
}

interface AIChatResponse {
  response: string;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const INPUT_CLS =
  'w-full h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] placeholder:text-muted-foreground';
const TA_CLS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] placeholder:text-muted-foreground';

function Card({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[10px] border border-border bg-card shadow-[var(--kuja-elev-1)] ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Alert({
  tone,
  icon,
  children,
}: {
  tone: 'success' | 'warning' | 'error' | 'info';
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const palette: Record<typeof tone, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-[hsl(var(--kuja-spark-soft))] border-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-spark))]',
  };
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${palette[tone]}`}>
      {icon && <span className="flex-shrink-0 pt-0.5">{icon}</span>}
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-Select Toggle
// ---------------------------------------------------------------------------

// Toggle accepts options as either plain strings (legacy) or {value, labelKey}
// pairs, so the same component renders both currency-style English-only lists
// and localized taxonomy lists (sectors, countries). The selected state always
// stores the canonical English value so DB writes remain language-agnostic.
function MultiSelectToggle({
  options,
  selected,
  onChange,
}: {
  options: Array<string | { value: string; labelKey: string }>;
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const { t } = useTranslation();
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((raw) => {
        const value = typeof raw === 'string' ? raw : raw.value;
        const label = typeof raw === 'string' ? raw : t(raw.labelKey);
        const isActive = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
              isActive
                ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))] text-white'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CreateGrantPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Localize a stored sector/country value (English DB value) → user's lang.
  // Falls back to the value itself if there's no key (covers AI-suggested
  // taxonomies that aren't in the canonical list).
  const localizeSector = (s: string) => {
    const opt = SECTOR_OPTIONS.find((o) => o.value === s);
    return opt ? t(opt.labelKey) : s;
  };
  const localizeCountry = (c: string) => {
    const opt = COUNTRY_OPTIONS.find((o) => o.value === c);
    return opt ? t(opt.labelKey) : c;
  };

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [grantId, setGrantId] = useState<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [uploadError, setUploadError] = useState('');

  const [suggestingCriteria, setSuggestingCriteria] = useState(false);

  const [basic, setBasic] = useState<BasicInfo>({
    title: '',
    description: '',
    total_funding: '',
    currency: 'USD',
    deadline: '',
    sectors: [],
    countries: [],
  });

  // English fallback labels — used when sending to the API (so the DB stays
  // language-agnostic) and as the empty-state hint. Display is driven by
  // labelKey when present.
  const ELIGIBILITY_FALLBACKS: Record<string, string> = {
    geographic: 'Geographic Requirements',
    org_type: 'Organization Type',
    experience: 'Experience & Track Record',
    budget: 'Budget / Financial Capacity',
    sector: 'Sector Expertise',
    registration: 'Registration & Compliance',
  };
  const DOC_FALLBACKS: Record<string, string> = {
    financial_report: 'Financial Report',
    registration: 'Registration Certificate',
    audit: 'Audit Report',
    PSEA: 'PSEA Policy',
    project_report: 'Project Reports',
    budget: 'Detailed Budget',
    CV: 'Staff CVs',
    strategic_plan: 'Strategic Plan',
  };

  const [eligibility, setEligibility] = useState<EligibilityItem[]>(
    ELIGIBILITY_CATEGORIES.map((c) => ({
      key: c.key,
      label: ELIGIBILITY_FALLBACKS[c.key] || '',
      labelKey: c.labelKey,
      enabled: false,
      details: '',
      weight: 10,
    })),
  );

  const [criteria, setCriteria] = useState<CriterionItem[]>([
    { key: 'criterion_1', label: '', weight: 100, description: '', instructions: '', max_words: 500 },
  ]);

  const [docReqs, setDocReqs] = useState<DocReqItem[]>(
    DOC_TYPES.map((d) => ({
      key: d.key,
      label: DOC_FALLBACKS[d.key] || '',
      labelKey: d.labelKey,
      icon: d.icon,
      enabled: false,
      specific_requirements: '',
      required: true,
    })),
  );

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError('');
    setUploadedFileName(file.name);
    try {
      let id = grantId;
      if (!id) {
        const grantTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        const res = await api.post<GrantCreateResponse>('/grants/', { title: grantTitle });
        if (res.success) {
          id = res.grant.id;
          setGrantId(id);
        } else {
          throw new Error('Failed to create draft grant');
        }
      }
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch(`/api/grants/${id}/upload-grant-doc`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error((errData as { error?: string }).error || `HTTP ${uploadRes.status}`);
      }
      const data = (await uploadRes.json()) as UploadResponse;
      if (data.success) {
        const extractedData = data.extracted_requirements || null;
        setExtracted(extractedData);
        const draftTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        setBasic((prev) => ({ ...prev, title: prev.title || draftTitle }));
        if (extractedData?.requirements && extractedData.requirements.length > 0) {
          setEligibility((prev) =>
            prev.map((e) => {
              const match = extractedData.requirements?.find(
                (r) => r.type?.toLowerCase().includes(e.key) || r.title?.toLowerCase().includes(e.key),
              );
              if (match) return { ...e, enabled: true, details: match.description || match.title || '' };
              return e;
            }),
          );
        }
        const reqCount = extractedData?.requirements?.length || 0;
        const indCount = extractedData?.indicators?.length || 0;
        toast.success(
          t('toast.ai_extracted_reqs_indicators', { req_count: reqCount, ind_count: indCount }),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [grantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [grantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoSave = async () => {
    if (!grantId) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (basic.title) payload.title = basic.title;
      if (basic.description) payload.description = basic.description;
      if (basic.total_funding) payload.total_funding = Number(basic.total_funding);
      if (basic.currency) payload.currency = basic.currency;
      if (basic.deadline) payload.deadline = basic.deadline;
      if (basic.sectors.length > 0) payload.sectors = basic.sectors;
      if (basic.countries.length > 0) payload.countries = basic.countries;
      payload.eligibility = eligibility
        .filter((e) => e.enabled)
        .map((e) => ({ key: e.key, label: e.label, details: e.details, weight: e.weight, required: true }));
      payload.criteria = criteria
        .filter((c) => c.label.trim())
        .map((c, i) => ({
          key: `criterion_${i + 1}`,
          label: c.label,
          weight: c.weight,
          description: c.description,
          instructions: c.instructions,
          max_words: c.max_words,
        }));
      payload.doc_requirements = docReqs
        .filter((d) => d.enabled)
        .map((d) => ({
          key: d.key,
          label: d.label,
          required: d.required,
          specific_requirements: d.specific_requirements,
        }));
      await api.put(`/grants/${grantId}`, payload);
    } catch {
      /* best-effort */
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    if (step === 0 && !grantId) {
      try {
        const draftTitle = basic.title || 'Draft Grant';
        const res = await api.post<GrantCreateResponse>('/grants/', { title: draftTitle });
        if (res.success) {
          setGrantId(res.grant.id);
          if (!basic.title) setBasic((prev) => ({ ...prev, title: draftTitle }));
        }
      } catch {
        toast.error(t('toast.grant_draft_create_failed'));
        return;
      }
    }
    if (grantId && step > 0) await autoSave();
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const updateBasic = useCallback((field: keyof BasicInfo, value: string | string[]) => {
    setBasic((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleEligibility = (index: number) => {
    setEligibility((prev) => prev.map((e, i) => (i === index ? { ...e, enabled: !e.enabled } : e)));
  };
  const updateEligibility = (index: number, field: 'details' | 'weight', value: string | number) => {
    setEligibility((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
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
        max_words: 500,
      },
    ]);
  };
  const removeCriterion = (index: number) => {
    if (criteria.length <= 1) return;
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };
  const updateCriterion = (index: number, field: keyof CriterionItem, value: string | number) => {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };
  const toggleDocReq = (index: number) => {
    setDocReqs((prev) => prev.map((d, i) => (i === index ? { ...d, enabled: !d.enabled } : d)));
  };
  const updateDocReq = (index: number, field: 'specific_requirements' | 'required', value: string | boolean) => {
    setDocReqs((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  };

  const criteriaWeightTotal = criteria.reduce((sum, c) => sum + c.weight, 0);

  // Replaces the prior chat-API + JSON-regex hack with the proper
  // structured /api/ai/donor-grant-copilot endpoint via fetchGrantScaffold.
  // Populates evaluation criteria AND eligibility in one call so the donor
  // gets a coherent grant scaffold rather than just five rubric rows.
  const [aiGuidance, setAiGuidance] = useState<string | null>(null);
  const [aiExclusions, setAiExclusions] = useState<string[]>([]);
  const [aiBurden, setAiBurden] = useState<{ score?: 'low' | 'medium' | 'high'; drivers?: string[]; simplifications?: string[] } | null>(null);

  /**
   * Phase 2.2 — apply an AI-generated grant brief into the wizard state.
   * Donor types a 1-2 line prompt; AI returns a complete scaffold; we fill
   * every wizard field at once and jump to Step 1 so the donor can review.
   * Existing eligibility categories with matching keys are preserved (we
   * just enable them and copy the AI's details); custom eligibility from
   * the AI is appended. Same for doc requirements.
   */
  const applyGrantBrief = useCallback((brief: GeneratedGrantBrief) => {
    // Title + description.
    setBasic((prev) => {
      const next = { ...prev };
      if (brief.title) next.title = brief.title;
      if (brief.description) next.description = brief.description;
      // Recommended deadline → today + N days, formatted YYYY-MM-DD.
      if (brief.recommended_deadline_days && brief.recommended_deadline_days > 0) {
        const d = new Date();
        d.setDate(d.getDate() + brief.recommended_deadline_days);
        next.deadline = d.toISOString().slice(0, 10);
      }
      return next;
    });

    // Criteria — replace entirely. The AI gives keys; preserve them.
    if (brief.criteria && brief.criteria.length > 0) {
      setCriteria(
        brief.criteria.map((c, i) => ({
          key: c.key || `criterion_${i + 1}`,
          label: c.label || '',
          weight: typeof c.weight === 'number' ? c.weight : 20,
          description: c.description || '',
          instructions: c.instructions || '',
          max_words: c.max_words || 500,
        })),
      );
    }

    // Eligibility — merge by key onto existing categories where possible,
    // append custom ones. Matching by key (geographic, org_type, etc.)
    // preserves the wizard's structured taxonomy.
    if (brief.eligibility && brief.eligibility.length > 0) {
      setEligibility((prev) => {
        const next = [...prev];
        const existingKeys = new Set(next.map((e) => e.key));
        for (const e of brief.eligibility) {
          if (existingKeys.has(e.key)) {
            const idx = next.findIndex((x) => x.key === e.key);
            next[idx] = {
              ...next[idx],
              enabled: true,
              details: e.details || next[idx].details,
              weight: typeof e.weight === 'number' ? e.weight : next[idx].weight,
            };
          } else {
            next.push({
              key: e.key || `custom_${Date.now()}`,
              label: e.label || 'Custom requirement',
              enabled: true,
              details: e.details || '',
              weight: typeof e.weight === 'number' ? e.weight : 10,
            });
          }
        }
        return next;
      });
    }

    // Doc requirements — same merge pattern.
    if (brief.doc_requirements && brief.doc_requirements.length > 0) {
      setDocReqs((prev) => {
        const next = [...prev];
        const byKey = new Map(next.map((d, i) => [d.key, i]));
        for (const d of brief.doc_requirements) {
          const idx = byKey.get(d.key);
          if (idx != null) {
            next[idx] = {
              ...next[idx],
              enabled: true,
              required: d.required ?? next[idx].required,
              specific_requirements: d.specific_requirements || next[idx].specific_requirements,
            };
          } else {
            next.push({
              key: d.key || `custom_${Date.now()}`,
              label: d.label || 'Custom document',
              labelKey: undefined,
              icon: d.icon || '📄',
              enabled: true,
              required: d.required ?? true,
              specific_requirements: d.specific_requirements || '',
            });
          }
        }
        return next;
      });
    }

    // Burden card — surfaces in Step 3 (evaluation).
    if (brief.burden) {
      setAiBurden({
        score: brief.burden.score,
        drivers: brief.burden.drivers || [],
        simplifications: brief.burden.simplifications || [],
      });
    }

    // Rationale → guidance banner so the donor sees AI's reasoning.
    if (brief.rationale) {
      setAiGuidance(brief.rationale);
    }

    // Jump to Step 1 (Basic Info) so the donor sees what AI filled in.
    setStep(1);
  }, []);

  const handleSuggestCriteria = async () => {
    setSuggestingCriteria(true);
    try {
      const sectors = basic.sectors.length > 0 ? basic.sectors.join(', ') : '';
      const countries = basic.countries.length > 0 ? basic.countries.join(', ') : '';
      const goal = basic.title || 'humanitarian grant call';
      const budget = basic.total_funding ? Number(basic.total_funding) : null;

      const res = await fetchGrantScaffold({
        goal,
        thematic: sectors || undefined,
        geography: countries || undefined,
        budget_usd: budget,
        draft: {
          description: basic.description || undefined,
          deadline: basic.deadline || undefined,
        },
      });

      if (!res.ok) {
        toast.error(res.message || t('toast.ai_scaffold_unavailable'));
        return;
      }

      const { scoring_rubric, eligibility: aiEligibility, exclusions, guidance, burden } = res.data;

      let populated = 0;
      if (scoring_rubric && scoring_rubric.length > 0) {
        setCriteria(
          scoring_rubric.map((item, i) => ({
            key: `criterion_${i + 1}`,
            label: item.criterion || '',
            weight: typeof item.weight === 'number' ? item.weight : 20,
            description: item.rationale || '',
            instructions: '',
            max_words: 500,
          })),
        );
        populated += scoring_rubric.length;
      }

      // Eligibility: AI returns plain strings; map them onto our structured
      // eligibility categories where labels match, otherwise enable the
      // first available unfilled slot. Prefer matching by keyword over
      // dropping items.
      if (aiEligibility && aiEligibility.length > 0) {
        setEligibility((prev) => {
          const used = new Set<number>();
          const next = [...prev];
          for (const text of aiEligibility) {
            const lower = text.toLowerCase();
            // Try keyword match first
            let idx = next.findIndex((e, i) => !used.has(i) && (
              lower.includes(e.key) || lower.includes(e.label.toLowerCase())
            ));
            if (idx === -1) {
              idx = next.findIndex((e, i) => !used.has(i) && !e.enabled);
            }
            if (idx === -1) continue;
            next[idx] = { ...next[idx], enabled: true, details: text };
            used.add(idx);
            populated += 1;
          }
          return next;
        });
      }

      setAiExclusions(exclusions || []);
      setAiGuidance(guidance || null);
      setAiBurden(burden || null);

      toast.success(
        populated > 0
          ? t('toast.ai_scaffold_designed', { count: populated })
          : t('toast.ai_scaffold_no_match'),
      );
    } catch {
      toast.error(t('toast.ai_scaffold_failed'));
    } finally {
      setSuggestingCriteria(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      if (!grantId) {
        const res = await api.post<GrantCreateResponse>('/grants/', {
          title: basic.title || 'Draft Grant',
        });
        if (res.success) setGrantId(res.grant.id);
      }
      await autoSave();
      toast.success(t('toast.grant_draft_saved'));
    } catch {
      toast.error(t('toast.grant_draft_save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!grantId) {
      toast.error(t('toast.grant_publish_no_grant'));
      return;
    }
    setPublishing(true);
    try {
      await autoSave();
      await api.post(`/grants/${grantId}/publish`);
      toast.success(t('toast.grant_published'));
      router.push('/grants');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish grant';
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step Renderers
  // ---------------------------------------------------------------------------

  const renderStep0Upload = () => (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="max-w-[560px] text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--kuja-spark-soft))]">
          <Sparkles className="h-8 w-8 text-[hsl(var(--kuja-spark))]" />
        </div>
        <h2 className="kuja-display mb-2 text-2xl font-bold">{t('grant.wizard.upload_title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('grant.wizard.upload_subtitle')}
        </p>
      </div>

      {!uploadedFileName || uploadError ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={handleFileDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`w-full max-w-[560px] rounded-[16px] border-2 border-dashed px-6 py-12 text-center transition ${
            uploading
              ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand-50))]'
              : 'cursor-pointer border-border hover:border-[hsl(var(--kuja-clay))] hover:bg-muted/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileSelect}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-[hsl(var(--kuja-clay))]" />
              <div className="text-sm font-medium text-[hsl(var(--kuja-clay))]">
                {t('grant.wizard.ai_analyzing')}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('grant.wizard.ai_extracting')}
              </div>
              <div className="kuja-shimmer h-1 w-[80%] rounded-full bg-muted" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <CloudUpload className="h-12 w-12 text-muted-foreground" />
              <div className="text-sm font-medium">{t('grant.wizard.dropzone_primary')}</div>
              <div className="text-xs text-muted-foreground">{t('grant.wizard.dropzone_secondary')}</div>
              <div className="mt-1 flex gap-1">
                {['PDF', 'DOC', 'DOCX', 'TXT'].map((fmt) => (
                  <span
                    key={fmt}
                    className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {uploadError && (
        <div className="w-full max-w-[560px]">
          <Alert tone="error">{uploadError}</Alert>
        </div>
      )}

      {uploadedFileName && !uploadError && !uploading && (
        <Card className="w-full max-w-[560px] border-emerald-200 bg-emerald-50/30">
          <div className="p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-emerald-600" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-emerald-800">
                  {t('grant.wizard.doc_analyzed')}
                </div>
                <div className="truncate text-xs text-muted-foreground">{uploadedFileName}</div>
              </div>
              <button
                onClick={() => {
                  setUploadedFileName(null);
                  setExtracted(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {extracted && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md bg-[hsl(var(--kuja-sand-50))] p-3 text-center">
                    <div className="kuja-numeric text-2xl font-bold text-[hsl(var(--kuja-clay))]">
                      {extracted.requirements?.length || 0}
                    </div>
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {t('grant.wizard.stat_requirements')}
                    </div>
                  </div>
                  <div className="rounded-md bg-sky-50 p-3 text-center">
                    <div className="kuja-numeric text-2xl font-bold text-sky-600">
                      {extracted.template_sections?.length || 0}
                    </div>
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {t('grant.wizard.stat_sections')}
                    </div>
                  </div>
                  <div className="rounded-md bg-amber-50 p-3 text-center">
                    <div className="kuja-numeric text-2xl font-bold text-amber-700">
                      {extracted.indicators?.length || 0}
                    </div>
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {t('grant.wizard.stat_indicators')}
                    </div>
                  </div>
                </div>

                {extracted.requirements && extracted.requirements.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {t('grant.wizard.reporting_requirements')}
                    </div>
                    {extracted.requirements.slice(0, 4).map((req, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5">
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[hsl(var(--kuja-clay))]" />
                        <span className="text-xs">{req.title || req.type || t('grant.wizard.requirement_fallback')}</span>
                        {req.frequency && (
                          <span className="inline-flex items-center rounded-full border border-border bg-background px-1.5 py-0 text-[10px] text-muted-foreground">
                            {req.frequency}
                          </span>
                        )}
                      </div>
                    ))}
                    {extracted.requirements.length > 4 && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {t('grant.wizard.more_count', { n: extracted.requirements.length - 4 })}
                      </div>
                    )}
                  </div>
                )}

                {extracted.indicators && extracted.indicators.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {t('grant.wizard.kpis')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {extracted.indicators.slice(0, 6).map((ind, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
                        >
                          {ind.name || t('grant.wizard.kpi_fallback')}
                          {ind.target ? ` — ${ind.target}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      <GrantBriefPrompt onApplied={applyGrantBrief} className="mt-1" />

      <button
        onClick={goNext}
        className="mt-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {t('grant.wizard.skip_manual')}
      </button>
    </div>
  );

  const renderStep1BasicInfo = () => (
    <div className="space-y-4">
      {extracted && (
        <Alert tone="info" icon={<Sparkles className="h-4 w-4" />}>
          {t('grant.wizard.basics_prefilled')}
        </Alert>
      )}

      <Field label={t('grant.wizard.title_required')}>
        <input
          value={basic.title}
          onChange={(e) => updateBasic('title', e.target.value)}
          placeholder={t('grant.create.grant_title_placeholder')}
          className={INPUT_CLS}
        />
      </Field>

      <Field label={t('grant.create.description')}>
        <textarea
          rows={4}
          value={basic.description}
          onChange={(e) => updateBasic('description', e.target.value)}
          placeholder={t('grant.create.description_placeholder')}
          className={TA_CLS}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t('grant.create.total_funding')}>
          <div className="relative">
            <DollarSign className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number"
              value={basic.total_funding}
              onChange={(e) => updateBasic('total_funding', e.target.value)}
              placeholder="500000"
              className={`${INPUT_CLS} pl-8`}
            />
          </div>
        </Field>
        <Field label={t('grant.create.currency')}>
          <select
            value={basic.currency}
            onChange={(e) => updateBasic('currency', e.target.value)}
            className={INPUT_CLS}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('grant.create.deadline')}>
          <input
            type="date"
            value={basic.deadline}
            onChange={(e) => updateBasic('deadline', e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
      </div>

      <Field label={t('grant.create.sectors')}>
        <MultiSelectToggle
          options={SECTOR_OPTIONS}
          selected={basic.sectors}
          onChange={(val) => updateBasic('sectors', val)}
        />
      </Field>

      <Field label={t('grant.create.countries')}>
        <MultiSelectToggle
          options={COUNTRY_OPTIONS}
          selected={basic.countries}
          onChange={(val) => updateBasic('countries', val)}
        />
      </Field>
    </div>
  );

  const renderStep2Eligibility = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('grant.wizard.eligibility_intro')}
      </p>

      {extracted && eligibility.some((e) => e.enabled) && (
        <Alert tone="info" icon={<Sparkles className="h-4 w-4" />}>
          {t('grant.wizard.eligibility_prefilled')}
        </Alert>
      )}

      {eligibility.map((item, i) => (
        <Card
          key={item.key}
          className={item.enabled ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand-50))]' : ''}
        >
          <div className="p-4">
            <div className={`flex items-center justify-between ${item.enabled ? 'mb-2' : ''}`}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={() => toggleEligibility(i)}
                  className="h-4 w-4 rounded border-input accent-[hsl(var(--kuja-clay))]"
                />
                <span
                  className={`text-sm font-medium ${
                    item.enabled ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {item.labelKey ? t(item.labelKey) : item.label}
                </span>
              </label>
              {item.enabled && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('grant.wizard.weight_label')}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={item.weight}
                    onChange={(e) => updateEligibility(i, 'weight', Number(e.target.value))}
                    className="w-24 accent-[hsl(var(--kuja-clay))]"
                  />
                  <span className="kuja-numeric min-w-[36px] text-right text-sm font-semibold text-[hsl(var(--kuja-clay))]">
                    {item.weight}%
                  </span>
                </div>
              )}
            </div>
            {item.enabled && (
              <div className="ml-6">
                <input
                  value={item.details}
                  onChange={(e) => updateEligibility(i, 'details', e.target.value)}
                  placeholder={t('grant.wizard.eligibility_details_placeholder')}
                  className={INPUT_CLS}
                />
              </div>
            )}
          </div>
        </Card>
      ))}

      <button
        onClick={() => {
          const newKey = `custom_${Date.now()}`;
          setEligibility((prev) => [
            ...prev,
            { key: newKey, label: 'Custom Requirement', enabled: true, details: '', weight: 10 },
          ]);
        }}
        className="inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" /> {t('grant.wizard.add_custom_requirement')}
      </button>
    </div>
  );

  const renderStep3Evaluation = () => (
    <div className="space-y-3">
      {(aiGuidance || aiExclusions.length > 0) && (
        <div className="rounded-[10px] border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[hsl(var(--kuja-spark))] mb-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('grant.wizard.ai_design_guidance')}</span>
            <AiBadge className="ml-1" />
          </div>
          {aiGuidance && (
            <p className="text-xs text-foreground leading-relaxed mb-2">{aiGuidance}</p>
          )}
          {aiExclusions.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                {t('grant.wizard.suggested_exclusions')}
              </div>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                {aiExclusions.slice(0, 5).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      {aiBurden && aiBurden.score && (
        <div className="rounded-[10px] border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--kuja-spark))]" />
              <span>{t('donor.scaffold.burden_score')}</span>
              <AiBadge className="ml-1" />
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                aiBurden.score === 'low'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : aiBurden.score === 'medium'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {t(`donor.scaffold.burden_${aiBurden.score}`)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            {t('donor.scaffold.burden_explainer')}
          </p>
          {aiBurden.drivers && aiBurden.drivers.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                {t('donor.scaffold.burden_drivers')}
              </div>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-foreground">
                {aiBurden.drivers.slice(0, 5).map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
          {aiBurden.simplifications && aiBurden.simplifications.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                {t('donor.scaffold.burden_simplifications')}
              </div>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-foreground">
                {aiBurden.simplifications.slice(0, 5).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('grant.wizard.evaluation_intro')}
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              criteriaWeightTotal === 100 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {t('grant.wizard.weight_total', { n: criteriaWeightTotal })}
            {criteriaWeightTotal !== 100 && t('grant.wizard.weight_must_total')}
          </span>
          <button
            onClick={handleSuggestCriteria}
            disabled={suggestingCriteria}
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:opacity-90 disabled:opacity-50"
          >
            {suggestingCriteria ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {suggestingCriteria ? t('grant.wizard.designing') : t('grant.wizard.design_with_ai')}
          </button>
          <button
            onClick={addCriterion}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> {t('grant.wizard.add')}
          </button>
        </div>
      </div>

      {criteria.map((criterion, i) => (
        <Card key={i}>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t('grant.wizard.criterion_n', { n: i + 1 })}</span>
              {criteria.length > 1 && (
                <button
                  onClick={() => removeCriterion(i)}
                  className="rounded-md p-1 text-red-600 hover:bg-red-50"
                  aria-label={t('grant.wizard.remove_criterion')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[3fr_1fr]">
              <Field label={t('grant.wizard.label_required')}>
                <input
                  value={criterion.label}
                  onChange={(e) => updateCriterion(i, 'label', e.target.value)}
                  placeholder={t('grant.wizard.label_placeholder')}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label={t('grant.wizard.weight_pct')}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={criterion.weight}
                  onChange={(e) => updateCriterion(i, 'weight', Number(e.target.value))}
                  className={INPUT_CLS}
                />
              </Field>
            </div>

            <Field label={t('grant.create.description')}>
              <textarea
                rows={2}
                value={criterion.description}
                onChange={(e) => updateCriterion(i, 'description', e.target.value)}
                placeholder={t('grant.wizard.description_placeholder')}
                className={TA_CLS}
              />
            </Field>

            <Field label={t('grant.wizard.instructions')}>
              <textarea
                rows={2}
                value={criterion.instructions}
                onChange={(e) => updateCriterion(i, 'instructions', e.target.value)}
                placeholder={t('grant.wizard.instructions_placeholder')}
                className={TA_CLS}
              />
            </Field>

            <div className="max-w-[140px]">
              <Field label={t('grant.wizard.max_words')}>
                <input
                  type="number"
                  min={50}
                  max={5000}
                  value={criterion.max_words}
                  onChange={(e) => updateCriterion(i, 'max_words', Number(e.target.value))}
                  className={INPUT_CLS}
                />
              </Field>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  const renderStep4Documents = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('grant.wizard.docs_intro')}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {docReqs.map((doc, i) => (
          <Card
            key={doc.key}
            className={`transition hover:shadow-[var(--kuja-elev-2)] ${
              doc.enabled ? 'border-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-sand-50))]' : ''
            }`}
          >
            <div className="p-4">
              <div
                className="flex cursor-pointer items-center gap-2"
                onClick={() => toggleDocReq(i)}
              >
                <input
                  type="checkbox"
                  checked={doc.enabled}
                  readOnly
                  tabIndex={-1}
                  className="h-4 w-4 rounded border-input accent-[hsl(var(--kuja-clay))]"
                />
                <span className="text-lg">{doc.icon}</span>
                <span className="text-sm font-medium">{doc.labelKey ? t(doc.labelKey) : doc.label}</span>
              </div>
              {doc.enabled && (
                <div className="ml-7 mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={doc.specific_requirements}
                    onChange={(e) => updateDocReq(i, 'specific_requirements', e.target.value)}
                    placeholder={t('grant.wizard.doc_specific_placeholder')}
                    className={INPUT_CLS}
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={doc.required}
                      onChange={(e) => updateDocReq(i, 'required', e.target.checked)}
                      className="h-4 w-4 rounded border-input accent-[hsl(var(--kuja-clay))]"
                    />
                    <span className="text-xs text-muted-foreground">
                      {t('grant.wizard.doc_required_label')}
                    </span>
                  </label>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderStep5Review = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--kuja-clay))]">
        <Info className="h-4 w-4" />
        {t('grant.wizard.review_intro')}
      </div>

      {(!basic.title.trim() || !basic.total_funding || !basic.deadline) && (
        <Alert tone="warning">
          <strong>{t('grant.wizard.required_fields_missing')}</strong>{' '}
          {[
            !basic.title.trim() && t('grant.wizard.missing.title'),
            !basic.total_funding && t('grant.wizard.missing.funding'),
            !basic.deadline && t('grant.wizard.missing.deadline'),
          ]
            .filter(Boolean)
            .join(', ')}
          . <span dangerouslySetInnerHTML={{ __html: t('grant.wizard.go_back_to_basics') }} />
        </Alert>
      )}

      <Card>
        <div className="p-5">
          <div className="mb-3 text-sm font-semibold">{t('grant.create.basic_information')}</div>
          <div className="space-y-1.5 text-sm">
            <SummaryRow label={t('grant.create.title_label')} value={basic.title || '—'} />
            <SummaryRow
              label={t('grant.create.total_funding')}
              value={
                basic.total_funding
                  ? `${basic.currency} ${Number(basic.total_funding).toLocaleString()}`
                  : '—'
              }
            />
            <SummaryRow label={t('grant.create.deadline')} value={basic.deadline || '—'} />
            {basic.sectors.length > 0 && (
              <div className="flex items-start justify-between">
                <span className="text-muted-foreground">{t('grant.create.sectors')}</span>
                <div className="flex max-w-[60%] flex-wrap justify-end gap-1">
                  {basic.sectors.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
                    >
                      {localizeSector(s)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {basic.countries.length > 0 && (
              <div className="flex items-start justify-between">
                <span className="text-muted-foreground">{t('grant.create.countries')}</span>
                <div className="flex max-w-[60%] flex-wrap justify-end gap-1">
                  {basic.countries.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
                    >
                      {localizeCountry(c)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {eligibility.some((e) => e.enabled) && (
        <Card>
          <div className="p-5">
            <div className="mb-3 text-sm font-semibold">{t('grant.wizard.eligibility_requirements')}</div>
            <div className="space-y-1.5">
              {eligibility
                .filter((e) => e.enabled)
                .map((e) => (
                  <div key={e.key} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <div>{e.labelKey ? t(e.labelKey) : e.label}</div>
                      {e.details && <div className="text-xs text-muted-foreground">{e.details}</div>}
                    </div>
                    <span className="whitespace-nowrap text-muted-foreground">{e.weight}%</span>
                  </div>
                ))}
            </div>
          </div>
        </Card>
      )}

      {criteria.some((c) => c.label.trim()) && (
        <Card>
          <div className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-semibold">{t('grant.wizard.evaluation_criteria')}</span>
              <span
                className={`text-xs ${
                  criteriaWeightTotal === 100 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                ({criteriaWeightTotal}%)
              </span>
            </div>
            <div className="space-y-1.5 text-sm">
              {criteria
                .filter((c) => c.label.trim())
                .map((c, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{c.label}</span>
                    <span className="text-muted-foreground">{c.weight}%</span>
                  </div>
                ))}
            </div>
          </div>
        </Card>
      )}

      {docReqs.some((d) => d.enabled) && (
        <Card>
          <div className="p-5">
            <div className="mb-3 text-sm font-semibold">{t('grant.wizard.required_documents')}</div>
            <div className="flex flex-wrap gap-1.5">
              {docReqs
                .filter((d) => d.enabled)
                .map((d) => (
                  <span
                    key={d.key}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                      d.required
                        ? 'border-[hsl(var(--kuja-clay)/0.25)] bg-[hsl(var(--kuja-sand-50))] text-[hsl(var(--kuja-clay))]'
                        : 'border-border bg-background text-foreground'
                    }`}
                  >
                    {d.labelKey ? t(d.labelKey) : d.label}
                  </span>
                ))}
            </div>
          </div>
        </Card>
      )}

      {extracted && (
        <Card className="border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]">
          <div className="p-5">
            <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--kuja-spark))]">
              <Sparkles className="h-4 w-4" />
              {t('grant.wizard.ai_extracted_data')}
            </div>
            {extracted.requirements && extracted.requirements.length > 0 && (
              <div className="mb-3">
                <div className="mb-1 text-xs font-medium">
                  {t('grant.wizard.reporting_requirements_count', { n: extracted.requirements.length })}
                </div>
                <div className="space-y-0.5">
                  {extracted.requirements.map((req, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      {i + 1}. {req.title || req.description || t('grant.wizard.requirement_fallback')}
                      {req.frequency ? ` (${req.frequency})` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {extracted.indicators && extracted.indicators.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium">
                  {t('grant.wizard.kpis_count', { n: extracted.indicators.length })}
                </div>
                <div className="space-y-0.5">
                  {extracted.indicators.map((ind, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      {i + 1}. {ind.name || ind.description || t('grant.wizard.indicator_fallback')}
                      {ind.target ? t('grant.wizard.kpi_target', { target: ind.target }) : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="border-2 border-emerald-200 bg-emerald-50/40">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="text-sm font-semibold text-emerald-800">{t('grant.wizard.ready_to_publish')}</div>
            <div className="text-xs text-muted-foreground">
              {t('grant.wizard.publish_subtitle')}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={saving || publishing}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {saving ? t('grant.wizard.saving_dots') : t('grant.wizard.save_draft')}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {publishing ? t('grant.wizard.publishing') : t('grant.wizard.publish_grant')}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderStep0Upload();
      case 1: return renderStep1BasicInfo();
      case 2: return renderStep2Eligibility();
      case 3: return renderStep3Evaluation();
      case 4: return renderStep4Documents();
      case 5: return renderStep5Review();
      default: return null;
    }
  };

  return (
    <div className="mx-auto max-w-[960px] space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/grants')}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </button>
        <div className="flex-1">
          <h1 className="kuja-display text-2xl font-bold text-foreground">{t('grant.create.title')}</h1>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {t('grant.wizard.step_progress', { current: step + 1, total: STEPS.length, label: t(STEPS[step].labelKey) })}
            {saving && <span className="ml-1 text-sky-600">{t('grant.wizard.saving')}</span>}
          </div>
        </div>
        {grantId && (
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
            {t('grant.wizard.draft_label', { id: grantId })}
          </span>
        )}
      </div>

      {/* Custom Stepper */}
      <div className="flex items-center gap-0 overflow-x-auto py-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const complete = i < step;
          const label = t(s.labelKey);
          return (
            <div key={s.labelKey} className="flex flex-1 items-center">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                    active
                      ? 'bg-[hsl(var(--kuja-clay))] text-white'
                      : complete
                        ? 'bg-[hsl(var(--kuja-savanna))] text-white'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={`hidden truncate text-xs font-medium sm:inline ${
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

      {/* Step Content */}
      <Card>
        <div className="p-6">{renderCurrentStep()}</div>
      </Card>

      {/* Navigation */}
      {step < STEPS.length - 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> {t('common.previous')}
          </button>
          <button
            onClick={goNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
          >
            {t('common.next')} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === STEPS.length - 1 && (
        <div className="flex">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> {t('common.previous')}
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
