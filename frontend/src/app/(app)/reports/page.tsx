'use client';

import { useState, useMemo, useRef } from 'react';
import { useReports, useUpcomingReports } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';
import type { Report } from '@/lib/types';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Collapse from '@mui/material/Collapse';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysUntil(dateStr: string | null): number {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getDeadlineText(dateStr: string | null): { label: string; color: string } {
  if (!dateStr) return { label: '', color: 'text.secondary' };
  const days = getDaysUntil(dateStr);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'error.main' };
  if (days === 0) return { label: 'Due today', color: 'error.main' };
  if (days <= 7) return { label: `${days}d left`, color: 'error.main' };
  if (days <= 30) return { label: `${days}d left`, color: 'warning.main' };
  return { label: `${days}d left`, color: 'text.secondary' };
}

function getUrgencyColor(dateStr: string): string {
  const days = getDaysUntil(dateStr);
  if (days < 0) return '#EF4444'; // red - overdue
  if (days <= 7) return '#F59E0B'; // amber - due within 7 days
  if (days <= 30) return '#3B82F6'; // blue - due within 30 days
  return '#9CA3AF'; // gray - future
}

// ---------------------------------------------------------------------------
// Report Status Chip
// ---------------------------------------------------------------------------

function ReportStatusChip({ status }: { status: string }) {
  const colorMap: Record<string, 'success' | 'info' | 'warning' | 'default'> = {
    accepted: 'success',
    submitted: 'info',
    under_review: 'warning',
    revision_requested: 'warning',
    draft: 'default',
  };

  const labels: Record<string, string> = {
    accepted: 'Accepted',
    submitted: 'Submitted',
    under_review: 'Review',
    revision_requested: 'Revise',
    draft: 'Draft',
  };

  return (
    <Chip
      label={labels[status] ?? status}
      color={colorMap[status] ?? 'default'}
      size="small"
      variant="outlined"
    />
  );
}

// ---------------------------------------------------------------------------
// Compliance Calendar Component
// ---------------------------------------------------------------------------

interface CalendarDeadline {
  report: Report;
  grantTitle: string;
}

