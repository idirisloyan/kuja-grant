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

import { BarChart } from '@mui/x-charts/BarChart';

import {
  FileText, Search, ClipboardCheck, Calendar, ChevronRight,
  Briefcase, Star, TrendingUp, Users, Shield, BarChart3,
  PlusCircle, ArrowUpRight,
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

  const chartData = useMemo(() => {
    return ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((m, i) => ({
      month: m,
      value: Math.max(1, totalApps - (5 - i) + Math.floor(Math.random() * 3)),
    }));
  }, [totalApps]);

  return (
    <Grid container spacing={3}>
      {/* Welcome Banner */}
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

      {/* Metric Cards */}
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

      {/* Chart + Recent Applications */}
      <Grid size={{ xs: 12, lg: 8 }}>
        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>{t('dashboard.chart.applications_trend')}</Typography>
            <Box sx={{ height: 280, width: '100%' }}>
              <BarChart
                xAxis={[{ data: chartData.map(d => d.month), scaleType: 'band' }]}
                series={[{ data: chartData.map(d => d.value), color: '#4F46E5', label: t('dashboard.stat.applications') }]}
                height={280}
                margin={{ top: 20, right: 20, bottom: 30, left: 40 }}
                borderRadius={6}
              />
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 4 }}>
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

      {/* Capacity Score Progress */}
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

  return (
    <Grid container spacing={3}>
      <Grid size={12}>
        <Card sx={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 50%, #34D399 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <CardContent sx={{ p: { xs: 3, md: 4 }, position: 'relative', zIndex: 1 }}>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid size={{ xs: 12, sm: 8 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('auth.welcome_back', { name: userName.split(' ')[0] })}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mt: 0.5 }}>
                  {t('dashboard.donor.subtitle')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }} sx={{ textAlign: { sm: 'right' } }}>
                <Button variant="contained" size="small" startIcon={<PlusCircle size={16} />} onClick={() => router.push('/grants/new')}
                  sx={{ bgcolor: '#fff', color: '#059669', '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}>
                  {t('nav.create_grant')}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
          <Box sx={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' }} />
        </Card>
      </Grid>

      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={Briefcase} label={t('dashboard.stat.total_grants')} value={totalGrants} color="#4F46E5" bgColor="#EEF2FF" href="/grants" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={FileText} label={t('dashboard.stat.total_applications')} value={totalApps} color="#3B82F6" bgColor="#EFF6FF" href="/reviews" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={Star} label={t('dashboard.stat.pending_reviews')} value={pendingReviews} color="#F59E0B" bgColor="#FFFBEB" href="/reviews" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <MetricCard icon={TrendingUp} label={t('dashboard.stat.total_awarded')} value={`$${(totalAwarded / 1000).toFixed(0)}K`} color="#10B981" bgColor="#ECFDF5" />
      </Grid>

      {/* My Grants List */}
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

      {/* Risk & Quick Actions */}
      <Grid size={{ xs: 12, lg: 4 }}>
        <Stack spacing={2} sx={{ height: '100%' }}>
          {/* Risk Items */}
          <Card sx={{ borderLeft: '4px solid #EF4444' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>{t('dashboard.donor.attention_required')}</Typography>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">{t('dashboard.donor.overdue_reports')}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: Number(s.overdue_reports) ? 'error.main' : 'text.secondary' }}>
                    {Number(s.overdue_reports) || 0}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">{t('dashboard.donor.reports_due_month')}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.main' }}>
                    {Number(s.reports_due_soon) || 0}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">{t('dashboard.donor.flagged_compliance')}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: Number(s.flagged_compliance) ? 'error.main' : 'text.secondary' }}>
                    {Number(s.flagged_compliance) || 0}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card sx={{ flex: 1 }}>
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
        </Stack>
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
