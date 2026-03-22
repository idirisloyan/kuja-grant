'use client';

import { useRouter } from 'next/navigation';
import { useAssessments, useAssessmentFrameworks } from '@/lib/hooks/use-api';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Avatar from '@mui/material/Avatar';

import {
  ClipboardCheck, Clock, ListChecks, ArrowRight, Play, TrendingUp, Award,
} from 'lucide-react';
import type { FrameworkInfo } from '@/lib/types';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getLevelLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Very Good';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Satisfactory';
  if (score >= 40) return 'Developing';
  return 'Needs Improvement';
}

const FRAMEWORK_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  kuja: { bg: '#EEF2FF', fg: '#4F46E5', border: '#C7D2FE' },
  step: { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0' },
  un_hact: { bg: '#EFF6FF', fg: '#2563EB', border: '#BFDBFE' },
  chs: { bg: '#FFFBEB', fg: '#D97706', border: '#FDE68A' },
  nupas: { bg: '#F5F3FF', fg: '#7C3AED', border: '#DDD6FE' },
};

const FRAMEWORK_ICONS: Record<string, string> = {
  kuja: 'K',
  step: 'S',
  un_hact: 'U',
  chs: 'C',
  nupas: 'N',
};

export default function AssessmentsPage() {
  const router = useRouter();
  const { data: assessData, isLoading: assessLoading } = useAssessments();
  const { data: fwData, isLoading: fwLoading } = useAssessmentFrameworks();

  const assessments = assessData?.assessments ?? [];
  const frameworks = fwData?.frameworks ?? {};

  const isLoading = assessLoading || fwLoading;

  // Calculate current score from most recent completed assessment
  const completedAssessments = assessments.filter((a) => a.status === 'completed' && a.overall_score !== null);
  const latestAssessment = completedAssessments.length > 0
    ? completedAssessments.sort((a, b) => {
        const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return dateB - dateA;
      })[0]
    : null;
  const currentScore = latestAssessment?.overall_score ?? 0;

  if (isLoading) {
    return (
      <Stack spacing={3}>
        <Skeleton variant="text" width={260} height={40} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 3fr' }, gap: 2 }}>
          <Skeleton variant="rounded" height={160} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={160} sx={{ borderRadius: 2 }} />
        </Box>
        <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h2" sx={{ color: 'text.primary' }}>
            Assessment Hub
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Measure and strengthen your organization&apos;s capacity
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Play size={16} />}
          onClick={() => router.push('/assessments/wizard')}
        >
          Start Assessment
        </Button>
      </Box>

      {/* Current Score Card + Summary */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 3fr' }, gap: 2 }}>
        <Card>
          <CardContent sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', '&:last-child': { pb: 4 } }}>
            <ScoreRing score={currentScore} size={120} strokeWidth={8} label="Score" />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mt: 2 }}>
              {getLevelLabel(currentScore)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Current Capacity Level
            </Typography>
            {latestAssessment && (
              <Chip
                label={`${latestAssessment.framework.toUpperCase()} Framework`}
                variant="outlined"
                size="small"
                sx={{ mt: 1.5, fontSize: '0.6875rem', bgcolor: 'action.hover', borderColor: 'divider' }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <TrendingUp size={16} />
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Assessment Summary
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
              <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>{assessments.length}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Total Assessments</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#ECFDF5', borderRadius: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#059669' }}>{completedAssessments.length}</Typography>
                <Typography variant="caption" sx={{ color: '#059669' }}>Completed</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#FFFBEB', borderRadius: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#D97706' }}>
                  {assessments.filter((a) => a.status !== 'completed').length}
                </Typography>
                <Typography variant="caption" sx={{ color: '#D97706' }}>In Progress</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#EEF2FF', borderRadius: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#4F46E5' }}>{Object.keys(frameworks).length}</Typography>
                <Typography variant="caption" sx={{ color: '#4F46E5' }}>Frameworks</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Framework Cards */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
          Assessment Frameworks
        </Typography>
        {Object.keys(frameworks).length === 0 ? (
          <Card>
            <CardContent sx={{ py: 6, textAlign: 'center' }}>
              <ClipboardCheck size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>No frameworks available</Typography>
            </CardContent>
          </Card>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(5, 1fr)' }, gap: 2 }}>
            {Object.entries(frameworks).map(([key, fw]) => {
              const info = fw as FrameworkInfo;
              const colors = FRAMEWORK_COLORS[key] || { bg: '#F8FAFC', fg: '#64748B', border: '#E2E8F0' };
              const icon = FRAMEWORK_ICONS[key] || '?';
              return (
                <Card key={key} sx={{ '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s' }}>
                  <CardContent sx={{ py: 3, '&:last-child': { pb: 3 } }}>
                    <Avatar
                      variant="rounded"
                      sx={{
                        width: 40,
                        height: 40,
                        bgcolor: colors.bg,
                        color: colors.fg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 2,
                        fontWeight: 700,
                        fontSize: '1.125rem',
                        mb: 1.5,
                      }}
                    >
                      {icon}
                    </Avatar>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      {info.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        mt: 0.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {info.description}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Clock size={12} /> {info.estimated_time}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <ListChecks size={12} /> {info.total_items} items
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      fullWidth
                      startIcon={<Play size={12} />}
                      onClick={() => router.push(`/assessments/wizard?framework=${key}`)}
                      sx={{ mt: 1.5 }}
                    >
                      Start Assessment
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Previous Assessments */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
          Previous Assessments
        </Typography>
        {assessments.length === 0 ? (
          <Card>
            <CardContent sx={{ py: 6, textAlign: 'center' }}>
              <Award size={40} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>No assessments completed yet</Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
                Start your first assessment to measure your capacity
              </Typography>
              <Button
                variant="outlined"
                size="small"
                endIcon={<ArrowRight size={16} />}
                onClick={() => router.push('/assessments/wizard')}
                sx={{ mt: 2 }}
              >
                Start Assessment
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Framework</TableCell>
                    <TableCell align="center">Score</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {assessments.map((a) => {
                    const colors = FRAMEWORK_COLORS[a.framework] || { bg: '#F8FAFC', fg: '#64748B', border: '#E2E8F0' };
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar
                              variant="rounded"
                              sx={{
                                width: 28,
                                height: 28,
                                bgcolor: colors.bg,
                                color: colors.fg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: 1,
                                fontWeight: 700,
                                fontSize: '0.75rem',
                              }}
                            >
                              {FRAMEWORK_ICONS[a.framework] || '?'}
                            </Avatar>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', textTransform: 'uppercase' }}>
                              {a.framework.replace('_', '-')}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          {a.overall_score !== null ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                              <ScoreRing score={Math.round(a.overall_score)} size={40} strokeWidth={3} />
                            </Box>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {formatDate(a.completed_at || a.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Box>
    </Stack>
  );
}