function ComplianceCalendar({ reports, reportsByGrant }: {
  reports: Report[];
  reportsByGrant: Array<{ grantId: number; grantTitle: string; reports: Report[] }>;
}) {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDeadline[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Build a map of date -> deadlines for the current month
  const deadlineMap = useMemo(() => {
    const map = new Map<string, CalendarDeadline[]>();
    reportsByGrant.forEach((group) => {
      group.reports.forEach((r) => {
        if (!r.due_date) return;
        const d = new Date(r.due_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ report: r, grantTitle: group.grantTitle });
      });
    });
    return map;
  }, [reportsByGrant]);

  // Calendar grid computation
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDayOfMonth = new Date(year, month, 1);
  // Monday = 0
  const startDow = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Build weeks
  const cells: Array<{ day: number | null; dateKey: string }> = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({ day: null, dateKey: '' });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateKey });
  }
  // Pad to complete week
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateKey: '' });
  }

  const handleDayClick = (event: React.MouseEvent<HTMLElement>, dateKey: string) => {
    const deadlines = deadlineMap.get(dateKey);
    if (deadlines && deadlines.length > 0) {
      setAnchorEl(event.currentTarget);
      setSelectedDay(deadlines);
      setSelectedDate(dateKey);
    }
  };

  const handleClosePopover = () => {
    setAnchorEl(null);
    setSelectedDay([]);
  };

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <Card>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('report.calendar')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('report.calendar_subtitle')}
            </Typography>
          </Box>
          {/* Legend */}
          <Stack direction="row" spacing={1.5} sx={{ display: { xs: 'none', sm: 'flex' } }}>
            {[
              { color: '#EF4444', label: t('common.overdue') },
              { color: '#F59E0B', label: '< 7d' },
              { color: '#3B82F6', label: '< 30d' },
              { color: '#9CA3AF', label: '30d+' },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        {/* Month navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1.5 }}>
          <IconButton size="small" onClick={prevMonth}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 140, textAlign: 'center' }}>
            {monthName}
          </Typography>
          <IconButton size="small" onClick={nextMonth}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Day headers */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 0,
          }}
        >
          {dayHeaders.map((d) => (
            <Box key={d} sx={{ textAlign: 'center', py: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.65rem' }}>
                {d}
              </Typography>
            </Box>
          ))}

          {/* Calendar cells */}
          {cells.map((cell, i) => {
            if (cell.day === null) {
              return <Box key={`empty-${i}`} sx={{ py: 1 }} />;
            }
            const deadlines = deadlineMap.get(cell.dateKey);
            const hasDeadlines = deadlines && deadlines.length > 0;
            const isToday = cell.dateKey === todayKey;

            // Get the most urgent color for multi-deadline days
            let dotColor = '';
            if (hasDeadlines) {
              const colors = deadlines.map((dl) => getUrgencyColor(dl.report.due_date!));
              // Priority: red > amber > blue > gray
              if (colors.includes('#EF4444')) dotColor = '#EF4444';
              else if (colors.includes('#F59E0B')) dotColor = '#F59E0B';
              else if (colors.includes('#3B82F6')) dotColor = '#3B82F6';
              else dotColor = '#9CA3AF';
            }

            return (
              <Box
                key={cell.dateKey}
                onClick={hasDeadlines ? (e) => handleDayClick(e, cell.dateKey) : undefined}
                sx={{
                  textAlign: 'center',
                  py: 0.75,
                  cursor: hasDeadlines ? 'pointer' : 'default',
                  borderRadius: 1,
                  position: 'relative',
                  '&:hover': hasDeadlines ? { bgcolor: 'action.hover' } : {},
                  ...(isToday && {
                    bgcolor: 'primary.50',
                    border: '1px solid',
                    borderColor: 'primary.200',
                  }),
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'primary.main' : 'text.primary',
                    fontSize: '0.75rem',
                  }}
                >
                  {cell.day}
                </Typography>
                {hasDeadlines && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 0.25,
                      mt: 0.25,
                    }}
                  >
                    {deadlines.length <= 3 ? (
                      deadlines.map((dl, idx) => (
                        <Box
                          key={idx}
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: getUrgencyColor(dl.report.due_date!),
                          }}
                        />
                      ))
                    ) : (
                      <>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dotColor }} />
                        <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.secondary', lineHeight: '6px' }}>
                          +{deadlines.length - 1}
                        </Typography>
                      </>
                    )}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Popover for day details */}
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={handleClosePopover}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          slotProps={{ paper: { sx: { p: 2, maxWidth: 320, borderRadius: 2 } } }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
            {selectedDate && new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Typography>
          <Stack spacing={1}>
            {selectedDay.map((dl, i) => {
              const urgencyColor = getUrgencyColor(dl.report.due_date!);
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: urgencyColor, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                      {dl.report.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                      {dl.grantTitle}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', minWidth: 0, px: 1 }}
                  >
                    {dl.report.status === 'draft' ? t('report.continue_draft') : t('report.start_report')}
                  </Button>
                </Box>
              );
            })}
          </Stack>
        </Popover>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AI Report Guidance Panel
// ---------------------------------------------------------------------------

function AIReportGuidancePanel({ report }: { report: Report }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [sectionContent, setSectionContent] = useState('');
  const [requirement, setRequirement] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    quality_score: number;
    guidance: string;
  } | null>(null);

  const handleGetFeedback = async () => {
    if (!sectionContent.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await api.post<{
        success: boolean;
        guidance: string;
        quality_score: number;
      }>('/ai/guidance', {
        field_name: report.report_type || 'report_section',
        grant_criteria: requirement || undefined,
        current_text: sectionContent,
      });
      setResult({
        quality_score: resp.quality_score || 0,
        guidance: resp.guidance || '',
      });
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = result
    ? result.quality_score >= 80
      ? 'success'
      : result.quality_score >= 60
        ? 'warning'
        : 'error'
    : 'default';

  // Parse guidance into strengths and suggestions
  const { strengths, suggestions } = useMemo(() => {
    if (!result?.guidance) return { strengths: [] as string[], suggestions: [] as string[] };
    const lines = result.guidance.split('\n').filter((l) => l.trim());
    const s: string[] = [];
    const sugg: string[] = [];
    let section = 'suggestions';
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('strength') || lower.includes('good') || lower.includes('well')) {
        section = 'strengths';
      }
      if (lower.includes('suggestion') || lower.includes('improve') || lower.includes('consider') || lower.includes('recommend')) {
        section = 'suggestions';
      }
      const cleaned = line.replace(/^[-*\u2022]\s*/, '').trim();
      if (cleaned.length < 5) continue;
      if (section === 'strengths') s.push(cleaned);
      else sugg.push(cleaned);
    }
    // If no clear separation, put everything as suggestions
    if (s.length === 0 && sugg.length === 0) {
      return { strengths: [], suggestions: lines.map((l) => l.replace(/^[-*\u2022]\s*/, '').trim()).filter((l) => l.length > 4) };
    }
    return { strengths: s, suggestions: sugg };
  }, [result]);

  if (report.status !== 'draft') return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        startIcon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
        onClick={() => setOpen(!open)}
        sx={{ fontSize: '0.75rem', color: 'primary.main' }}
      >
        {t('report.ai_guidance')}
      </Button>
      <Collapse in={open}>
        <Card variant="outlined" sx={{ mt: 1, borderColor: 'primary.100' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main', mb: 1, display: 'block' }}>
              {t('report.ai_guidance_subtitle')}
            </Typography>

            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              placeholder={t('report.donor_requirement')}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              sx={{ mb: 1 }}
              label={t('report.donor_requirement')}
            />
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={3}
              maxRows={6}
              placeholder={t('report.section_content')}
              value={sectionContent}
              onChange={(e) => setSectionContent(e.target.value)}
              sx={{ mb: 1.5 }}
              label={t('report.section_content')}
            />

            <Button
              size="small"
              variant="contained"
              onClick={handleGetFeedback}
              disabled={loading || !sectionContent.trim()}
              startIcon={loading ? <CircularProgress size={14} /> : <AutoAwesomeIcon sx={{ fontSize: 14 }} />}
              sx={{ fontSize: '0.75rem' }}
            >
              {loading ? t('report.analyzing') : t('report.get_ai_feedback')}
            </Button>

            {result && (
              <Box sx={{ mt: 2 }}>
                {/* Score chip */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {t('report.quality_score')}:
                  </Typography>
                  <Chip
                    label={`${result.quality_score}/100`}
                    size="small"
                    color={scoreColor as 'success' | 'warning' | 'error' | 'default'}
                  />
                </Box>

                {/* Strengths */}
                {strengths.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main', mb: 0.5, display: 'block' }}>
                      {t('report.strengths')}
                    </Typography>
                    {strengths.map((s, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}>
                        <CheckCircleOutlineIcon sx={{ fontSize: 14, color: 'success.main', mt: 0.25 }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{s}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Suggestions */}
                {suggestions.length > 0 && (
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.main', mb: 0.5, display: 'block' }}>
                      {t('report.suggestions')}
                    </Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2 }}>
                      {suggestions.map((s, i) => (
                        <Typography key={i} component="li" variant="caption" sx={{ color: 'text.secondary', mb: 0.25 }}>
                          {s}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      </Collapse>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { data: reportData, isLoading: reportsLoading, mutate: mutateReports } = useReports();
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingReports();
  const { t } = useTranslation();
  const [tabValue, setTabValue] = useState(0);

  const reports = useMemo(() => reportData?.reports ?? [], [reportData]);
  const overdueCount = upcomingData?.overdue_count ?? 0;
  const isLoading = reportsLoading || upcomingLoading;

  // Group reports by grant
  const reportsByGrant = useMemo(() => {
    const groups: Record<string, { grantId: number; grantTitle: string; reports: Report[] }> = {};
    for (const r of reports) {
      const key = String(r.grant_id);
      if (!groups[key]) {
        groups[key] = {
          grantId: r.grant_id,
          grantTitle: r.grant_title || `Grant #${r.grant_id}`,
          reports: [],
        };
      }
      groups[key].reports.push(r);
    }
    return Object.values(groups);
  }, [reports]);

  // Overall compliance
  const overallCompliance = useMemo(() => {
    const scored = reports.filter(
      (r) => r.ai_analysis && (r.ai_analysis as Record<string, unknown>).score !== undefined,
    );
    if (scored.length === 0) return 0;
    const total = scored.reduce(
      (sum, r) => sum + (Number((r.ai_analysis as Record<string, unknown>).score) || 0),
      0,
    );
    return Math.round(total / scored.length);
  }, [reports]);

  // Timeline items (next 90 days)
  const timelineItems = useMemo(() => {
    const items: Array<{
      report: Report;
      grantTitle: string;
      daysLeft: number;
    }> = [];

    reportsByGrant.forEach((group) => {
      group.reports.forEach((r) => {
        if (!r.due_date) return;
        const days = getDaysUntil(r.due_date);
        if (days >= -7 && days <= 90) {
          items.push({ report: r, grantTitle: group.grantTitle, daysLeft: days });
        }
      });
    });

    items.sort((a, b) => a.daysLeft - b.daysLeft);
    return items;
  }, [reportsByGrant]);

  if (isLoading) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 960 }}>
        <Skeleton variant="text" width={260} height={36} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  const submittedCount = reports.filter((r) => r.status === 'submitted' || r.status === 'accepted').length;
  const pendingCount = reports.filter((r) => r.status === 'draft').length;

  return (
    <Stack spacing={4} sx={{ maxWidth: 960 }}>
      {/* Header */}
      <Box>
        <Typography variant="h2" sx={{ color: 'text.primary' }}>
          {t('report.reports_compliance')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {overallCompliance > 0
              ? t('report.compliant', { score: overallCompliance })
              : t('report.reports_total', { count: reports.length })}
          </Typography>
          {overdueCount > 0 && (
            <Chip
              label={`${overdueCount} ${t('common.overdue').toLowerCase()}`}
              color="error"
              size="small"
              variant="outlined"
            />
          )}
        </Box>
      </Box>

      {/* Compliance Calendar */}
      <ComplianceCalendar reports={reports} reportsByGrant={reportsByGrant} />

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 3 }}>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{reports.length}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{t('report.total_reports')}</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{submittedCount}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{t('report.submitted')}</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{pendingCount}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{t('report.pending')}</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: overdueCount > 0 ? 'error.main' : 'text.primary' }}>
              {overdueCount}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{t('common.overdue')}</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Overall Compliance Progress */}
      {overallCompliance > 0 && (
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {t('report.overall_compliance')}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {overallCompliance}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={overallCompliance}
              color={overallCompliance >= 80 ? 'success' : overallCompliance >= 60 ? 'warning' : 'error'}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Box>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Tab label={t('report.by_grant')} />
          <Tab label={t('report.timeline')} />
        </Tabs>

        {/* By Grant Tab */}
        {tabValue === 0 && (
          <Stack spacing={2} sx={{ mt: 3 }}>
            {reportsByGrant.length === 0 ? (
              <Box sx={{ py: 10, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('report.no_reports_yet')}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                  {t('report.no_reports_hint')}
                </Typography>
              </Box>
            ) : (
              reportsByGrant.map((group) => (
                <GrantReportGroup
                  key={group.grantId}
                  group={group}
                  mutateReports={mutateReports}
                />
              ))
            )}
          </Stack>
        )}

        {/* Timeline Tab */}
        {tabValue === 1 && (
          <Box sx={{ mt: 3 }}>
            {timelineItems.length === 0 ? (
              <Box sx={{ py: 10, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('report.no_upcoming_deadlines')}
                </Typography>
              </Box>
            ) : (
              <Stack spacing={0}>
                {timelineItems.map((item) => {
                  const dl = getDeadlineText(item.report.due_date);
                  return (
                    <Box
                      key={item.report.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        py: 1.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:last-child': { borderBottom: 'none' },
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary', width: 80, flexShrink: 0 }}>
                        {formatDate(item.report.due_date)}
                      </Typography>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" noWrap sx={{ color: 'text.primary' }}>
                          {item.report.title}
                        </Typography>
                        <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>
                          {item.grantTitle}
                        </Typography>
                      </Box>
                      <Chip
                        label={item.report.report_type}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.6875rem', borderColor: 'divider' }}
                      />
                      <ReportStatusChip status={item.report.status} />
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, color: dl.color, flexShrink: 0 }}
                      >
                        {dl.label}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Grant Report Group (Accordion)
// ---------------------------------------------------------------------------

function GrantReportGroup({
  group,
  mutateReports,
}: {
  group: { grantId: number; grantTitle: string; reports: Report[] };
  mutateReports: () => void;
}) {
  const { t } = useTranslation();
  const scored = group.reports.filter(
    (r) => r.ai_analysis && (r.ai_analysis as Record<string, unknown>).score !== undefined,
  );
  const grantCompliance = scored.length > 0
    ? Math.round(
        scored.reduce(
          (sum, r) => sum + (Number((r.ai_analysis as Record<string, unknown>).score) || 0),
          0,
        ) / scored.length,
      )
    : 0;

  const completedCount = group.reports.filter(
    (r) => r.status === 'accepted' || r.status === 'submitted',
  ).length;

  return (
    <Accordion defaultExpanded>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 2.5 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, mr: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }} noWrap>
              {group.grantTitle}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {group.reports.length} {t('report.deliverables')} / {completedCount} {t('report.completed')}
            </Typography>
          </Box>
          {grantCompliance > 0 && (
            <Chip
              label={`${grantCompliance}%`}
              size="small"
              color={grantCompliance >= 80 ? 'success' : grantCompliance >= 60 ? 'warning' : 'error'}
              variant="outlined"
            />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('report.title')}</TableCell>
                <TableCell>{t('report.type')}</TableCell>
                <TableCell>{t('report.due_date')}</TableCell>
                <TableCell align="center">{t('report.status')}</TableCell>
                <TableCell align="center">{t('report.score')}</TableCell>
                <TableCell align="right">{t('report.action')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {group.reports.map((report) => (
                <ReportRow key={report.id} report={report} mutateReports={mutateReports} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

// ---------------------------------------------------------------------------
// Report Row
// ---------------------------------------------------------------------------

function ReportRow({
  report,
  mutateReports,
}: {
  report: Report;
  mutateReports: () => void;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dl = getDeadlineText(report.due_date);

  const aiScore = report.ai_analysis
    ? Number((report.ai_analysis as Record<string, unknown>).score) || null
    : null;

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload(`/reports/${report.id}/attachments`, formData);
      mutateReports();
    } catch {
      // Error handling
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
        {/* Title */}
        <TableCell>
          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
            {report.title}
          </Typography>
          {report.reporting_period && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>
              {report.reporting_period}
            </Typography>
          )}
        </TableCell>

        {/* Type */}
        <TableCell>
          <Chip
            label={report.report_type}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.6875rem', borderColor: 'divider' }}
          />
        </TableCell>

        {/* Due Date */}
        <TableCell>
          <Typography variant="body2" sx={{ color: 'text.primary' }}>
            {formatDate(report.due_date)}
          </Typography>
          <Typography variant="caption" sx={{ color: dl.color, fontWeight: 500 }}>
            {dl.label}
          </Typography>
        </TableCell>

        {/* Status */}
        <TableCell align="center">
          <ReportStatusChip status={report.status} />
        </TableCell>

        {/* Score */}
        <TableCell align="center">
          {aiScore !== null ? (
            <ScoreRing score={Math.round(aiScore)} size={28} strokeWidth={2.5} />
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>--</Typography>
          )}
        </TableCell>

        {/* Upload */}
        <TableCell align="right">
          {report.status === 'draft' ? (
            <>
              <Button
                size="small"
                startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileOutlined sx={{ fontSize: 16 }} />}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                sx={{ fontSize: '0.75rem' }}
              >
                {t('common.upload')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                style={{ display: 'none' }}
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {report.status === 'accepted' ? t('report.submitted') : t('report.submitted')}
            </Typography>
          )}
        </TableCell>
      </TableRow>
      {/* AI Guidance row for draft reports */}
      {report.status === 'draft' && (
        <TableRow>
          <TableCell colSpan={6} sx={{ py: 0, borderBottom: 'none' }}>
            <AIReportGuidancePanel report={report} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
