'use client';

import { useState, useMemo, useRef } from 'react';
import { useReports, useUpcomingReports } from '@/lib/hooks/use-api';
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

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

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
// Main Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { data: reportData, isLoading: reportsLoading, mutate: mutateReports } = useReports();
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingReports();
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
          Reports & Compliance
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {overallCompliance > 0
              ? `${overallCompliance}% compliant`
              : `${reports.length} reports total`}
          </Typography>
          {overdueCount > 0 && (
            <Chip
              label={`${overdueCount} overdue`}
              color="error"
              size="small"
              variant="outlined"
            />
          )}
        </Box>
      </Box>

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 3 }}>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{reports.length}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Total Reports</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{submittedCount}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Submitted</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{pendingCount}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Pending</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: overdueCount > 0 ? 'error.main' : 'text.primary' }}>
              {overdueCount}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Overdue</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Overall Compliance Progress */}
      {overallCompliance > 0 && (
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Overall Compliance
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
          <Tab label="By Grant" />
          <Tab label="Timeline" />
        </Tabs>

        {/* By Grant Tab */}
        {tabValue === 0 && (
          <Stack spacing={2} sx={{ mt: 3 }}>
            {reportsByGrant.length === 0 ? (
              <Box sx={{ py: 10, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  No reports yet
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                  Reports will appear once you have awarded grants with reporting requirements.
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
                  No upcoming deadlines
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
              {group.reports.length} deliverable{group.reports.length !== 1 ? 's' : ''} / {completedCount} completed
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
                <TableCell>Report</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Due Date</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Score</TableCell>
                <TableCell align="right">Action</TableCell>
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
              Upload
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
            {report.status === 'accepted' ? 'Accepted' : 'Submitted'}
          </Typography>
        )}
      </TableCell>
    </TableRow>
  );
}
