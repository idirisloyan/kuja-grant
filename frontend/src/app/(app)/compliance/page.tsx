'use client';

import { useState, useMemo } from 'react';
import { useGrants, useReports } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { StatCard } from '@/components/shared/stat-card';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import LinearProgress from '@mui/material/LinearProgress';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import {
  ShieldCheck, AlertTriangle, Clock, BarChart3,
  FileText, TrendingUp,
} from 'lucide-react';
import type { Grant, Report } from '@/lib/types';

// ---------------------------------------------------------------------------
// Risk indicator helper
// ---------------------------------------------------------------------------

function getRiskLevel(score: number | null, status: string, dueDate: string | null): 'green' | 'amber' | 'red' {
  const isOverdue = dueDate ? new Date(dueDate) < new Date() : false;
  if (status === 'revision_requested' || isOverdue) return 'red';
  if (score !== null && score < 60) return 'red';
  if (score !== null && score < 80) return 'amber';
  if (status === 'draft' || status === 'submitted') return 'amber';
  return 'green';
}

function RiskDot({ level }: { level: 'green' | 'amber' | 'red' }) {
  const colorMap = {
    green: 'success.main',
    amber: 'warning.main',
    red: 'error.main',
  };
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: colorMap[level],
        flexShrink: 0,
      }}
    />
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Grant Accordion Component
// ---------------------------------------------------------------------------

