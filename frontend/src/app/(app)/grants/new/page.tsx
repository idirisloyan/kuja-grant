'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import InputAdornment from '@mui/material/InputAdornment';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';

import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, Info,
  FileText, DollarSign, ClipboardList, Upload, BarChart3, Send,
  Sparkles, CheckCircle2, CloudUpload, X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Upload Document', icon: CloudUpload },
  { label: 'Basic Info', icon: FileText },
  { label: 'Eligibility', icon: ClipboardList },
  { label: 'Evaluation', icon: BarChart3 },
  { label: 'Documents', icon: Upload },
  { label: 'Review & Publish', icon: Send },
];

const SECTOR_OPTIONS = [
  'Health', 'Education', 'WASH', 'Climate', 'Protection',
  'Nutrition', 'Livelihoods', 'Governance', 'Agriculture', 'Gender Equality',
];

const COUNTRY_OPTIONS = [
  'Kenya', 'Somalia', 'Ethiopia', 'Uganda', 'Tanzania',
  'South Sudan', 'Nigeria', 'South Africa',
];

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'KES', 'CHF'];

const ELIGIBILITY_CATEGORIES = [
  { key: 'geographic', label: 'Geographic Requirements' },
  { key: 'org_type', label: 'Organization Type' },
  { key: 'experience', label: 'Experience & Track Record' },
  { key: 'budget', label: 'Budget / Financial Capacity' },
  { key: 'sector', label: 'Sector Expertise' },
  { key: 'registration', label: 'Registration & Compliance' },
];

const DOC_TYPES = [
  { key: 'financial_report', label: 'Financial Report', icon: '📊' },
  { key: 'registration', label: 'Registration Certificate', icon: '📋' },
  { key: 'audit', label: 'Audit Report', icon: '🔍' },
  { key: 'PSEA', label: 'PSEA Policy', icon: '🛡' },
  { key: 'project_report', label: 'Project Reports', icon: '📄' },
  { key: 'budget', label: 'Detailed Budget', icon: '💰' },
  { key: 'CV', label: 'Staff CVs', icon: '👤' },
  { key: 'strategic_plan', label: 'Strategic Plan', icon: '🗺' },
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
  max_words: number;
}

