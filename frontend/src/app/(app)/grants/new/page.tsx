'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
import Divider from '@mui/material/Divider';

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
// Multi-Select Toggle Component (MUI Chips)
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
          <Stack spacing={3}>
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
              minRows={3}
              size="small"
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Funding Amount"
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

      case 1:
        return (
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Toggle the eligibility categories you want applicants to meet. Add details and set relative weights.
            </Typography>
            {eligibility.map((item, i) => (
              <Card
                key={item.key}
                sx={{
                  borderColor: item.enabled ? 'primary.light' : 'divider',
                  bgcolor: item.enabled ? 'primary.50' : 'background.paper',
                }}
              >
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: item.enabled ? 1.5 : 0 }}>
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
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main', minWidth: 40, textAlign: 'right' }}>
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
          </Stack>
        );

      case 2:
        return (
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  Total Weight: {criteriaWeightTotal}%
                  {criteriaWeightTotal !== 100 && ' (must equal 100%)'}
                </Typography>
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
              <Card key={i}>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                        Criterion {i + 1}
                      </Typography>
                      {criteria.length > 1 && (
                        <IconButton
                          size="small"
                          onClick={() => removeCriterion(i)}
                          sx={{ color: 'error.main' }}
                        >
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

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
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
                        label="Example Response"
                        placeholder="An example of a strong response..."
                        value={criterion.example}
                        onChange={(e) => updateCriterion(i, 'example', e.target.value)}
                        fullWidth
                        multiline
                        minRows={2}
                        size="small"
                      />
                    </Box>

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

      case 3:
        return (
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Select which documents applicants must upload with their application.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {docReqs.map((doc, i) => (
                <Card
                  key={doc.key}
                  onClick={() => toggleDocReq(i)}
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    borderColor: doc.required ? 'primary.light' : 'divider',
                    bgcolor: doc.required ? 'primary.50' : 'background.paper',
                    '&:hover': {
                      borderColor: doc.required ? 'primary.main' : 'action.hover',
                    },
                  }}
                >
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Checkbox
                        checked={doc.required}
                        size="small"
                        sx={{ p: 0 }}
                        tabIndex={-1}
                      />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                          {doc.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {doc.key}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Stack>
        );

      case 4:
        return (
          <Stack spacing={3}>
            <FormControl size="small" sx={{ maxWidth: 280 }}>
              <InputLabel>Reporting Frequency</InputLabel>
              <Select
                label="Reporting Frequency"
                value={reportingFrequency}
                onChange={(e) => setReportingFrequency(e.target.value)}
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <MenuItem key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                Reporting Requirements
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Plus size={14} />}
                onClick={addReportReq}
              >
                Add Requirement
              </Button>
            </Box>

            {reportReqs.length === 0 && (
              <Card>
                <CardContent sx={{ py: 6, textAlign: 'center' }}>
                  <FileText size={40} style={{ color: '#CBD5E1', margin: '0 auto 8px' }} />
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    No reporting requirements added yet.
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
                    Click &quot;Add Requirement&quot; to define what grantees must report.
                  </Typography>
                </CardContent>
              </Card>
            )}

            {reportReqs.map((req, i) => (
              <Card key={i}>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                        Requirement {i + 1}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => removeReportReq(i)}
                        sx={{ color: 'error.main' }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                      <TextField
                        label="Title *"
                        placeholder="e.g., Quarterly Narrative Report"
                        value={req.title}
                        onChange={(e) => updateReportReq(i, 'title', e.target.value)}
                        size="small"
                        fullWidth
                      />
                      <FormControl size="small" fullWidth>
                        <InputLabel>Type</InputLabel>
                        <Select
                          label="Type"
                          value={req.type}
                          onChange={(e) => updateReportReq(i, 'type', e.target.value)}
                        >
                          {REPORT_TYPE_OPTIONS.map((t) => (
                            <MenuItem key={t} value={t}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>

                    <TextField
                      label="Description"
                      placeholder="Describe what the report should include..."
                      value={req.description}
                      onChange={(e) => updateReportReq(i, 'description', e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                    />

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                      <FormControl size="small" fullWidth>
                        <InputLabel>Frequency</InputLabel>
                        <Select
                          label="Frequency"
                          value={req.frequency}
                          onChange={(e) => updateReportReq(i, 'frequency', e.target.value)}
                        >
                          {FREQUENCY_OPTIONS.map((f) => (
                            <MenuItem key={f} value={f}>
                              {f.charAt(0).toUpperCase() + f.slice(1)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label="Due Days After Period End"
                        type="number"
                        inputProps={{ min: 1, max: 180 }}
                        value={req.due_days}
                        onChange={(e) => updateReportReq(i, 'due_days', Number(e.target.value))}
                        size="small"
                        fullWidth
                      />
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        );

      case 5:
        return (
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main', mb: 1 }}>
              <Info size={16} />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Review your grant before publishing
              </Typography>
            </Box>

            {/* Basic Info Summary */}
            <Card>
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
                  Basic Information
                </Typography>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Title</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                      {basic.title || '(not set)'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Funding</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                      {basic.total_funding ? `${basic.currency} ${Number(basic.total_funding).toLocaleString()}` : '(not set)'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Deadline</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                      {basic.deadline || '(not set)'}
                    </Typography>
                  </Box>
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
              <Card>
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
                    Eligibility Requirements
                  </Typography>
                  <Stack spacing={1}>
                    {eligibility
                      .filter((e) => e.enabled)
                      .map((e) => (
                        <Box key={e.key} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ color: 'text.primary' }}>{e.label}</Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Weight: {e.weight}%</Typography>
                        </Box>
                      ))}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Criteria Summary */}
            {criteria.some((c) => c.label.trim()) && (
              <Card>
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

            {/* Documents Summary */}
            {docReqs.some((d) => d.required) && (
              <Card>
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
                    Required Documents
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {docReqs
                      .filter((d) => d.required)
                      .map((d) => (
                        <Chip key={d.key} label={d.label} size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                      ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Reporting Summary */}
            <Card>
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}>
                  Reporting
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Frequency: <Box component="span" sx={{ fontWeight: 500 }}>{reportingFrequency}</Box>
                  {' | '}
                  Requirements: <Box component="span" sx={{ fontWeight: 500 }}>{reportReqs.length}</Box>
                </Typography>
              </CardContent>
            </Card>

            {error && (
              <Alert severity="error">{error}</Alert>
            )}
          </Stack>
        );

      default:
        return null;
    }
  };

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
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Create New Grant
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            Step {step + 1} of {STEPS.length}: {STEPS[step].label}
          </Typography>
        </Box>
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
          {renderStep()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button
          variant="outlined"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Previous
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            variant="contained"
            endIcon={<ArrowRight size={16} />}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            endIcon={<Send size={16} />}
            onClick={handlePublish}
            disabled={submitting || !basic.title.trim()}
          >
            {submitting ? 'Publishing...' : 'Publish Grant'}
          </Button>
        )}
      </Box>
    </Stack>
  );
}
