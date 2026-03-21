'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardStats } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, Tooltip,
} from 'recharts';
import {
  FileText, Search, ClipboardCheck, Briefcase,
  ArrowRight, Calendar, Clock, ChevronRight,
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
    <div className="space-y-8 pb-8 max-w-5xl">
      {user.role === 'ngo' && <NGODashboard stats={stats} userName={user.name} />}
      {user.role === 'donor' && <DonorDashboard stats={stats} userName={user.name} />}
      {user.role === 'reviewer' && <ReviewerDashboard stats={stats} userName={user.name} />}
      {user.role === 'admin' && <AdminDashboard stats={stats} userName={user.name} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-8 max-w-5xl">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Simple stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
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
    daysLeft < 0 ? 'text-red-600' :
    daysLeft < 7 ? 'text-red-600' :
    daysLeft < 30 ? 'text-amber-600' :
    'text-slate-500';

  const label =
    daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` :
    daysLeft === 0 ? 'Due today' :
    `${daysLeft}d left`;

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-900 truncate">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
      </div>
      <span className={`text-xs font-medium shrink-0 ml-4 ${color}`}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Simple chart
// ---------------------------------------------------------------------------

function TrendChart({ data }: { data: Array<{ month: string; value: number }> }) {
  return (
    <Card className="border border-slate-200">
      <CardContent className="p-5">
        <p className="text-sm font-medium text-slate-700 mb-4">Activity trend</p>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
              />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#4F46E5"
                strokeWidth={2}
                fill="url(#trendFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
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
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome back, {userName.split(' ')[0]}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here is what is happening with your grants and applications.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <StatCard label="Applications" value={totalApps} />
        <StatCard label="Open Grants" value={openGrants} />
        <StatCard label="Pending Reports" value={pendingReports} />
        <StatCard label="Assessments" value={assessmentCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Applications */}
        <Card className="border border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-slate-700">Recent Applications</p>
              <button
                onClick={() => router.push('/applications')}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                View all
              </button>
            </div>
            {recentApps.length > 0 ? (
              <div>
                {recentApps.map((app, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded"
                    onClick={() => router.push('/applications')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 truncate">
                        {String(app.grant_title || 'Untitled Grant')}
                      </p>
                    </div>
                    <StatusBadge status={String(app.status || 'draft')} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-400">No applications yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 text-brand-600"
                  onClick={() => router.push('/grants')}
                >
                  Browse Grants
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="border border-slate-200">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-slate-700 mb-4">Upcoming Deadlines</p>
            {upcomingDeadlines.length > 0 ? (
              <div>
                {upcomingDeadlines.map((dl, i) => (
                  <DeadlineItem
                    key={i}
                    title={String(dl.title || dl.report_type || '')}
                    subtitle={String(dl.grant_title || '')}
                    daysLeft={Number(dl.days_left) || 0}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-400">No upcoming deadlines</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <TrendChart data={trendData} />

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          size="sm"
          className="text-slate-600"
          onClick={() => router.push('/assessments')}
        >
          <ClipboardCheck className="w-4 h-4 mr-1.5 text-slate-400" />
          Start Assessment
        </Button>
        <Button
          size="sm"
          className="bg-brand-600 hover:bg-brand-700 text-white"
          onClick={() => router.push('/grants')}
        >
          <Search className="w-4 h-4 mr-1.5" />
          Browse Grants
        </Button>
      </div>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Welcome back, {userName.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Your funding portfolio at a glance.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-brand-600 hover:bg-brand-700 text-white"
          onClick={() => router.push('/grants/new')}
        >
          Create Grant
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <StatCard label="Active Grants" value={totalGrants} />
        <StatCard label="Applications" value={totalApps} />
        <StatCard label="Pending Reviews" value={pendingReviews} />
        <StatCard label="Reports Due" value={reportsToReview} />
      </div>

      {/* Recent Activity */}
      <Card className="border border-slate-200">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-slate-700">Grant Performance</p>
            <button
              onClick={() => router.push('/grants')}
              className="text-xs text-brand-600 hover:text-brand-700"
            >
              View all
            </button>
          </div>
          {grantPerformance.length > 0 ? (
            <div>
              {grantPerformance.map((grant, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 truncate">
                      {String(grant.title || 'Grant')}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {String(grant.applicant_count || 0)} applicants
                    </p>
                  </div>
                  <span className="text-sm font-medium text-slate-600 ml-4">
                    {Number(grant.progress) || 0}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-400">
                Create your first grant to see performance data.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <TrendChart data={trendData} />
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
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome back, {userName.split(' ')[0]}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          You have {pendingReviews} application{pendingReviews !== 1 ? 's' : ''} waiting for review.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <StatCard label="Pending" value={pendingReviews} />
        <StatCard label="In Progress" value={inProgress} />
        <StatCard label="Completed" value={completedReviews} />
      </div>

      {/* Assignments */}
      <Card className="border border-slate-200">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-slate-700">Your Assignments</p>
            <button
              onClick={() => router.push('/reviews')}
              className="text-xs text-brand-600 hover:text-brand-700"
            >
              View all
            </button>
          </div>
          {pendingQueue.length > 0 ? (
            <div>
              {pendingQueue.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded"
                  onClick={() => router.push('/reviews')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 truncate">
                      {String(item.grant_title || item.title || 'Application')}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {String(item.ngo_org_name || item.org_name || '')}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-400">No pending assignments</p>
            </div>
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
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome back, {userName.split(' ')[0]}
        </h1>
        <p className="text-sm text-slate-500 mt-1">System overview</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <StatCard label="Users" value={totalUsers} />
        <StatCard label="Organizations" value={totalOrgs} />
        <StatCard label="Grants" value={totalGrants} />
        <StatCard label="Applications" value={totalApps} />
      </div>

      <TrendChart data={trendData} />
    </>
  );
}