interface DocReqItem {
  key: string;
  label: string;
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
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {options.map((opt) => {
        const isActive = selected.includes(opt);
        return (
          <Chip
            key={opt}
            label={opt}
            onClick={() => toggle(opt)}
            variant={isActive ? 'filled' : 'outlined'}
            color={isActive ? 'primary' : 'default'}
            size="small"
            sx={{
              fontWeight: isActive ? 600 : 400,
              borderColor: isActive ? 'primary.main' : 'divider',
              cursor: 'pointer',
            }}
          />
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function CreateGrantPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Grant ID (created on first upload or manual draft creation)
  const [grantId, setGrantId] = useState<number | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [uploadError, setUploadError] = useState('');

  // AI suggestion state
  const [suggestingCriteria, setSuggestingCriteria] = useState(false);

  // Step 2: Basic Info
  const [basic, setBasic] = useState<BasicInfo>({
    title: '',
    description: '',
    total_funding: '',
    currency: 'USD',
    deadline: '',
    sectors: [],
    countries: [],
  });

  // Step 3: Eligibility
  const [eligibility, setEligibility] = useState<EligibilityItem[]>(
    ELIGIBILITY_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      enabled: false,
      details: '',
      weight: 10,
    })),
  );

  // Step 4: Criteria
  const [criteria, setCriteria] = useState<CriterionItem[]>([
    { key: 'criterion_1', label: '', weight: 100, description: '', instructions: '', max_words: 500 },
  ]);

  // Step 5: Document Requirements
  const [docReqs, setDocReqs] = useState<DocReqItem[]>(
    DOC_TYPES.map((d) => ({
      key: d.key,
      label: d.label,
      icon: d.icon,
      enabled: false,
      specific_requirements: '',
      required: true,
    })),
  );

  // ---------------------------------------------------------------------------
  // File Upload Handler (AI-First)
  // ---------------------------------------------------------------------------

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError('');
    setUploadedFileName(file.name);

    try {
      // Step 1: Create a draft grant if we don't have one yet
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

      // Step 2: Upload the grant document for AI extraction
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

        // Pre-fill basic info: use the filename-derived title we created the draft with
        const draftTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        setBasic((prev) => ({
          ...prev,
          title: prev.title || draftTitle,
        }));

        // Pre-fill eligibility from extracted requirements
        if (extractedData?.requirements && extractedData.requirements.length > 0) {
          setEligibility((prev) =>
            prev.map((e) => {
              const match = extractedData.requirements?.find(
                (r) => r.type?.toLowerCase().includes(e.key) || r.title?.toLowerCase().includes(e.key),
              );
              if (match) {
                return { ...e, enabled: true, details: match.description || match.title || '' };
              }
              return e;
            }),
          );
        }

        const reqCount = extractedData?.requirements?.length || 0;
        const indCount = extractedData?.indicators?.length || 0;
        toast.success(
          `AI extracted ${reqCount} reporting requirement${reqCount !== 1 ? 's' : ''} and ${indCount} indicator${indCount !== 1 ? 's' : ''}`,
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

  // ---------------------------------------------------------------------------
  // Auto-Save on Step Change
  // ---------------------------------------------------------------------------

  const autoSave = async () => {
    if (!grantId) return;
    setSaving(true);
    try {
      // Only include fields that the user has actually filled in,
      // so we never overwrite server data with empty strings
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
      // Silent fail for auto-save; user can still proceed
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    // Ensure a draft exists before leaving step 0
    if (step === 0 && !grantId) {
      try {
        const draftTitle = basic.title || 'Draft Grant';
        const res = await api.post<GrantCreateResponse>('/grants/', { title: draftTitle });
        if (res.success) {
          setGrantId(res.grant.id);
          // Sync basic state so title is never empty after draft creation
          if (!basic.title) {
            setBasic((prev) => ({ ...prev, title: draftTitle }));
          }
        }
      } catch {
        toast.error('Failed to create draft grant');
        return;
      }
    }

    // Auto-save current step data
    if (grantId && step > 0) {
      await autoSave();
    }

    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  // ---------------------------------------------------------------------------
  // Form Handlers
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
      prev.map((d, i) => (i === index ? { ...d, enabled: !d.enabled } : d)),
    );
  };

  const updateDocReq = (index: number, field: 'specific_requirements' | 'required', value: string | boolean) => {
    setDocReqs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)),
    );
  };

  const criteriaWeightTotal = criteria.reduce((sum, c) => sum + c.weight, 0);

  // ---------------------------------------------------------------------------
  // AI Suggest Criteria
  // ---------------------------------------------------------------------------