function GrantAccordionItem({ grant, reports }: { grant: Grant; reports: Report[] }) {
  const { t } = useTranslation();
  // Group reports by org
  const orgMap = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of reports) {
      const key = r.org_name || `Org #${r.submitted_by_org_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [reports]);

  // Calculate grant-level compliance
  const scores = reports
    .map((r) => {
      const analysis = r.ai_analysis as Record<string, unknown> | null;
      return analysis && typeof analysis === 'object' && 'compliance_score' in analysis
        ? Number(analysis.compliance_score)
        : null;
    })
    .filter((s): s is number => s !== null);

  const avgCompliance = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const overdueCount = reports.filter((r) => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'accepted').length;

  return (
    <Accordion
      disableGutters
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        '&:before': { display: 'none' },
        boxShadow: 'none',
        '&:not(:last-child)': { mb: 0 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          px: 2.5,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', mr: 2 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {grant.title}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}>
              {orgMap.size} {t('compliance.grantees')} | {reports.length} {t('report.deliverables')}
              {overdueCount > 0 && (
                <Box component="span" sx={{ color: 'error.main', ml: 1 }}>| {overdueCount} {t('compliance.overdue')}</Box>
              )}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ScoreRing score={avgCompliance} size={48} strokeWidth={4} label="Compl." />
            <StatusBadge status={grant.status} />
          </Box>
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ px: 2.5, pb: 2.5 }}>
        {Array.from(orgMap.entries()).map(([orgName, orgReports]) => (
          <Box key={orgName} sx={{ mb: 2, '&:last-child': { mb: 0 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <FileText size={14} style={{ color: '#4F46E5' }} />
              <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                {orgName}
              </Typography>
            </Box>
            <Stack spacing={0.75} sx={{ ml: 3 }}>
              {orgReports.map((report) => {
                const analysis = report.ai_analysis as Record<string, unknown> | null;
                const score = analysis && typeof analysis === 'object' && 'compliance_score' in analysis
                  ? Number(analysis.compliance_score)
                  : null;
                const risk = getRiskLevel(score, report.status, report.due_date);
                return (
                  (() => {
                    const isOverdue = report.due_date && new Date(report.due_date) < new Date() && report.status !== 'accepted';
                    const daysOverdue = isOverdue && report.due_date
                      ? Math.floor((new Date().getTime() - new Date(report.due_date).getTime()) / (1000 * 60 * 60 * 24))
                      : 0;
                    return (
                      <Box
                        key={report.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          py: 1,
                          px: 1.5,
                          borderRadius: 1,
                          bgcolor: isOverdue ? 'rgba(239,68,68,0.04)' : 'action.hover',
                          borderLeft: isOverdue ? '3px solid' : 'none',
                          borderLeftColor: isOverdue ? 'error.main' : undefined,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                          {isOverdue ? (
                            <Box
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                bgcolor: 'error.main',
                                flexShrink: 0,
                                animation: 'pulse 2s ease-in-out infinite',
                                '@keyframes pulse': {
                                  '0%, 100%': { opacity: 1 },
                                  '50%': { opacity: 0.4 },
                                },
                              }}
                            />
                          ) : (
                            <RiskDot level={risk} />
                          )}
                          <Typography variant="body2" noWrap sx={{ color: 'text.primary' }}>
                            {report.title}
                          </Typography>
                          <Chip label={report.report_type} size="small" variant="outlined" sx={{ fontSize: '0.6875rem', flexShrink: 0 }} />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                          {isOverdue && daysOverdue > 0 && (
                            <Chip
                              label={`${daysOverdue}d overdue`}
                              size="small"
                              color="error"
                              sx={{ fontSize: '0.625rem', height: 20, fontWeight: 600 }}
                            />
                          )}
                          {score !== null && (
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 500,
                                color: score >= 80 ? 'success.main' : score >= 60 ? 'warning.main' : 'error.main',
                              }}
                            >
                              {score}%
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ color: isOverdue ? 'error.main' : 'text.disabled' }}>
                            Due: {formatDate(report.due_date)}
                          </Typography>
                          <StatusBadge status={report.status} />
                        </Box>
                      </Box>
                    );
                  })()
                );
              })}
            </Stack>
          </Box>
        ))}

        {orgMap.size === 0 && (
          <Typography variant="body2" sx={{ color: 'text.disabled', textAlign: 'center', py: 3 }}>
            {t('compliance.no_reports_for_grant')}
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CompliancePage() {
  const { t } = useTranslation();
  const { data: grantsData, isLoading: grantsLoading } = useGrants();
  const { data: reportsData, isLoading: reportsLoading } = useReports();

  const isLoading = grantsLoading || reportsLoading;
  const grants = grantsData?.grants ?? [];
  const reports = reportsData?.reports ?? [];

  // Group reports by grant
  const reportsByGrant = useMemo(() => {
    const map = new Map<number, Report[]>();
    for (const r of reports) {
      if (!map.has(r.grant_id)) map.set(r.grant_id, []);
      map.get(r.grant_id)!.push(r);
    }
    return map;
  }, [reports]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const allScores = reports
      .map((r) => {
        const analysis = r.ai_analysis as Record<string, unknown> | null;
        return analysis && typeof analysis === 'object' && 'compliance_score' in analysis
          ? Number(analysis.compliance_score)
          : null;
      })
      .filter((s): s is number => s !== null);

    const avgCompliance = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;

    const overdueItems = reports.filter(
      (r) => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'accepted',
    ).length;

    const atRiskCount = reports.filter((r) => {
      const analysis = r.ai_analysis as Record<string, unknown> | null;
      const score = analysis && typeof analysis === 'object' && 'compliance_score' in analysis
        ? Number(analysis.compliance_score)
        : null;
      return getRiskLevel(score, r.status, r.due_date) === 'red';
    }).length;

    return {
      totalGrants: grants.length,
      avgCompliance,
      overdueItems,
      atRiskCount,
    };
  }, [grants, reports]);

  if (isLoading) {
    return (
      <Stack spacing={3}>
        <Skeleton variant="text" width={260} height={36} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={112} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
        <Stack spacing={2}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Header with risk summary */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {t('compliance.dashboard_title')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {t('compliance.dashboard_subtitle')}
        </Typography>
      </Box>

      {/* Risk Summary Banner */}
      {(summaryStats.overdueItems > 0 || summaryStats.atRiskCount > 0) && (
        <Card sx={{ borderLeft: '4px solid', borderLeftColor: 'error.main', bgcolor: 'error.50' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <AlertTriangle size={20} style={{ color: '#DC2626' }} />
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {summaryStats.overdueItems > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.dark' }}>
                    {summaryStats.overdueItems}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'error.dark' }}>
                    {t('compliance.overdue')}
                  </Typography>
                </Box>
              )}
              {summaryStats.atRiskCount > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                    {summaryStats.atRiskCount}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'warning.dark' }}>
                    at risk
                  </Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {reports.filter((r) => r.status === 'accepted').length}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('compliance.on_track')}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
        <StatCard
          icon={ShieldCheck}
          label={t('compliance.total_grants')}
          value={summaryStats.totalGrants}
          color="brand"
        />
        <StatCard
          icon={TrendingUp}
          label={t('compliance.avg_compliance')}
          value={`${summaryStats.avgCompliance}%`}
          color="emerald"
        />
        <StatCard
          icon={Clock}
          label={t('compliance.overdue_items')}
          value={summaryStats.overdueItems}
          color="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label={t('compliance.at_risk')}
          value={summaryStats.atRiskCount}
          color="rose"
        />
      </Box>

      {/* Grant Accordions */}
      <Stack spacing={1.5}>
        {grants.length === 0 ? (
          <Card>
            <CardContent sx={{ py: 8, textAlign: 'center' }}>
              <BarChart3 size={48} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
              <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                {t('compliance.no_grants')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
                {t('compliance.no_grants_hint')}
              </Typography>
            </CardContent>
          </Card>
        ) : (
          grants.map((grant) => (
            <GrantAccordionItem
              key={grant.id}
              grant={grant}
              reports={reportsByGrant.get(grant.id) ?? []}
            />
          ))
        )}
      </Stack>
    </Stack>
  );
}
