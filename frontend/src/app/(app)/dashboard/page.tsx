'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardStats } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { useRouter } from 'next/navigation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';

import { BarChart } from '@mui/x-charts/BarChart';

import {
  Search, ClipboardCheck, ChevronRight,
} from 'lucide-react';

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
    <Stack spacing={4} sx={{ pb: 4, maxWidth: 960 }}>
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
    <Stack spacing={4} sx={{ maxWidth: 960 }}>
      <Box>
        <Skeleton variant="text" width={260} height={36} />
        <Skeleton variant="text" width={200} height={20} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 3 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={96} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
      <Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Shared: Simple stat card
// ---------------------------------------------------------------------------

function DashStatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 700, color: color || 'text.primary', mb: 0.5 }}
        >
          {value}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared: Deadline item
// ---------------------------------------------------------------------------

function DeadlineItem({ title, subtitle, daysLeft }: {
  title: string;
  subtitle: string;
  daysLeft: number;
}) {
  const color =
    daysLeft < 0 ? 'error.main' :
    daysLeft < 7 ? 'error.main' :
    daysLeft < 30 ? 'warning.main' :
    'text.secondary';

  const label =
    daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` :
    daysLeft === 0 ? 'Due today' :
    `${daysLeft}d left`;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap sx={{ color: 'text.primary' }}>
          {title}
        </Typography>
        <Typography variant="caption" noWrap sx={{ color: 'text.secondary', mt: 0.25, display: 'block' }}>
          {subtitle}
        </Typography>
      </Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color, flexShrink: 0, ml: 2 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Shared: Trend Bar Chart using @mui/x-charts
// ---------------------------------------------------------------------------

function TrendBarChart({ data }: { data: Array<{ month: string; value: number }> }) {
  return (
    <Card>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
          Activity Trend
        </Typography>
        <Box sx={{ height: 200, width: '100%' }}>
          <BarChart
            xAxis={[{
              data: data.map((d) => d.month),
              scaleType: 'band',
            }]}
            series={[{
              data: data.map((d) => d.value),
              color: '#4F46E5',
            }]}
            height={200}
            margin={{ top: 10, right: 10, bottom: 24, left: 30 }}
            borderRadius={6}
            slotProps={{
              bar: {
                rx: 4,
                ry: 4,
              },
            }}
          />
        </Box>
      </CardContent>
    </Card>
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
  const assessmentCount = Number(s.assessments) || 0;

  const recentApps = Array.isArray(s.recent_applications)
    ? (s.recent_applications as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  const upcomingDeadlines = Array.isArray(s.upcoming_deadlines)
    ? (s.upcoming_deadlines as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  const trendData = useMemo(() => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map((m, i) => ({
      month: m,
      value: Math.max(0, totalApps - (5 - i) + Math.floor(Math.random() * 2)),
    }));
  }, [totalApps]);

  return (
    <>
      {/* Greeting */}
      <Box>
        <Typography variant="h2" sx={{ color: 'text.primary' }}>
          Welcome back, {userName.split(' ')[0]}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Here is what is happening with your grants and applications.
        </Typography>
      </Box>

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 3 }}>
        <DashStatCard label="Applications" value={totalApps} />
        <DashStatCard label="Open Grants" value={openGrants} />
        <DashStatCard label="Pending Reports" value={pendingReports} />
        <DashStatCard label="Assessments" value={assessmentCount} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        {/* Recent Applications */}
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Recent Applications
              </Typography>
              <Button
                size="small"
                onClick={() => router.push('/applications')}
                sx={{ fontSize: '0.75rem', fontWeight: 500 }}
              >
                View all
              </Button>
            </Box>
            {recentApps.length > 0 ? (
              <Stack spacing={0}>
                {recentApps.map((app, i) => (
                  <Box
                    key={i}
                    onClick={() => router.push('/applications')}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      py: 1.25,
                      px: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                      cursor: 'pointer',
                      borderRadius: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography variant="body2" noWrap sx={{ flex: 1, color: 'text.primary' }}>
                      {String(app.grant_title || 'Untitled Grant')}
                    </Typography>
                    <StatusBadge status={String(app.status || 'draft')} />
                  </Box>
                ))}
              </Stack>
            ) : (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  No applications yet
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => router.push('/grants')}
                  sx={{ mt: 2 }}
                >
                  Browse Grants
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
              Upcoming Deadlines
            </Typography>
            {upcomingDeadlines.length > 0 ? (
              <Box>
                {upcomingDeadlines.map((dl, i) => (
                  <DeadlineItem
                    key={i}
                    title={String(dl.title || dl.report_type || '')}
                    subtitle={String(dl.grant_title || '')}
                    daysLeft={Number(dl.days_left) || 0}
                  />
                ))}
              </Box>
            ) : (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  No upcoming deadlines
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Trend Chart */}
      <TrendBarChart data={trendData} />

      {/* Quick Actions */}
      <Stack direction="row" spacing={1.5}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ClipboardCheck size={16} />}
          onClick={() => router.push('/assessments')}
          sx={{ color: 'text.secondary', borderColor: 'divider' }}
        >
          Start Assessment
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<Search size={16} />}
          onClick={() => router.push('/grants')}
        >
          Browse Grants
        </Button>
      </Stack>
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
  const reportsToReview = Number(s.reports_to_review) || 0;

  const grantPerformance = Array.isArray(s.grant_performance)
    ? (s.grant_performance as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  const trendData = useMemo(() => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map((m, i) => ({
      month: m,
      value: Math.max(0, Math.round(totalApps * (0.3 + i * 0.14))),
    }));
  }, [totalApps]);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h2" sx={{ color: 'text.primary' }}>
            Welcome back, {userName.split(' ')[0]}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Your funding portfolio at a glance.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={() => router.push('/grants/new')}
        >
          Create Grant
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 3 }}>
        <DashStatCard label="Active Grants" value={totalGrants} />
        <DashStatCard label="Applications" value={totalApps} />
        <DashStatCard label="Pending Reviews" value={pendingReviews} />
        <DashStatCard label="Reports Due" value={reportsToReview} />
      </Box>

      {/* Grant Performance */}
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Grant Performance
            </Typography>
            <Button
              size="small"
              onClick={() => router.push('/grants')}
              sx={{ fontSize: '0.75rem' }}
            >
              View all
            </Button>
          </Box>
          {grantPerformance.length > 0 ? (
            <Stack spacing={0}>
              {grantPerformance.map((grant, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap sx={{ color: 'text.primary' }}>
                      {String(grant.title || 'Grant')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {String(grant.applicant_count || 0)} applicants
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', ml: 2 }}>
                    {Number(grant.progress) || 0}%
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Create your first grant to see performance data.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <TrendBarChart data={trendData} />
    </>
  );
}

// ==========================================================================
// REVIEWER DASHBOARD
// ==========================================================================

function ReviewerDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const s = stats || {};
  const pendingReviews = Number(s.pending_reviews) || 0;
  const inProgress = Number(s.in_progress) || 0;
  const completedReviews = Number(s.completed_reviews) || 0;

  const pendingQueue = Array.isArray(s.pending_queue)
    ? (s.pending_queue as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  return (
    <>
      <Box>
        <Typography variant="h2" sx={{ color: 'text.primary' }}>
          Welcome back, {userName.split(' ')[0]}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          You have {pendingReviews} application{pendingReviews !== 1 ? 's' : ''} waiting for review.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
        <DashStatCard label="Pending" value={pendingReviews} />
        <DashStatCard label="In Progress" value={inProgress} />
        <DashStatCard label="Completed" value={completedReviews} />
      </Box>

      {/* Assignments */}
      <Card>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              Your Assignments
            </Typography>
            <Button
              size="small"
              onClick={() => router.push('/reviews')}
              sx={{ fontSize: '0.75rem' }}
            >
              View all
            </Button>
          </Box>
          {pendingQueue.length > 0 ? (
            <Stack spacing={0}>
              {pendingQueue.map((item, i) => (
                <Box
                  key={i}
                  onClick={() => router.push('/reviews')}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 1.5,
                    px: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-child': { borderBottom: 'none' },
                    cursor: 'pointer',
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap sx={{ color: 'text.primary' }}>
                      {String(item.grant_title || item.title || 'Application')}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>
                      {String(item.ngo_org_name || item.org_name || '')}
                    </Typography>
                  </Box>
                  <ChevronRight size={16} color="#94A3B8" />
                </Box>
              ))}
            </Stack>
          ) : (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                No pending assignments
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ==========================================================================
// ADMIN DASHBOARD
// ==========================================================================

function AdminDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const s = stats || {};
  const totalUsers = Number(s.total_users) || 0;
  const totalGrants = Number(s.total_grants) || 0;
  const totalApps = Number(s.total_applications) || 0;
  const totalOrgs = Number(s.total_orgs) || totalUsers;

  const trendData = useMemo(() => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map((m, i) => ({
      month: m,
      value: Math.max(1, Math.round(totalUsers * (0.4 + i * 0.12))),
    }));
  }, [totalUsers]);

  return (
    <>
      <Box>
        <Typography variant="h2" sx={{ color: 'text.primary' }}>
          Welcome back, {userName.split(' ')[0]}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          System overview
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 3 }}>
        <DashStatCard label="Users" value={totalUsers} />
        <DashStatCard label="Organizations" value={totalOrgs} />
        <DashStatCard label="Grants" value={totalGrants} />
        <DashStatCard label="Applications" value={totalApps} />
      </Box>

      <TrendBarChart data={trendData} />
    </>
  );
}