  const handleSuggestCriteria = async () => {
    setSuggestingCriteria(true);
    try {
      const sectorsText = basic.sectors.length > 0 ? basic.sectors.join(', ') : 'humanitarian';
      const titleText = basic.title || 'a humanitarian grant';
      const message = `Suggest 5 evaluation criteria for a grant titled "${titleText}" in the sectors: ${sectorsText}. For each criterion, provide: label, weight (percentages totaling 100), description, instructions for applicants, and recommended max words. Format as JSON array with keys: label, weight, description, instructions, max_words.`;

      const res = await api.post<AIChatResponse>('/ai/chat', {
        message,
        context: { page: 'grant_wizard' },
      });

      if (res.response) {
        // Try to parse JSON from the AI response
        const jsonMatch = res.response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]) as Array<{
              label?: string;
              weight?: number;
              description?: string;
              instructions?: string;
              max_words?: number;
            }>;
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCriteria(
                parsed.map((item, i) => ({
                  key: `criterion_${i + 1}`,
                  label: item.label || '',
                  weight: item.weight || 20,
                  description: item.description || '',
                  instructions: item.instructions || '',
                  max_words: item.max_words || 500,
                })),
              );
              toast.success(`AI suggested ${parsed.length} evaluation criteria`);
            }
          } catch {
            toast.error('Could not parse AI suggestions. Please add criteria manually.');
          }
        } else {
          toast.error('AI response did not contain structured criteria. Please add criteria manually.');
        }
      }
    } catch {
      toast.error('AI suggestion failed. Please add criteria manually.');
    } finally {
      setSuggestingCriteria(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Publish / Save Draft
  // ---------------------------------------------------------------------------

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
      toast.success('Grant saved as draft');
    } catch {
      toast.error('Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!grantId) {
      toast.error('No grant to publish. Please complete the wizard first.');
      return;
    }

    setPublishing(true);
    try {
      // Save all data first
      await autoSave();

      // Then publish — the server controls what's required
      await api.post(`/grants/${grantId}/publish`);
      toast.success('Grant published successfully!');
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
    <Stack spacing={3} sx={{ alignItems: 'center', py: 2 }}>
      {/* Hero section */}
      <Box sx={{ textAlign: 'center', maxWidth: 560 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: 'primary.50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <Sparkles size={32} style={{ color: 'var(--mui-palette-primary-main, #1976d2)' }} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
          Upload Your Grant Agreement
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
          Our AI will extract eligibility requirements, reporting schedules, and KPIs automatically
          — saving you hours of manual data entry.
        </Typography>
      </Box>

      {/* Upload area */}
      {!uploadedFileName || uploadError ? (
        <Box
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            width: '100%',
            maxWidth: 560,
            border: '2px dashed',
            borderColor: uploading ? 'primary.main' : 'divider',
            borderRadius: 3,
            py: 6,
            px: 4,
            textAlign: 'center',
            cursor: uploading ? 'default' : 'pointer',
            transition: 'all 0.2s ease',
            bgcolor: uploading ? 'primary.50' : 'background.default',
            '&:hover': uploading
              ? {}
              : {
                  borderColor: 'primary.light',
                  bgcolor: 'action.hover',
                },
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {uploading ? (
            <Stack spacing={2} sx={{ alignItems: 'center' }}>
              <CircularProgress size={48} />
              <Typography variant="body1" sx={{ fontWeight: 500, color: 'primary.main' }}>
                AI is analyzing your document...
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Extracting requirements, KPIs, and reporting schedules
              </Typography>
              <LinearProgress sx={{ width: '80%', mt: 1, borderRadius: 1 }} />
            </Stack>
          ) : (
            <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
              <CloudUpload size={48} style={{ color: '#94a3b8' }} />
              <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.primary' }}>
                Drag & drop your grant document here
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                or click to browse
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                {['PDF', 'DOC', 'DOCX', 'TXT'].map((fmt) => (
                  <Chip
                    key={fmt}
                    label={fmt}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
                  />
                ))}
              </Box>
            </Stack>
          )}
        </Box>
      ) : null}

      {/* Upload error */}
      {uploadError && (
        <Alert severity="error" sx={{ width: '100%', maxWidth: 560 }}>
          {uploadError}
        </Alert>
      )}

      {/* Upload success */}
      {uploadedFileName && !uploadError && !uploading && (
        <Card
          sx={{
            width: '100%',
            maxWidth: 560,
            border: '1px solid',
            borderColor: 'success.light',
            bgcolor: 'success.50',
          }}
        >
          <CardContent sx={{ py: 3, '&:last-child': { pb: 3 } }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CheckCircle2 size={24} style={{ color: '#16a34a' }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.dark' }}>
                    Document analyzed successfully
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {uploadedFileName}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => {
                    setUploadedFileName(null);
                    setExtracted(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  sx={{ color: 'text.secondary' }}
                >
                  <X size={16} />
                </IconButton>
              </Box>

              {extracted && (
                <Stack spacing={2} sx={{ pt: 1 }}>
                  {/* Summary stats */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                    <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'primary.50' }}>
                      <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {extracted.requirements?.length || 0}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        Requirements
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'info.50' }}>
                      <Typography variant="h4" sx={{ fontWeight: 700, color: 'info.main' }}>
                        {extracted.template_sections?.length || 0}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        Sections
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'warning.50' }}>
                      <Typography variant="h4" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                        {extracted.indicators?.length || 0}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        Indicators
                      </Typography>
                    </Box>
                  </Box>

                  {/* Extracted requirements detail */}
                  {extracted.requirements && extracted.requirements.length > 0 && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', mb: 1, display: 'block' }}>
                        Reporting Requirements
                      </Typography>
                      {extracted.requirements.slice(0, 4).map((req, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                          <Typography variant="body2" sx={{ color: 'text.primary', fontSize: '0.8rem' }}>
                            {(req as Record<string, string>).title || (req as Record<string, string>).type || 'Requirement'}
                          </Typography>
                          {(req as Record<string, string>).frequency && (
                            <Chip label={(req as Record<string, string>).frequency} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                          )}
                        </Box>
                      ))}
                      {extracted.requirements.length > 4 && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                          +{extracted.requirements.length - 4} more
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* KPI indicators */}
                  {extracted.indicators && extracted.indicators.length > 0 && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', mb: 1, display: 'block' }}>
                        Key Performance Indicators
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {extracted.indicators.slice(0, 6).map((ind, i) => (
                          <Chip
                            key={i}
                            label={`${(ind as Record<string, string>).name || 'KPI'}${(ind as Record<string, string>).target ? ` — ${(ind as Record<string, string>).target}` : ''}`}
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ fontSize: '0.7rem', height: 24 }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Skip link */}
      <Button
        variant="text"
        size="small"
        onClick={goNext}
        sx={{ color: 'text.secondary', textTransform: 'none', mt: 1 }}
      >
        Skip — I&apos;ll enter details manually
      </Button>
    </Stack>
  );

  const renderStep1BasicInfo = () => (
    <Stack spacing={3}>
      {extracted && (
        <Alert severity="info" icon={<Sparkles size={18} />} sx={{ mb: 1 }}>
          Fields below have been pre-filled from your uploaded document. Review and adjust as needed.
        </Alert>
      )}

      <TextField
        label="Grant Title *"
        placeholder="e.g., Community Health Resilience Program 2026"
        value={basic.title}
        onChange={(e) => updateBasic('title', e.target.value)}
        fullWidth
        size="small"
      />

      <TextField
        label="Description"
        placeholder="Describe the grant purpose, objectives, and target outcomes..."
        value={basic.description}
        onChange={(e) => updateBasic('description', e.target.value)}
        fullWidth
        multiline
        minRows={4}
        size="small"
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <TextField
          label="Total Funding Amount"
          type="number"
          placeholder="500000"
          value={basic.total_funding}
          onChange={(e) => updateBasic('total_funding', e.target.value)}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <DollarSign size={16} />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small">
          <InputLabel>Currency</InputLabel>
          <Select
            label="Currency"
            value={basic.currency}
            onChange={(e) => updateBasic('currency', e.target.value)}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Application Deadline"
          type="date"
          value={basic.deadline}
          onChange={(e) => updateBasic('deadline', e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', mb: 1 }}>
          Sectors
        </Typography>
        <MultiSelectToggle
          options={SECTOR_OPTIONS}
          selected={basic.sectors}
          onChange={(val) => updateBasic('sectors', val)}
        />
      </Box>

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', mb: 1 }}>
          Target Countries
        </Typography>
        <MultiSelectToggle
          options={COUNTRY_OPTIONS}
          selected={basic.countries}
          onChange={(val) => updateBasic('countries', val)}
        />
      </Box>
    </Stack>
  );

  const renderStep2Eligibility = () => (
    <Stack spacing={2}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Toggle the eligibility categories you want applicants to meet. Add details and set relative weights.
      </Typography>

      {extracted && eligibility.some((e) => e.enabled) && (
        <Alert severity="info" icon={<Sparkles size={18} />} sx={{ mb: 1 }}>
          Some requirements have been pre-filled from your uploaded document.
        </Alert>
      )}

      {eligibility.map((item, i) => (
        <Card
          key={item.key}
          sx={{
            border: '1px solid',
            borderColor: item.enabled ? 'primary.light' : 'divider',
            bgcolor: item.enabled ? 'primary.50' : 'background.paper',
          }}
        >
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: item.enabled ? 1.5 : 0,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={item.enabled}
                    onChange={() => toggleEligibility(i)}
                    size="small"
                  />
                }
                label={
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: item.enabled ? 'text.primary' : 'text.disabled',
                    }}
                  >
                    {item.label}
                  </Typography>
                }
              />
              {item.enabled && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Weight:
                  </Typography>
                  <Slider
                    value={item.weight}
                    onChange={(_, val) => updateEligibility(i, 'weight', val as number)}
                    min={0}
                    max={100}
                    size="small"
                    sx={{ width: 100 }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: 'primary.main', minWidth: 40, textAlign: 'right' }}
                  >
                    {item.weight}%
                  </Typography>
                </Box>
              )}
            </Box>
            {item.enabled && (
              <Box sx={{ ml: 6 }}>
                <TextField
                  placeholder="Describe specific requirements..."
                  value={item.details}
                  onChange={(e) => updateEligibility(i, 'details', e.target.value)}
                  fullWidth
                  size="small"
                />
              </Box>
            )}
          </CardContent>
        </Card>
      ))}

      <Button
        variant="outlined"
        size="small"
        startIcon={<Plus size={14} />}
        sx={{ alignSelf: 'flex-start' }}
        onClick={() => {
          const newKey = `custom_${Date.now()}`;
          setEligibility((prev) => [
            ...prev,
            { key: newKey, label: 'Custom Requirement', enabled: true, details: '', weight: 10 },
          ]);
        }}
      >
        Add Custom Requirement
      </Button>
    </Stack>
  );

  const renderStep3Evaluation = () => (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Define the criteria reviewers will use to evaluate applications.
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: criteriaWeightTotal === 100 ? 'success.main' : 'error.main',
            }}
          >
            Total: {criteriaWeightTotal}%
            {criteriaWeightTotal !== 100 && ' (must = 100%)'}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={suggestingCriteria ? <CircularProgress size={14} /> : <Sparkles size={14} />}
            onClick={handleSuggestCriteria}
            disabled={suggestingCriteria}
          >
            {suggestingCriteria ? 'Suggesting...' : 'AI Suggest Criteria'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Plus size={14} />}
            onClick={addCriterion}
          >
            Add
          </Button>
        </Box>
      </Box>

      {criteria.map((criterion, i) => (
        <Card key={i} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                  Criterion {i + 1}
                </Typography>
                {criteria.length > 1 && (
                  <IconButton size="small" onClick={() => removeCriterion(i)} sx={{ color: 'error.main' }}>
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '3fr 1fr' }, gap: 2 }}>
                <TextField
                  label="Label *"
                  placeholder="e.g., Technical Approach"
                  value={criterion.label}
                  onChange={(e) => updateCriterion(i, 'label', e.target.value)}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Weight %"
                  type="number"
                  inputProps={{ min: 0, max: 100 }}
                  value={criterion.weight}
                  onChange={(e) => updateCriterion(i, 'weight', Number(e.target.value))}
                  size="small"
                />
              </Box>

              <TextField
                label="Description"
                placeholder="What should applicants address..."
                value={criterion.description}
                onChange={(e) => updateCriterion(i, 'description', e.target.value)}
                fullWidth
                multiline
                minRows={2}
                size="small"
              />

              <TextField
                label="Instructions for Applicants"
                placeholder="Guidance on how to respond..."
                value={criterion.instructions}
                onChange={(e) => updateCriterion(i, 'instructions', e.target.value)}
                fullWidth
                multiline
                minRows={2}
                size="small"
              />

              <TextField
                label="Max Words"
                type="number"
                inputProps={{ min: 50, max: 5000 }}
                value={criterion.max_words}
                onChange={(e) => updateCriterion(i, 'max_words', Number(e.target.value))}
                size="small"
                sx={{ maxWidth: 140 }}
              />
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );

  const renderStep4Documents = () => (
    <Stack spacing={2}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Select which documents applicants must upload. Click a card to toggle it on, then add specific requirements.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {docReqs.map((doc, i) => (
          <Card
            key={doc.key}
            onClick={() => toggleDocReq(i)}
            sx={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: '1px solid',
              borderColor: doc.enabled ? 'primary.light' : 'divider',
              bgcolor: doc.enabled ? 'primary.50' : 'background.paper',
              '&:hover': {
                borderColor: doc.enabled ? 'primary.main' : 'action.hover',
                boxShadow: 1,
              },
            }}
          >
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Checkbox
                  checked={doc.enabled}
                  size="small"
                  sx={{ p: 0 }}
                  tabIndex={-1}
                />
                <Typography sx={{ fontSize: '1.25rem', lineHeight: 1 }}>{doc.icon}</Typography>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                    {doc.label}
                  </Typography>
                </Box>
              </Box>

              {doc.enabled && (
                <Box
                  sx={{ mt: 1.5, ml: 4.5 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <TextField
                    placeholder="Specific requirements for this document..."
                    value={doc.specific_requirements}
                    onChange={(e) => updateDocReq(i, 'specific_requirements', e.target.value)}
                    fullWidth
                    size="small"
                    sx={{ mb: 1 }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={doc.required}
                        onChange={(e) => updateDocReq(i, 'required', e.target.checked)}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Required (applicants must upload)
                      </Typography>
                    }
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        ))}
      </Box>
    </Stack>
  );

  const renderStep5Review = () => (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main', mb: 1 }}>
        <Info size={16} />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          Review your grant before publishing
        </Typography>
      </Box>

      {/* Validation warning if required fields are missing */}
      {(!basic.title.trim() || !basic.total_funding || !basic.deadline) && (
        <Alert severity="warning" sx={{ mb: 0 }}>
          <strong>Required fields missing:</strong>{' '}
          {[
            !basic.title.trim() && 'Title',
            !basic.total_funding && 'Funding Amount',
            !basic.deadline && 'Deadline',
          ].filter(Boolean).join(', ')}
          . Go back to <strong>Basic Info</strong> (Step 2) to complete them before publishing.
        </Alert>
      )}

      {/* Basic Info Summary */}
      <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
            Basic Information
          </Typography>
          <Stack spacing={1}>
            <SummaryRow label="Title" value={basic.title || '(not set)'} />
            <SummaryRow
              label="Funding"
              value={
                basic.total_funding
                  ? `${basic.currency} ${Number(basic.total_funding).toLocaleString()}`
                  : '(not set)'
              }
            />
            <SummaryRow label="Deadline" value={basic.deadline || '(not set)'} />
            {basic.sectors.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Sectors</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'flex-end', maxWidth: '60%' }}>
                  {basic.sectors.map((s) => (
                    <Chip key={s} label={s} size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                  ))}
                </Box>
              </Box>
            )}
            {basic.countries.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Countries</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'flex-end', maxWidth: '60%' }}>
                  {basic.countries.map((c) => (
                    <Chip key={c} label={c} size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Eligibility Summary */}
      {eligibility.some((e) => e.enabled) && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
              Eligibility Requirements
            </Typography>
            <Stack spacing={1}>
              {eligibility
                .filter((e) => e.enabled)
                .map((e) => (
                  <Box key={e.key} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ color: 'text.primary' }}>{e.label}</Typography>
                      {e.details && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {e.details}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', ml: 2 }}>
                      {e.weight}%
                    </Typography>
                  </Box>
                ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Criteria Summary */}
      {criteria.some((c) => c.label.trim()) && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Evaluation Criteria
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 400,
                  color: criteriaWeightTotal === 100 ? 'success.main' : 'error.main',
                }}
              >
                ({criteriaWeightTotal}%)
              </Typography>
            </Box>
            <Stack spacing={1}>
              {criteria
                .filter((c) => c.label.trim())
                .map((c, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: 'text.primary' }}>{c.label}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{c.weight}%</Typography>
                  </Box>
                ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Document Requirements Summary */}
      {docReqs.some((d) => d.enabled) && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
              Required Documents
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {docReqs
                .filter((d) => d.enabled)
                .map((d) => (
                  <Chip
                    key={d.key}
                    label={d.label}
                    size="small"
                    variant="outlined"
                    color={d.required ? 'primary' : 'default'}
                    sx={{ fontSize: '0.6875rem' }}
                  />
                ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* AI Extracted Data Summary */}
      {extracted && (
        <Card sx={{ border: '1px solid', borderColor: 'info.light', bgcolor: 'info.50' }}>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Sparkles size={16} style={{ color: 'var(--mui-palette-info-main, #0288d1)' }} />
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                AI Extracted Data
              </Typography>
            </Box>

            {extracted.requirements && extracted.requirements.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>
                  Reporting Requirements ({extracted.requirements.length})
                </Typography>
                <Stack spacing={0.5}>
                  {extracted.requirements.map((req, i) => (
                    <Typography key={i} variant="caption" sx={{ color: 'text.secondary' }}>
                      {i + 1}. {req.title || req.description || 'Requirement'}
                      {req.frequency ? ` (${req.frequency})` : ''}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}

            {extracted.indicators && extracted.indicators.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>
                  KPIs / Indicators ({extracted.indicators.length})
                </Typography>
                <Stack spacing={0.5}>
                  {extracted.indicators.map((ind, i) => (
                    <Typography key={i} variant="caption" sx={{ color: 'text.secondary' }}>
                      {i + 1}. {ind.name || ind.description || 'Indicator'}
                      {ind.target ? ` — Target: ${ind.target}` : ''}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons — prominent publish */}
      <Card sx={{ border: '2px solid', borderColor: 'success.light', bgcolor: 'success.50', p: 0 }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.dark' }}>
              Ready to publish?
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Your grant will be visible to matched NGOs immediately
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="outlined"
              onClick={handleSaveDraft}
              disabled={saving || publishing}
              startIcon={saving ? <CircularProgress size={16} /> : <FileText size={16} />}
              sx={{ borderColor: 'divider' }}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              variant="contained"
              color="success"
              size="large"
              onClick={handlePublish}
              disabled={publishing || saving}
              startIcon={publishing ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />}
              sx={{ fontWeight: 700, px: 4 }}
            >
              {publishing ? 'Publishing...' : 'Publish Grant'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );

  // ---------------------------------------------------------------------------
  // Step Router
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Main Render
  // ---------------------------------------------------------------------------

  return (
    <Stack spacing={3} sx={{ maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          size="small"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/grants')}
          sx={{ color: 'text.secondary' }}
        >
          Back
        </Button>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Create New Grant
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            Step {step + 1} of {STEPS.length}: {STEPS[step].label}
            {saving && (
              <Box component="span" sx={{ ml: 1, color: 'info.main' }}>
                (Saving...)
              </Box>
            )}
          </Typography>
        </Box>
        {grantId && (
          <Chip
            label={`Draft #${grantId}`}
            size="small"
            variant="outlined"
            color="info"
            sx={{ fontSize: '0.75rem' }}
          />
        )}
      </Box>

      {/* MUI Stepper */}
      <Stepper activeStep={step} alternativeLabel>
        {STEPS.map((s) => (
          <Step key={s.label}>
            <StepLabel>{s.label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step Content */}
      <Card>
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
          {renderCurrentStep()}
        </CardContent>
      </Card>

      {/* Navigation (hidden on review step which has its own buttons) */}
      {step < STEPS.length - 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            startIcon={<ArrowLeft size={16} />}
            onClick={goBack}
            disabled={step === 0}
          >
            Previous
          </Button>

          <Button
            variant="contained"
            endIcon={<ArrowRight size={16} />}
            onClick={goNext}
          >
            Next
          </Button>
        </Box>
      )}

      {/* Back button on the review step */}
      {step === STEPS.length - 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<ArrowLeft size={16} />}
            onClick={goBack}
          >
            Previous
          </Button>
        </Box>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Helper: Summary Row
// ---------------------------------------------------------------------------

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>{value}</Typography>
    </Box>
  );
}
