'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAssessmentFrameworks } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
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
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';

import {
  ArrowLeft, ArrowRight, Building2, ClipboardList, Upload,
  BarChart3, Play, CheckCircle, AlertCircle,
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

const STEPS = ['Org Profile', 'Compliance', 'Documents', 'Results'];

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

  // Generate checklist items from real backend framework keys
  const checklistCategories = useMemo(() => {
    if (!frameworkInfo) return [];
    // Use real item keys from category_items (populated by scoring engine)
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
    // Fallback to generic items if category_items not available
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
      // Backend returns {success, assessment: {...}} — assessment has scores inside
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

      // Upload documents using the correct endpoint + doc type mapping
      const docTypeMap: Record<string, string> = {
        registration: 'registration_certificate',
        financial: 'financial_report',
        audit: 'audit_report',
        psea: 'policy_document',
        strategic_plan: 'policy_document',
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

      // Map category_scores from {score,met,total,weight} objects to flat numbers
      const catScores: Record<string, number> = {};
      for (const [k, v] of Object.entries(res.assessment?.category_scores ?? {})) {
        catScores[k] = typeof v === 'number' ? v : v.score;
      }

      setResults({
        overall_score: res.assessment?.overall_score ?? 0,
        category_scores: catScores,
        gaps: (res.assessment?.gaps ?? []).map((g) =>
          typeof g === 'string' ? g : g.label,
        ),
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
      <Stack spacing={3}>
        <Skeleton variant="text" width={200} height={32} />
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  // ---------------------------------------------------------------------------
  // Framework Selection (before wizard starts)
  // ---------------------------------------------------------------------------

  if (!selectedFramework) {
    return (
      <Stack spacing={3}>
        <Button
          size="small"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/assessments')}
          sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
        >
          Back to Assessments
        </Button>

        <Box>
          <Typography variant="h2" sx={{ color: 'text.primary' }}>
            Select Framework
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Choose a capacity assessment framework to begin
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          {FRAMEWORK_OPTIONS.map((opt) => {
            const info = frameworks[opt.key] as FrameworkInfo | undefined;
            return (
              <Card
                key={opt.key}
                onClick={() => setSelectedFramework(opt.key)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { boxShadow: 3, borderColor: 'primary.light' },
                  transition: 'all 0.2s',
                }}
              >
                <CardContent sx={{ py: 4, '&:last-child': { pb: 4 } }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {opt.label}
                  </Typography>
                  {info && (
                    <>
                      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                        {info.description}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mt: 1.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>{info.estimated_time}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>{info.total_items} items</Typography>
                      </Box>
                    </>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    fullWidth
                    startIcon={<Play size={12} />}
                    sx={{ mt: 2 }}
                  >
                    Select
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </Stack>
    );
  }

  // ---------------------------------------------------------------------------
  // Wizard
  // ---------------------------------------------------------------------------

  return (
    <Stack spacing={3}>
      {/* Back & Title */}
      <Button
        size="small"
        startIcon={<ArrowLeft size={16} />}
        onClick={() => router.push('/assessments')}
        sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
      >
        Back to Assessments
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h2" sx={{ color: 'text.primary' }}>
            Capacity Assessment
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Framework: {FRAMEWORK_OPTIONS.find((f) => f.key === selectedFramework)?.label}
          </Typography>
        </Box>
        {currentStep < 4 && (
          <Button variant="outlined" size="small" onClick={() => setSelectedFramework('')}>
            Change Framework
          </Button>
        )}
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            variant="outlined"
            disabled={currentStep === 1}
            startIcon={<ArrowLeft size={16} />}
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          >
            Previous
          </Button>
          {currentStep < 3 ? (
            <Button
              variant="contained"
              endIcon={<ArrowRight size={16} />}
              onClick={() => setCurrentStep((s) => s + 1)}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <BarChart3 size={16} />}
              onClick={handleSubmitAssessment}
            >
              {submitting ? 'Analyzing...' : 'Submit & Get Results'}
            </Button>
          )}
        </Box>
      )}

      {currentStep === 4 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button variant="outlined" onClick={() => router.push('/assessments')}>
            Back to Assessments
          </Button>
          <Button variant="contained" onClick={() => router.push('/grants')}>
            Browse Grants
          </Button>
        </Box>
      )}
    </Stack>
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
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Building2 size={16} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Organization Profile
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2.5 }}>
          Provide basic information about your organization
        </Typography>
        <Stack spacing={2.5}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
            <TextField
              label="Organization Name"
              size="small"
              fullWidth
              value={profile.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="Enter organization name"
            />
            <TextField
              label="Country"
              size="small"
              fullWidth
              value={profile.country}
              onChange={(e) => onChange('country', e.target.value)}
              placeholder="e.g., Kenya"
            />
            <TextField
              label="Year Established"
              size="small"
              fullWidth
              type="number"
              value={profile.year_established}
              onChange={(e) => onChange('year_established', e.target.value)}
              placeholder="e.g., 2010"
            />
            <TextField
              label="Annual Budget (USD)"
              size="small"
              fullWidth
              value={profile.annual_budget}
              onChange={(e) => onChange('annual_budget', e.target.value)}
              placeholder="e.g., 500000"
            />
            <TextField
              label="Staff Count"
              size="small"
              fullWidth
              value={profile.staff_count}
              onChange={(e) => onChange('staff_count', e.target.value)}
              placeholder="e.g., 50"
            />
            <TextField
              label="Sectors (comma-separated)"
              size="small"
              fullWidth
              value={profile.sectors}
              onChange={(e) => onChange('sectors', e.target.value)}
              placeholder="e.g., Health, Education, WASH"
            />
          </Box>
          <TextField
            label="Mission Statement"
            size="small"
            fullWidth
            multiline
            rows={3}
            value={profile.mission}
            onChange={(e) => onChange('mission', e.target.value)}
            placeholder="Describe your organization's mission..."
          />
        </Stack>
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
        <CardContent sx={{ py: 6, textAlign: 'center' }}>
          <ClipboardList size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No checklist items for this framework</Typography>
        </CardContent>
      </Card>
    );
  }

  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const checkedItems = Object.values(responses).filter(Boolean).length;
  const progressPct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {checkedItems} of {totalItems} items checked
        </Typography>
        <Chip
          label={`${progressPct}% Complete`}
          size="small"
          variant="outlined"
          color={checkedItems === totalItems ? 'success' : 'default'}
          sx={{ fontWeight: 500, fontSize: '0.6875rem' }}
        />
      </Box>

      <LinearProgress
        variant="determinate"
        value={progressPct}
        sx={{ borderRadius: 1, height: 6 }}
      />

      {categories.map((cat) => (
        <Card key={cat.category}>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
              {cat.category}
            </Typography>
            <Stack spacing={0.5}>
              {cat.items.map((item) => (
                <FormControlLabel
                  key={item.key}
                  control={
                    <Checkbox
                      checked={responses[item.key] || false}
                      onChange={(e) => onChange(item.key, e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {item.label}
                    </Typography>
                  }
                />
              ))}
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
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
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Upload size={16} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Supporting Documents
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2.5 }}>
          Upload documents to support your assessment (optional but recommended)
        </Typography>
        <Stack spacing={2}>
          {DOC_TYPES.map((doc) => {
            const upload = uploads[doc.key];
            return (
              <Box key={doc.key} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>{doc.label}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{doc.description}</Typography>
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
                      gap: 0.5,
                      p: 2.5,
                      border: '2px dashed',
                      borderColor: 'divider',
                      borderRadius: 2,
                      cursor: 'pointer',
                      '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                      transition: 'all 0.2s',
                    }}
                  >
                    <Upload size={20} color="#94A3B8" />
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Click to upload</Typography>
                    <input
                      type="file"
                      hidden
                      accept=".pdf,.doc,.docx"
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
    <Stack spacing={3}>
      {/* Overall Score */}
      <Card>
        <CardContent sx={{ py: 6, '&:last-child': { pb: 6 } }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ScoreRing score={Math.round(results.overall_score)} size={140} strokeWidth={10} label="Overall" />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mt: 3 }}>
              {results.overall_score >= 80
                ? 'Excellent Capacity'
                : results.overall_score >= 60
                ? 'Good Capacity'
                : results.overall_score >= 40
                ? 'Developing Capacity'
                : 'Needs Improvement'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {framework.toUpperCase().replace('_', '-')} Framework Assessment
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      {categoryEntries.length > 0 && (
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
              Category Breakdown
            </Typography>
            <Stack spacing={2}>
              {categoryEntries.map(([category, score]) => {
                const color = score >= 80 ? '#059669' : score >= 60 ? '#D97706' : '#E11D48';
                return (
                  <Box key={category}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>{category}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color }}>{Math.round(score)}%</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, score)}
                      sx={{
                        borderRadius: 1,
                        height: 8,
                        bgcolor: 'action.hover',
                        '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
                      }}
                    />
                  </Box>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Gaps */}
      {results.gaps.length > 0 && (
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <AlertCircle size={16} color="#D97706" />
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Areas for Improvement
              </Typography>
            </Box>
            <Stack spacing={1.5}>
              {results.gaps.map((gap, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      bgcolor: '#FFFBEB',
                      color: '#D97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      flexShrink: 0,
                      mt: 0.25,
                    }}
                  >
                    {i + 1}
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{gap}</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
