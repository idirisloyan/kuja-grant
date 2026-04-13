'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardStats } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/hooks/use-translation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Avatar from '@mui/material/Avatar';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';

import { BarChart } from '@mui/x-charts/BarChart';

import {
  FileText, Search, ClipboardCheck, Calendar, ChevronRight,
  Briefcase, Star, TrendingUp, Users, Shield, BarChart3,
  PlusCircle, ArrowUpRight, AlertTriangle, CheckCircle, Clock,
  Send, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useDashboardStats();
  const router = useRouter();
  const stats = data?.stats as Record<string, unknown> | undefined;

  if (isLoading) {
    return (
      <Grid container spacing={3}>
        <Grid size={12}><Skeleton variant="rounded" height={100} /></Grid>
        {[1, 2, 3, 4].map((i) => (
          <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={i}><Skeleton variant="rounded" height={140} /></Grid>
        ))}
        <Grid size={{ xs: 12, lg: 8 }}><Skeleton variant="rounded" height={320} /></Grid>
        <Grid size={{ xs: 12, lg: 4 }}><Skeleton variant="rounded" height={320} /></Grid>
      </Grid>
    );
  }

  if (!user) return null;

  return (
    <>
      {user.role === 'ngo' && <NGODashboard stats={stats} userName={user.name} />}
      {user.role === 'donor' && <DonorDashboard stats={stats} userName={user.name} />}
      {user.role === 'reviewer' && <ReviewerDashboard stats={stats} userName={user.name} />}
      {user.role === 'admin' && <AdminDashboard stats={stats} userName={user.name} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function MetricCard({ icon: Icon, label, value, color, bgColor, href, trend }: {
  icon: LucideIcon; label: string; value: string | number; color: string; bgColor: string; href?: string; trend?: string;
}) {
  const router = useRouter();
  const card = (
    <Card sx={{ height: '100%', borderLeft: `4px solid ${color}` }}>
      {href ? (
        <CardActionArea onClick={() => router.push(href)} sx={{ height: '100%' }}>
          <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Avatar sx={{ width: 48, height: 48, bgcolor: bgColor, borderRadius: 2 }}>
                <Icon size={24} color={color} />
              </Avatar>
              {trend && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: trend.startsWith('+') ? 'success.main' : 'error.main' }}>
                  <ArrowUpRight size={14} />
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>{trend}</Typography>
                </Box>
              )}
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary' }}>{value}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{label}</Typography>
          </CardContent>
        </CardActionArea>
      ) : (
        <CardContent sx={{ p: 3 }}>
          <Avatar sx={{ width: 48, height: 48, bgcolor: bgColor, borderRadius: 2, mb: 2 }}>
            <Icon size={24} color={color} />
          </Avatar>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>{value}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{label}</Typography>
        </CardContent>
      )}
    </Card>
  );
  return card;
}

// ==========================================================================
// NGO DASHBOARD
// ==========================================================================

function NGODashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const s = stats || {};
  const totalApps = Number(s.total_applications) || 0;
  const openGrants = Number(s.open_grants) || 0;
  const pendingReports = Number(s.pending_reports) || 0;
  const avgScore = Number(s.average_score) || 0;

  const recentApps = Array.isArray(s.recent_applications)
    ? (s.recent_applications as Array<Record<string, unknown>>).slice(0, 5) : [];

  // "What's Due Next" items — build from upcoming_deadlines or generate from stats
  const upcomingDeadlines = Array.isArray(s.upcoming_deadlines)
    ? (s.upcoming_deadlines as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  const dueItems: Array<{
    icon: typeof FileText;
    title: string;
    grant: string;
    dueDate: Date | null;
    href: string;
    actionLabel: string;
  }> = [];

  if (upcomingDeadlines.length > 0) {
    upcomingDeadlines.forEach((dl) => {
      const dlType = String(dl.type || 'report');
      const iconMap: Record<string, typeof FileText> = { report: FileText, assessment: ClipboardCheck, application: Send };
      dueItems.push({
        icon: iconMap[dlType] || FileText,
        title: String(dl.title || dl.description || 'Upcoming task'),
        grant: String(dl.grant_title || dl.grant_name || ''),
        dueDate: dl.due_date ? new Date(String(dl.due_date)) : null,
        href: dlType === 'report' ? '/reports' : dlType === 'assessment' ? '/assessments' : '/applications',
        actionLabel: dl.status === 'in_progress' ? t('common.continue') : t('common.start'),
      });
    });
  } else {
    // Generate fallback items from stats
    if (pendingReports > 0) {
      dueItems.push({
        icon: FileText,
        title: t('dashboard.ngo.submit_pending_report'),
        grant: t('dashboard.ngo.grant_report'),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        href: '/reports',
        actionLabel: t('common.start'),
      });
    }
    if (avgScore < 100) {
      dueItems.push({
        icon: ClipboardCheck,
        title: t('dashboard.ngo.complete_assessment'),
        grant: t('dashboard.ngo.capacity_building'),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        href: '/assessments',
        actionLabel: t('common.start'),
      });
    }
    if (openGrants > 0) {
      dueItems.push({
        icon: Send,
        title: t('dashboard.ngo.apply_to_grant'),
        grant: `${openGrants} ${t('dashboard.stat.open_grants').toLowerCase()}`,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        href: '/grants',
        actionLabel: t('common.start'),
      });
    }
  }

  const nothingDue = dueItems.length === 0;

  // Countdown helper
  const getCountdownInfo = (date: Date | null): { label: string; color: 'error' | 'warning' | 'success' } => {
    if (!date) return { label: t('common.no_date'), color: 'success' };
    const daysLeft = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: `${Math.abs(daysLeft)}d ${t('common.overdue').toLowerCase()}`, color: 'error' };
    if (daysLeft < 7) return { label: `${daysLeft}d ${t('common.left')}`, color: 'error' };
    if (daysLeft < 30) return { label: `${daysLeft}d ${t('common.left')}`, color: 'warning' };
    return { label: `${daysLeft}d ${t('common.left')}`, color: 'success' };
  };

  // Application readiness checklist
  const assessmentsDone = Number(s.assessments) > 0 || avgScore > 0;
  const documentsUploaded = Number(s.documents) > 0;
  const profileComplete = Boolean(s.profile_complete) || true; // default true for now
  const readinessItems = [
    { label: t('dashboard.ngo.profile_complete'), done: profileComplete },
    { label: t('dashboard.ngo.assessment_done'), done: assessmentsDone },
    { label: t('dashboard.ngo.documents_uploaded'), done: documentsUploaded },
    { label: t('dashboard.ngo.no_compliance_flags'), done: Number(s.flagged_compliance) === 0 },
  ];
  const readinessDone = readinessItems.filter((r) => r.done).length;

  return (
    <Grid container spacing={3}>
      {/* Row 1: Welcome Banner */}
      <Grid size={12}>
        <Card sx={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <CardContent sx={{ p: { xs: 3, md: 4 }, position: 'relative', zIndex: 1 }}>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid size={{ xs: 12, sm: 7 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('auth.welcome_back', { name: userName.split(' ')[0] })}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mt: 0.5 }}>
                  {t('dashboard.ngo.subtitle')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 5 }} sx={{ textAlign: { sm: 'right' } }}>
                <Button variant="outlined" size="small" startIcon={<ClipboardCheck size={16} />} onClick={() => router.push('/assessments')}
                  sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', mr: 1, '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                  {t('dashboard.action.start_assessment')}
                </Button>
                <Button variant="contained" size="small" startIcon={<Search size={16} />} onClick={() => router.push('/grants')}
                  sx={{ bgcolor: '#fff', color: '#4F46E5', '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}>
                  {t('dashboard.action.browse_grants')}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
          <Box sx={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' }} />
          <Box sx={{ position: 'absolute', bottom: -30, right: 80, width: 100, height: 100, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)' }} />
        </Card>
      </Grid>

      {/* Row 2: Metric Cards */}
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={FileText} label={t('dashboard.stat.applications')} value={totalApps} color="#4F46E5" bgColor="#EEF2FF" href="/applications" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={Search} label={t('dashboard.stat.open_grants')} value={openGrants} color="#10B981" bgColor="#ECFDF5" href="/grants" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={Calendar} label={t('dashboard.stat.pending_reports')} value={pendingReports} color="#F59E0B" bgColor="#FFFBEB" href="/reports" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={TrendingUp} label={t('dashboard.stat.capacity_score')} value={`${avgScore}%`} color="#8B5CF6" bgColor="#F5F3FF" href="/assessments" />
      </Grid>

      {/* Row 3: What's Due Next */}
      <Grid size={12}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Clock size={20} color="#4F46E5" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('dashboard.ngo.whats_due_next')}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t('dashboard.ngo.upcoming_tasks_subtitle')}
              </Typography>
            </Box>
            {nothingDue ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <CheckCircle size={40} color="#10B981" />
                <Typography variant="body1" sx={{ fontWeight: 500, mt: 1.5 }}>
                  {t('dashboard.ngo.all_caught_up')}
                </Typography>
                <Button variant="outlined" size="small" onClick={() => router.push('/grants')} sx={{ mt: 1.5 }}>
                  {t('dashboard.action.browse_grants')}
                </Button>
              </Box>
            ) : (
              <List disablePadding>
                {dueItems.map((item, i) => {
                  const countdown = getCountdownInfo(item.dueDate);
                  const IconComponent = item.icon;
                  return (
                    <ListItem
                      key={i}
                      disablePadding
                      divider={i < dueItems.length - 1}
                      secondaryAction={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip label={countdown.label} color={countdown.color} size="small" variant="outlined" />
                          <Button size="small" variant="contained" endIcon={<ArrowRight size={14} />} onClick={() => router.push(item.href)}>
                            {item.actionLabel}
                          </Button>
                        </Stack>
                      }
                    >
                      <ListItemButton onClick={() => router.push(item.href)} sx={{ py: 1.5 }}>
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          <Avatar sx={{ width: 32, height: 32, bgcolor: '#EEF2FF' }}>
                            <IconComponent size={16} color="#4F46E5" />
                          </Avatar>
                        </ListItemIcon>
                        <ListItemText
                          primary={item.title}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                          secondary={item.grant}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Row 4: Recent Applications (8 cols) + Application Readiness (4 cols) */}
      <Grid size={{ xs: 12, lg: 8 }}>
        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: 3, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('dashboard.recent_applications')}</Typography>
              <Button size="small" onClick={() => router.push('/applications')} endIcon={<ChevronRight size={14} />}>
                {t('common.view_all')}
              </Button>
            </Box>
            <List disablePadding>
              {recentApps.length > 0 ? recentApps.map((app, i) => (
                <ListItem key={i} disablePadding divider={i < recentApps.length - 1}>
                  <ListItemButton onClick={() => router.push('/applications')} sx={{ py: 1.5, px: 3 }}>
                    <ListItemText
                      primary={String(app.grant_title || 'Untitled')}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 500, noWrap: true }}
                      secondary={new Date(String(app.submitted_at || app.created_at || '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                    <StatusBadge status={String(app.status || 'draft')} />
                  </ListItemButton>
                </ListItem>
              )) : (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">{t('dashboard.no_applications_yet')}</Typography>
                  <Button size="small" onClick={() => router.push('/grants')} sx={{ mt: 1 }}>{t('dashboard.action.browse_grants')}</Button>
                </Box>
              )}
            </List>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 4 }}>
        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>{t('dashboard.ngo.readiness_checklist')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {readinessDone} {t('common.of')} {readinessItems.length} {t('common.items_complete')}
            </Typography>
            <Stack spacing={1.5}>
              {readinessItems.map((item, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Checkbox checked={item.done} disabled size="small" sx={{ p: 0, '&.Mui-checked': { color: '#10B981' } }} />
                  <Typography
                    variant="body2"
                    sx={{
                      color: item.done ? 'text.primary' : 'text.secondary',
                      textDecoration: item.done ? 'none' : 'none',
                    }}
                  >
                    {item.label}
                  </Typography>
                </Box>
              ))}
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Button
              fullWidth
              variant="outlined"
              size="small"
              endIcon={<ArrowRight size={14} />}
              onClick={() => router.push('/assessments')}
            >
              {t('dashboard.ngo.view_checklist')}
            </Button>
          </CardContent>
        </Card>
      </Grid>

      {/* Row 5: Capacity Score Progress */}
      <Grid size={12}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('dashboard.org_readiness')}</Typography>
                <Typography variant="body2" color="text.secondary">{t('dashboard.org_readiness_subtitle')}</Typography>
              </Box>
              <Button variant="outlined" size="small" onClick={() => router.push('/assessments')}>
                {t('common.view_details')}
              </Button>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={avgScore}
                  sx={{
                    height: 12,
                    borderRadius: 6,
                    bgcolor: '#EEF2FF',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 6,
                      bgcolor: avgScore >= 80 ? '#10B981' : avgScore >= 60 ? '#F59E0B' : '#EF4444',
                    },
                  }}
                />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 60, textAlign: 'right' }}>
                {avgScore}%
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

// ==========================================================================
// DONOR DASHBOARD
// ==========================================================================

function DonorDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const s = stats || {};
  const totalGrants = Number(s.total_grants) || 0;
  const totalApps = Number(s.total_applications) || 0;
  const pendingReviews = Number(s.pending_reviews) || 0;
  const totalAwarded = Number(s.total_awarded) || 0;

  // At-risk items
  const overdueReports = Number(s.overdue_reports) || 0;
  const reportsDueSoon = Number(s.reports_due_soon) || 0;
  const flaggedCompliance = Number(s.flagged_compliance) || 0;

  const riskItems: Array<{ item: string; grant: string; chip: { label: string; color: 'error' | 'warning' | 'info' } }> = [];
  if (overdueReports > 0) {
    riskItems.push({ item: `${overdueReports} overdue report${overdueReports > 1 ? 's' : ''}`, grant: t('dashboard.donor.across_grants'), chip: { label: t('common.overdue'), color: 'error' } });
  }
  if (reportsDueSoon > 0) {
    riskItems.push({ item: `${reportsDueSoon} report${reportsDueSoon > 1 ? 's' : ''} due this month`, grant: t('dashboard.donor.across_grants'), chip: { label: t('common.due_soon'), color: 'warning' } });
  }
  if (flaggedCompliance > 0) {
    riskItems.push({ item: `${flaggedCompliance} flagged organization${flaggedCompliance > 1 ? 's' : ''}`, grant: t('dashboard.donor.compliance_review'), chip: { label: t('common.flagged'), color: 'error' } });
  }

  const hasRisk = riskItems.length > 0;

  // Application pipeline data (real data only — no mock fallbacks)
  const pipelineRaw = s.application_status_breakdown as Record<string, number> | undefined;
  const pipeline = pipelineRaw || { draft: 0, submitted: 0, under_review: 0, scored: 0, awarded: 0, rejected: 0 };
  const pipelineTotal = Object.values(pipeline).reduce((sum, v) => sum + v, 0) || 1;
  const pipelineSegments: Array<{ key: string; label: string; count: number; color: string }> = [
    { key: 'draft', label: t('status.draft'), count: Number(pipeline.draft) || 0, color: '#9CA3AF' },
    { key: 'submitted', label: t('status.submitted'), count: Number(pipeline.submitted) || 0, color: '#3B82F6' },
    { key: 'under_review', label: t('status.under_review'), count: Number(pipeline.under_review) || 0, color: '#F59E0B' },
    { key: 'scored', label: t('status.scored'), count: Number(pipeline.scored) || 0, color: '#8B5CF6' },
    { key: 'awarded', label: t('status.awarded'), count: Number(pipeline.awarded) || 0, color: '#10B981' },
    { key: 'rejected', label: t('status.rejected'), count: Number(pipeline.rejected) || 0, color: '#EF4444' },
  ];

  const attentionCount = overdueReports + reportsDueSoon + flaggedCompliance;

  return (
    <Grid container spacing={3}>
      {/* Row 1: Welcome Banner — compact, decision-oriented */}
      <Grid size={12}>
        <Card sx={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 40%, #334155 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 }, position: 'relative', zIndex: 1 }}>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid size={{ xs: 12, sm: 7 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>{t('auth.welcome_back', { name: userName.split(' ')[0] })}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 0.5 }}>
                  {t('dashboard.donor.subtitle')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 5 }} sx={{ textAlign: { sm: 'right' }, display: 'flex', gap: 1.5, justifyContent: { xs: 'flex-start', sm: 'flex-end' }, flexWrap: 'wrap' }}>
                {attentionCount > 0 && (
                  <Chip
                    icon={<AlertTriangle size={14} />}
                    label={`${attentionCount} item${attentionCount > 1 ? 's' : ''} need attention`}
                    sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#FCA5A5', fontWeight: 600, fontSize: '0.75rem', height: 30, '& .MuiChip-icon': { color: '#FCA5A5' } }}
                  />
                )}
                <Button variant="contained" size="small" startIcon={<PlusCircle size={16} />} onClick={() => router.push('/grants/new')}
                  sx={{ bgcolor: '#4F46E5', color: '#fff', '&:hover': { bgcolor: '#4338CA' } }}>
                  {t('nav.create_grant')}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
          <Box sx={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(79,70,229,0.08)' }} />
          <Box sx={{ position: 'absolute', bottom: -40, left: '30%', width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(99,102,241,0.06)' }} />
        </Card>
      </Grid>

      {/* Row 2: Compact Metrics Bar */}
      <Grid size={{ xs: 6, sm: 3 }}>
        <MetricCard icon={Briefcase} label={t('dashboard.stat.total_grants')} value={totalGrants} color="#4338CA" bgColor="#EEF2FF" href="/grants" />
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <MetricCard icon={FileText} label={t('dashboard.stat.total_applications')} value={totalApps} color="#2563EB" bgColor="#EFF6FF" href="/reviews" />
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <MetricCard icon={Star} label={t('dashboard.stat.pending_reviews')} value={pendingReviews} color="#D97706" bgColor="#FFFBEB" href="/reviews" />
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <MetricCard icon={TrendingUp} label={t('dashboard.stat.total_awarded')} value={`$${(totalAwarded / 1000).toFixed(0)}K`} color="#059669" bgColor="#ECFDF5" />
      </Grid>

      {/* Row 3: At Risk Now */}
      <Grid size={12}>
        <Card sx={{ borderLeft: '4px solid', borderLeftColor: hasRisk ? '#EF4444' : '#10B981' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {hasRisk ? <AlertTriangle size={20} color="#EF4444" /> : <CheckCircle size={20} color="#10B981" />}
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {hasRisk ? t('dashboard.donor.attention_required') : t('dashboard.donor.attention_required')}
                </Typography>
              </Box>
              {hasRisk && (
                <Button size="small" variant="outlined" color="error" endIcon={<ArrowRight size={14} />} onClick={() => router.push('/compliance')}>
                  {t('common.review_all')}
                </Button>
              )}
            </Box>
            {hasRisk ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.item')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.grant')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.status')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {riskItems.map((row, i) => (
                      <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell>
                          <Typography variant="body2">{row.item}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{row.grant}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={row.chip.label} color={row.chip.color} size="small" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
                <CheckCircle size={20} color="#10B981" />
                <Typography variant="body2" sx={{ color: '#10B981', fontWeight: 500 }}>
                  {t('dashboard.donor.all_clear')}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Row 4: My Grants (8 cols) + Quick Actions (4 cols) */}
      <Grid size={{ xs: 12, lg: 8 }}>
        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: 3, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('dashboard.donor.my_grants')}</Typography>
              <Button size="small" onClick={() => router.push('/grants')} endIcon={<ChevronRight size={14} />}>
                {t('common.view_all')}
              </Button>
            </Box>
            {Array.isArray(s.recent_grants) && (s.recent_grants as Array<Record<string, unknown>>).length > 0 ? (
              <List disablePadding>
                {(s.recent_grants as Array<Record<string, unknown>>).slice(0, 5).map((g, i) => (
                  <ListItem key={i} disablePadding divider={i < Math.min((s.recent_grants as Array<unknown>).length, 5) - 1}>
                    <ListItemButton onClick={() => router.push(`/grants/${g.id}`)} sx={{ py: 1.5, px: 3 }}>
                      <ListItemText
                        primary={String(g.title || 'Untitled Grant')}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondary={`$${((Number(g.total_funding) || 0) / 1000).toFixed(0)}K \u00B7 ${Number(g.application_count) || 0} ${t('grant.applications').toLowerCase()}`}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <StatusBadge status={String(g.status || 'draft')} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ py: 4, textAlign: 'center', px: 3 }}>
                <Typography variant="body2" color="text.secondary">{t('dashboard.donor.no_grants_yet')}</Typography>
                <Button size="small" variant="outlined" onClick={() => router.push('/grants/new')} sx={{ mt: 1 }}>
                  {t('grant.create_first')}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 4 }}>
        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>{t('dashboard.quick_actions')}</Typography>
            <Stack spacing={1}>
              {[
                { icon: PlusCircle, label: t('dashboard.donor.create_new_grant'), href: '/grants/new', color: '#4F46E5' },
                { icon: Star, label: t('nav.review_applications'), href: '/reviews', color: '#F59E0B' },
                { icon: BarChart3, label: t('nav.grant_reports'), href: '/reports', color: '#3B82F6' },
                { icon: Shield, label: t('nav.compliance'), href: '/compliance', color: '#10B981' },
              ].map(({ icon: I, label, href, color }) => (
                <Button
                  key={href}
                  fullWidth
                  variant="outlined"
                  size="small"
                  startIcon={<I size={16} color={color} />}
                  onClick={() => router.push(href)}
                  sx={{ justifyContent: 'flex-start', py: 1, borderColor: 'divider', color: 'text.primary', fontSize: '0.8125rem', '&:hover': { borderColor: color, bgcolor: `${color}08` } }}
                >
                  {label}
                </Button>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      {/* Row 5: Application Pipeline */}
      <Grid size={12}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>{t('dashboard.donor.application_pipeline')}</Typography>
            {/* Segmented bar */}
            <Box sx={{ display: 'flex', height: 32, borderRadius: 2, overflow: 'hidden', mb: 2 }}>
              {pipelineSegments.map((seg) => (
                seg.count > 0 && (
                  <Box
                    key={seg.key}
                    sx={{
                      width: `${(seg.count / pipelineTotal) * 100}%`,
                      bgcolor: seg.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'width 0.3s ease',
                      minWidth: seg.count > 0 ? 24 : 0,
                    }}
                  >
                    <Typography variant="caption" sx={{ color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}>
                      {seg.count}
                    </Typography>
                  </Box>
                )
              ))}
            </Box>
            {/* Legend */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {pipelineSegments.map((seg) => (
                <Box key={seg.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: seg.color }} />
                  <Typography variant="caption" color="text.secondary">
                    {seg.label}: {seg.count}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

// ==========================================================================
// REVIEWER DASHBOARD
// ==========================================================================

function ReviewerDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const s = stats || {};
  return (
    <Grid container spacing={3}>
      <Grid size={12}>
        <Card sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #A78BFA 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('auth.welcome_back', { name: userName.split(' ')[0] })}</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mt: 0.5 }}>
              {t('dashboard.reviewer.subtitle')}
            </Typography>
          </CardContent>
          <Box sx={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' }} />
        </Card>
      </Grid>

      <Grid size={{ xs: 12, sm: 4 }}>
        <MetricCard icon={FileText} label={t('dashboard.stat.pending_assignments')} value={Number(s.pending_reviews) || 0} color="#F59E0B" bgColor="#FFFBEB" href="/reviews" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <MetricCard icon={Star} label={t('dashboard.stat.completed_reviews')} value={Number(s.completed_reviews) || 0} color="#10B981" bgColor="#ECFDF5" href="/reviews/completed" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <MetricCard icon={TrendingUp} label={t('dashboard.stat.average_score')} value={`${Number(s.average_score) || 0}%`} color="#4F46E5" bgColor="#EEF2FF" />
      </Grid>

      <Grid size={12}>
        <Card>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: '#EEF2FF', mx: 'auto', mb: 2 }}>
              <Star size={28} color="#4F46E5" />
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>{t('dashboard.reviewer.ready_to_review')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {t('dashboard.reviewer.ready_subtitle')}
            </Typography>
            <Button variant="contained" size="large" startIcon={<Star size={18} />} onClick={() => router.push('/reviews')}>
              {t('dashboard.reviewer.go_to_assignments')}
            </Button>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

// ==========================================================================
// ADMIN DASHBOARD
// ==========================================================================

function AdminDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const s = stats || {};

  const chartData = useMemo(() => {
    return ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((m) => ({
      month: m,
      value: Math.floor(Math.random() * 20) + 5,
    }));
  }, []);

  return (
    <Grid container spacing={3}>
      <Grid size={12}>
        <Card sx={{ background: 'linear-gradient(135deg, #1E293B 0%, #334155 50%, #475569 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('dashboard.admin.title')}</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
              {t('dashboard.admin.subtitle')}
            </Typography>
          </CardContent>
          <Box sx={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)' }} />
        </Card>
      </Grid>

      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={Users} label={t('dashboard.stat.total_users')} value={Number(s.total_users) || 0} color="#4F46E5" bgColor="#EEF2FF" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={Briefcase} label={t('dashboard.stat.grants')} value={Number(s.total_grants) || 0} color="#3B82F6" bgColor="#EFF6FF" href="/grants" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={FileText} label={t('dashboard.stat.total_applications')} value={Number(s.total_applications) || 0} color="#10B981" bgColor="#ECFDF5" href="/applications" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={Shield} label={t('dashboard.stat.compliance_checks')} value={Number(s.total_checks) || 0} color="#F59E0B" bgColor="#FFFBEB" href="/compliance" />
      </Grid>

      <Grid size={12}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>{t('dashboard.admin.platform_activity')}</Typography>
            <Box sx={{ height: 300 }}>
              <BarChart
                xAxis={[{ data: chartData.map(d => d.month), scaleType: 'band' }]}
                series={[{ data: chartData.map(d => d.value), color: '#4F46E5', label: t('dashboard.recent_activity') }]}
                height={300}
                margin={{ top: 20, right: 20, bottom: 30, left: 40 }}
                borderRadius={6}
              />
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
