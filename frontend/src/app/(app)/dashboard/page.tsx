'use client';

import { useAuthStore } from '@/stores/auth-store';
import { useDashboardStats } from '@/lib/hooks/use-api';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  BarChart3, FileText, Search, ClipboardCheck, Briefcase, Star, Users,
  Shield, PlusCircle, ArrowRight, Calendar, TrendingUp, AlertTriangle,
  Clock, CheckCircle2, Eye, Zap, Target, Award, Activity, Timer,
  ChevronRight, Sparkles, Globe, DollarSign, Layers, ArrowUpRight,
  ArrowDownRight, PieChart as PieChartIcon, LayoutGrid, Send,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Vibrant color palette (Monday.com style)
// ---------------------------------------------------------------------------
const COLORS = ['#8B5CF6', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#6366F1', '#EC4899'];
const PIPELINE_COLORS: Record<string, string> = {
  draft: '#94A3B8',
  submitted: '#3B82F6',
  under_review: '#F59E0B',
  scored: '#8B5CF6',
  awarded: '#10B981',
  rejected: '#EF4444',
};

// ---------------------------------------------------------------------------
// Shared: Animated number display
// ---------------------------------------------------------------------------
function BigNumber({ value, prefix = '', suffix = '', className = '' }: {
  value: number | string; prefix?: string; suffix?: string; className?: string;
}) {
  return (
    <span className={`text-3xl font-extrabold tracking-tight ${className}`}>
      {prefix}{value}{suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared: Mini sparkline (fake data for visual richness)
// ---------------------------------------------------------------------------
function MiniSparkline({ color = '#8B5CF6', trend = 'up' }: { color?: string; trend?: 'up' | 'down' }) {
  const base = trend === 'up' ? [3, 5, 4, 7, 6, 8, 10, 9, 12] : [12, 10, 9, 8, 7, 6, 5, 4, 3];
  const data = base.map((v, i) => ({ v: v + Math.random() * 2, i }));
  return (
    <div className="w-20 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace('#', '')})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useDashboardStats();
  const router = useRouter();
  const stats = data?.stats as Record<string, unknown> | undefined;

  if (isLoading) {
    return <DashboardSkeleton />;
  }
  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {user.role === 'ngo' && <NGODashboard stats={stats} userName={user.name} />}
      {user.role === 'donor' && <DonorDashboard stats={stats} userName={user.name} />}
      {user.role === 'reviewer' && <ReviewerDashboard stats={stats} userName={user.name} />}
      {user.role === 'admin' && <AdminDashboard stats={stats} userName={user.name} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

// ==========================================================================
// NGO DASHBOARD
// ==========================================================================
function NGODashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const s = stats || {};
  const capacityScore = Number(s.average_score) || 0;
  const totalApps = Number(s.total_applications) || 0;
  const openGrants = Number(s.open_grants) || 0;
  const pendingReports = Number(s.pending_reports) || 0;
  const assessmentCount = Number(s.assessments) || 0;

  // Pipeline data from stats or mock
  const pipelineData = [
    { stage: 'Draft', count: Number(s.draft_applications) || 0, color: PIPELINE_COLORS.draft },
    { stage: 'Submitted', count: Number(s.submitted_applications) || Math.max(0, totalApps - 2), color: PIPELINE_COLORS.submitted },
    { stage: 'In Review', count: Number(s.under_review_applications) || 0, color: PIPELINE_COLORS.under_review },
    { stage: 'Scored', count: Number(s.scored_applications) || 0, color: PIPELINE_COLORS.scored },
    { stage: 'Awarded', count: Number(s.awarded_applications) || 0, color: PIPELINE_COLORS.awarded },
  ];

  // Assessment category data for radar chart
  const assessmentCategories = [
    { category: 'Governance', score: Number(s.governance_score) || Math.round(capacityScore * 0.9) },
    { category: 'Financial', score: Number(s.financial_score) || Math.round(capacityScore * 1.05) },
    { category: 'Program', score: Number(s.program_score) || Math.round(capacityScore * 0.95) },
    { category: 'HR', score: Number(s.hr_score) || Math.round(capacityScore * 0.85) },
    { category: 'M&E', score: Number(s.me_score) || Math.round(capacityScore * 1.1) },
  ].map(c => ({ ...c, score: Math.min(100, Math.max(0, c.score)) }));

  // Recent applications
  const recentApps = Array.isArray(s.recent_applications)
    ? (s.recent_applications as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  // Upcoming deadlines (from stats or mock)
  const upcomingDeadlines = Array.isArray(s.upcoming_deadlines)
    ? (s.upcoming_deadlines as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  return (
    <>
      {/* ===== HERO CARD ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-white/5 rounded-full translate-y-1/2" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex-1">
            <p className="text-violet-200 text-sm font-medium mb-1">Good {getTimeOfDay()}</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
              {userName.split(' ')[0]}, here&apos;s your overview
            </h1>
            <p className="text-violet-100/80 text-sm max-w-md">
              Track your grants, assessments, and compliance status all in one place.
            </p>
            <div className="flex gap-3 mt-5">
              <Button
                onClick={() => router.push('/assessments')}
                className="bg-white/20 hover:bg-white/30 text-white border-white/20 border backdrop-blur-sm rounded-xl gap-2"
              >
                <ClipboardCheck className="w-4 h-4" /> Start Assessment
              </Button>
              <Button
                onClick={() => router.push('/grants')}
                className="bg-white text-indigo-700 hover:bg-white/90 rounded-xl gap-2 font-semibold"
              >
                <Search className="w-4 h-4" /> Browse Grants
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-center bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
            <p className="text-xs text-violet-200 font-medium mb-2 uppercase tracking-wider">Capacity Score</p>
            <div className="relative">
              <svg width={120} height={120} className="-rotate-90">
                <circle cx={60} cy={60} r={52} strokeWidth={8} fill="none" className="stroke-white/10" />
                <circle
                  cx={60} cy={60} r={52} strokeWidth={8} fill="none" strokeLinecap="round"
                  className="stroke-white transition-all duration-1000 ease-out"
                  style={{
                    strokeDasharray: 2 * Math.PI * 52,
                    strokeDashoffset: 2 * Math.PI * 52 * (1 - capacityScore / 100),
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold">{capacityScore}</span>
                <span className="text-xs text-violet-200">/ 100</span>
              </div>
            </div>
            <p className="text-xs text-violet-200 mt-2">
              {capacityScore >= 80 ? 'Excellent' : capacityScore >= 60 ? 'Good' : 'Needs Work'}
            </p>
          </div>
        </div>
      </div>

      {/* ===== STAT CARDS ROW ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlowStatCard
          icon={FileText} label="Total Applications" value={totalApps}
          color="blue" bgGradient="from-blue-500 to-blue-600"
          sparkColor="#3B82F6" trend="up"
        />
        <GlowStatCard
          icon={Search} label="Open Grants" value={openGrants}
          color="emerald" bgGradient="from-emerald-500 to-emerald-600"
          sparkColor="#10B981" trend="up"
        />
        <GlowStatCard
          icon={Calendar} label="Pending Reports" value={pendingReports}
          color="amber" bgGradient="from-amber-500 to-amber-600"
          sparkColor="#F59E0B" trend={pendingReports > 3 ? 'down' : 'up'}
        />
        <GlowStatCard
          icon={ClipboardCheck} label="Assessments" value={assessmentCount}
          color="violet" bgGradient="from-violet-500 to-violet-600"
          sparkColor="#8B5CF6" trend="up"
        />
      </div>

      {/* ===== APPLICATION PIPELINE ===== */}
      <Card className="rounded-2xl shadow-sm border-0 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            Application Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {pipelineData.map((stage, i) => (
              <div key={stage.stage} className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex-1 text-center">
                  <div
                    className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg transition-transform hover:scale-110"
                    style={{ backgroundColor: stage.color }}
                  >
                    {stage.count}
                  </div>
                  <p className="text-xs font-medium text-slate-600 mt-2 truncate">{stage.stage}</p>
                </div>
                {i < pipelineData.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
          {/* Pipeline bar */}
          <div className="flex h-3 rounded-full overflow-hidden mt-4 bg-slate-100">
            {pipelineData.map((stage) => {
              const total = pipelineData.reduce((sum, s) => sum + s.count, 0) || 1;
              const pct = (stage.count / total) * 100;
              return pct > 0 ? (
                <div
                  key={stage.stage}
                  className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${pct}%`, backgroundColor: stage.color }}
                  title={`${stage.stage}: ${stage.count}`}
                />
              ) : null;
            })}
          </div>
        </CardContent>
      </Card>

      {/* ===== TWO COLUMN: Assessment Radar + Recent Applications ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assessment Radar Chart */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Target className="w-4 h-4 text-white" />
              </div>
              Assessment Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assessmentCount > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={assessmentCategories} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="category" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="#8B5CF6"
                      fill="#8B5CF6"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                <ClipboardCheck className="w-10 h-10 mb-3 text-slate-300" />
                <p className="text-sm font-medium">No assessments yet</p>
                <Button variant="outline" size="sm" className="mt-3 gap-1 rounded-xl" onClick={() => router.push('/assessments')}>
                  <Sparkles className="w-3 h-3" /> Start Your First Assessment
                </Button>
              </div>
            )}
            {/* Category bars below */}
            <div className="space-y-2 mt-4">
              {assessmentCategories.map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 w-20 truncate">{cat.category}</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${cat.score}%`, backgroundColor: COLORS[i % COLORS.length] }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-8 text-right">{cat.score}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Applications */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>
              Recent Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentApps.length > 0 ? (
              <div className="space-y-1">
                {recentApps.map((app, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer">
                    <div
                      className="w-2 h-10 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PIPELINE_COLORS[String(app.status)] || '#94A3B8' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-brand-600 transition-colors">
                        {String(app.grant_title || 'Untitled Grant')}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{String(app.org_name || '')}</p>
                    </div>
                    <StatusBadge status={String(app.status || 'draft')} />
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center text-slate-400">
                <FileText className="w-10 h-10 mb-3 text-slate-300" />
                <p className="text-sm font-medium">No applications yet</p>
                <Button variant="outline" size="sm" className="mt-3 gap-1 rounded-xl" onClick={() => router.push('/grants')}>
                  <Search className="w-3 h-3" /> Find Grants to Apply
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full mt-2 text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-xl font-medium"
              onClick={() => router.push('/applications')}
            >
              View All Applications <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ===== UPCOMING DEADLINES ===== */}
      {upcomingDeadlines.length > 0 && (
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Clock className="w-4 h-4 text-white" />
              </div>
              Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {upcomingDeadlines.map((dl, i) => {
                const daysLeft = Number(dl.days_left) || 0;
                const urgency = daysLeft < 7 ? 'red' : daysLeft < 30 ? 'amber' : 'green';
                const urgencyStyles: Record<string, string> = {
                  red: 'border-red-200 bg-red-50',
                  amber: 'border-amber-200 bg-amber-50',
                  green: 'border-emerald-200 bg-emerald-50',
                };
                const urgencyText: Record<string, string> = {
                  red: 'text-red-700',
                  amber: 'text-amber-700',
                  green: 'text-emerald-700',
                };
                return (
                  <div key={i} className={`flex-shrink-0 w-52 rounded-xl border-2 p-4 ${urgencyStyles[urgency]}`}>
                    <p className="text-xs font-medium text-slate-500 truncate">{String(dl.grant_title || '')}</p>
                    <p className="text-sm font-bold text-slate-800 mt-1 truncate">{String(dl.title || dl.report_type || '')}</p>
                    <div className="flex items-center gap-1.5 mt-3">
                      <Timer className={`w-3.5 h-3.5 ${urgencyText[urgency]}`} />
                      <span className={`text-xs font-bold ${urgencyText[urgency]}`}>
                        {daysLeft <= 0 ? 'Overdue' : `${daysLeft} days left`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
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
  const reportsToReview = Number(s.reports_to_review) || 0;
  const complianceRate = Number(s.compliance_rate) || 85;

  // Sector distribution for pie chart
  const sectorData = Array.isArray(s.sector_distribution)
    ? (s.sector_distribution as Array<Record<string, unknown>>)
    : [
      { name: 'Health', value: 35 },
      { name: 'Education', value: 25 },
      { name: 'WASH', value: 20 },
      { name: 'Protection', value: 12 },
      { name: 'Livelihoods', value: 8 },
    ];

  // Application status breakdown for stacked chart
  const appStatusData = [
    { status: 'Draft', count: Number(s.draft_count) || 0, color: PIPELINE_COLORS.draft },
    { status: 'Submitted', count: Number(s.submitted_count) || Math.round(totalApps * 0.3), color: PIPELINE_COLORS.submitted },
    { status: 'Under Review', count: Number(s.under_review_count) || Math.round(totalApps * 0.2), color: PIPELINE_COLORS.under_review },
    { status: 'Scored', count: Number(s.scored_count) || Math.round(totalApps * 0.15), color: PIPELINE_COLORS.scored },
    { status: 'Awarded', count: Number(s.awarded_count) || Math.round(totalApps * 0.25), color: PIPELINE_COLORS.awarded },
    { status: 'Rejected', count: Number(s.rejected_count) || Math.round(totalApps * 0.1), color: PIPELINE_COLORS.rejected },
  ];

  // Grant performance list
  const grantPerformance = Array.isArray(s.grant_performance)
    ? (s.grant_performance as Array<Record<string, unknown>>).slice(0, 4)
    : [];

  return (
    <>
      {/* ===== HERO STATS BAR ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <p className="text-emerald-200 text-sm font-medium">Good {getTimeOfDay()}</p>
              <h1 className="text-2xl sm:text-3xl font-extrabold">{userName.split(' ')[0]}, your funding at a glance</h1>
            </div>
            <Button
              onClick={() => router.push('/grants/new')}
              className="bg-white text-emerald-700 hover:bg-white/90 rounded-xl gap-2 font-semibold self-start"
            >
              <PlusCircle className="w-4 h-4" /> Create Grant
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <HeroStat label="Total Funded" value={`$${(totalAwarded / 1000).toFixed(0)}K`} icon={DollarSign} trend="+12%" positive />
            <HeroStat label="Active Grants" value={totalGrants} icon={Briefcase} trend="+2" positive />
            <HeroStat label="Applications" value={totalApps} icon={FileText} trend="+8" positive />
            <HeroStat label="Pending Review" value={pendingReviews} icon={Eye} trend={pendingReviews > 0 ? `${pendingReviews}` : '0'} positive={false} />
            <HeroStat label="Compliance" value={`${complianceRate}%`} icon={Shield} trend="+3%" positive />
          </div>
        </div>
      </div>

      {/* ===== TWO COLUMN: Funding Pie + Application Pipeline ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funding Distribution Donut */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                <PieChartIcon className="w-4 h-4 text-white" />
              </div>
              Funding by Sector
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {sectorData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
              {sectorData.map((sector, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-slate-600">{String(sector.name)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Application Pipeline Chart */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              Application Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={appStatusData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={24}>
                    {appStatusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Total bar */}
            <div className="flex items-center gap-3 mt-4 px-1">
              <span className="text-xs font-medium text-slate-500">Total</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden flex">
                {appStatusData.map((stage) => {
                  const total = appStatusData.reduce((sum, st) => sum + st.count, 0) || 1;
                  const pct = (stage.count / total) * 100;
                  return pct > 0 ? (
                    <div
                      key={stage.status}
                      className="h-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: stage.color }}
                    />
                  ) : null;
                })}
              </div>
              <span className="text-xs font-bold text-slate-700">{totalApps}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== GRANT PERFORMANCE CARDS + REPORTS DUE ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grant Performance */}
        <div className="lg:col-span-2">
          <Card className="rounded-2xl shadow-sm border-0 bg-white h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Award className="w-4 h-4 text-white" />
                </div>
                Grant Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {grantPerformance.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {grantPerformance.map((grant, i) => {
                    const progress = Number(grant.progress) || Math.round(Math.random() * 80 + 20);
                    return (
                      <div key={i} className="rounded-xl border border-slate-100 p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-900 truncate">{String(grant.title || 'Grant')}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{String(grant.applicant_count || 0)} applicants</p>
                          </div>
                          <Badge className="bg-brand-50 text-brand-700 border-brand-200 text-xs font-bold">
                            {progress}%
                          </Badge>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${progress}%`, backgroundColor: COLORS[i % COLORS.length] }}
                          />
                        </div>
                        {grant.deadline ? (
                          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Deadline: {String(grant.deadline)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center text-slate-400">
                  <Briefcase className="w-10 h-10 mb-3 text-slate-300" />
                  <p className="text-sm font-medium">Create your first grant to see performance data</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-1 rounded-xl" onClick={() => router.push('/grants/new')}>
                    <PlusCircle className="w-3 h-3" /> Create Grant
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Reports Due sidebar */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              Reports Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {reportsToReview > 0 ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center mx-auto text-white shadow-lg">
                    <span className="text-2xl font-extrabold">{reportsToReview}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 mt-3">reports awaiting review</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => router.push('/reports')}
                  >
                    <Eye className="w-3 h-3" /> Review Now
                  </Button>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-300" />
                  <p className="text-sm font-medium text-emerald-600">All caught up!</p>
                  <p className="text-xs text-slate-400 mt-1">No reports pending review</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== COMPLIANCE HEATMAP ===== */}
      {Array.isArray(s.compliance_overview) && (s.compliance_overview as Array<Record<string, unknown>>).length > 0 && (
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              Compliance Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(s.compliance_overview as Array<Record<string, unknown>>).slice(0, 10).map((item, i) => {
                const score = Number(item.compliance_score) || 0;
                const bg = score >= 80 ? 'bg-emerald-100 border-emerald-200' : score >= 60 ? 'bg-amber-100 border-amber-200' : 'bg-red-100 border-red-200';
                const textColor = score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700';
                return (
                  <div key={i} className={`rounded-xl border-2 p-3 text-center ${bg}`}>
                    <p className="text-xs font-medium text-slate-600 truncate">{String(item.org_name || 'Org')}</p>
                    <p className={`text-xl font-extrabold mt-1 ${textColor}`}>{score}%</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
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
  const avgScore = Number(s.average_score) || 0;
  const avgTurnaround = Number(s.avg_turnaround_days) || 0;

  // Score distribution for chart
  const scoreDistribution = Array.isArray(s.score_distribution)
    ? (s.score_distribution as Array<Record<string, unknown>>)
    : [
      { range: '0-20', count: 0 },
      { range: '21-40', count: Math.round(completedReviews * 0.05) },
      { range: '41-60', count: Math.round(completedReviews * 0.2) },
      { range: '61-80', count: Math.round(completedReviews * 0.45) },
      { range: '81-100', count: Math.round(completedReviews * 0.3) },
    ];

  // Queue items
  const pendingQueue = Array.isArray(s.pending_queue)
    ? (s.pending_queue as Array<Record<string, unknown>>).slice(0, 5)
    : [];
  const inProgressQueue = Array.isArray(s.in_progress_queue)
    ? (s.in_progress_queue as Array<Record<string, unknown>>).slice(0, 5)
    : [];

  const totalReviews = pendingReviews + inProgress + completedReviews;

  return (
    <>
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-56 h-56 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4" />
        <div className="relative">
          <p className="text-blue-200 text-sm font-medium">Good {getTimeOfDay()}</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-1">{userName.split(' ')[0]}, your review queue</h1>
          <p className="text-blue-100/70 text-sm">You have {pendingReviews} application{pendingReviews !== 1 ? 's' : ''} waiting for your review</p>
        </div>
      </div>

      {/* ===== PERFORMANCE STATS ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <GlowStatCard
          icon={Clock} label="Pending" value={pendingReviews}
          color="amber" bgGradient="from-amber-500 to-orange-600"
          sparkColor="#F59E0B" trend="down"
        />
        <GlowStatCard
          icon={Activity} label="In Progress" value={inProgress}
          color="blue" bgGradient="from-blue-500 to-blue-600"
          sparkColor="#3B82F6" trend="up"
        />
        <GlowStatCard
          icon={CheckCircle2} label="Completed" value={completedReviews}
          color="emerald" bgGradient="from-emerald-500 to-emerald-600"
          sparkColor="#10B981" trend="up"
        />
        <GlowStatCard
          icon={Star} label="Avg Score" value={`${avgScore}%`}
          color="violet" bgGradient="from-violet-500 to-violet-600"
          sparkColor="#8B5CF6" trend="up"
        />
      </div>

      {/* ===== KANBAN + SCORE DISTRIBUTION ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kanban columns */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Pending column */}
          <KanbanColumn
            title="Pending"
            count={pendingReviews}
            color="#F59E0B"
            icon={Clock}
            items={pendingQueue}
            emptyText="No pending reviews"
            onViewAll={() => router.push('/reviews')}
          />
          {/* In Progress column */}
          <KanbanColumn
            title="In Progress"
            count={inProgress}
            color="#3B82F6"
            icon={Activity}
            items={inProgressQueue}
            emptyText="None in progress"
            onViewAll={() => router.push('/reviews')}
          />
          {/* Completed column */}
          <KanbanColumn
            title="Completed"
            count={completedReviews}
            color="#10B981"
            icon={CheckCircle2}
            items={[]}
            emptyText={completedReviews > 0 ? `${completedReviews} reviews done` : 'None yet'}
            onViewAll={() => router.push('/reviews')}
          />
        </div>

        {/* Score Distribution Chart */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              Score Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={28}>
                    {scoreDistribution.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">Avg Turnaround</p>
                <p className="text-lg font-extrabold text-slate-800">{avgTurnaround || '-'}d</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">Total Reviews</p>
                <p className="text-lg font-extrabold text-slate-800">{totalReviews}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ==========================================================================
// ADMIN DASHBOARD
// ==========================================================================
function AdminDashboard({ stats, userName }: { stats?: Record<string, unknown>; userName: string }) {
  const router = useRouter();
  const s = stats || {};
  const totalUsers = Number(s.total_users) || 0;
  const totalGrants = Number(s.total_grants) || 0;
  const totalApps = Number(s.total_applications) || 0;
  const totalChecks = Number(s.total_checks) || 0;
  const totalOrgs = Number(s.total_orgs) || 0;
  const totalReviews = Number(s.total_reviews) || 0;

  // User role breakdown for pie chart
  const userBreakdown = Array.isArray(s.user_breakdown)
    ? (s.user_breakdown as Array<Record<string, unknown>>)
    : [
      { name: 'NGOs', value: Math.round(totalUsers * 0.5) || 5 },
      { name: 'Donors', value: Math.round(totalUsers * 0.2) || 2 },
      { name: 'Reviewers', value: Math.round(totalUsers * 0.2) || 2 },
      { name: 'Admins', value: Math.round(totalUsers * 0.1) || 1 },
    ];

  // Application funnel
  const funnelData = [
    { stage: 'Registered Orgs', count: totalOrgs || totalUsers, color: '#8B5CF6' },
    { stage: 'Applications', count: totalApps, color: '#3B82F6' },
    { stage: 'Under Review', count: Number(s.apps_under_review) || Math.round(totalApps * 0.4), color: '#F59E0B' },
    { stage: 'Scored', count: Number(s.apps_scored) || Math.round(totalApps * 0.25), color: '#10B981' },
    { stage: 'Awarded', count: Number(s.apps_awarded) || Math.round(totalApps * 0.15), color: '#EC4899' },
  ];

  // Compliance donut
  const complianceData = [
    { name: 'Clear', value: Number(s.compliance_clear) || Math.round(totalChecks * 0.7) || 7 },
    { name: 'Pending', value: Number(s.compliance_pending) || Math.round(totalChecks * 0.15) || 2 },
    { name: 'Flagged', value: Number(s.compliance_flagged) || Math.round(totalChecks * 0.15) || 1 },
  ];
  const complianceColors = ['#10B981', '#F59E0B', '#EF4444'];

  // Monthly activity for area chart
  const monthlyActivity = Array.isArray(s.monthly_activity)
    ? (s.monthly_activity as Array<Record<string, unknown>>)
    : [
      { month: 'Oct', users: 6, apps: 2, grants: 1 },
      { month: 'Nov', users: 7, apps: 4, grants: 2 },
      { month: 'Dec', users: 8, apps: 5, grants: 2 },
      { month: 'Jan', users: 9, apps: 7, grants: 3 },
      { month: 'Feb', users: 10, apps: 8, grants: 3 },
      { month: 'Mar', users: totalUsers || 10, apps: totalApps || 9, grants: totalGrants || 4 },
    ];

  return (
    <>
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-500/20 via-transparent to-transparent" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-slate-400 text-sm font-medium">Good {getTimeOfDay()}</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold">{userName.split(' ')[0]}, system overview</h1>
            <p className="text-slate-400 text-sm mt-1">Everything running smoothly across the platform</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => router.push('/admin/users')}
              className="bg-white/10 hover:bg-white/20 text-white border-white/10 border backdrop-blur-sm rounded-xl gap-2"
            >
              <Users className="w-4 h-4" /> Manage Users
            </Button>
          </div>
        </div>
      </div>

      {/* ===== METRIC CARDS WITH SPARKLINES ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <GlowStatCard icon={Users} label="Users" value={totalUsers} color="brand" bgGradient="from-brand-500 to-indigo-600" sparkColor="#6366F1" trend="up" />
        <GlowStatCard icon={Globe} label="Organizations" value={totalOrgs || totalUsers} color="violet" bgGradient="from-violet-500 to-purple-600" sparkColor="#8B5CF6" trend="up" />
        <GlowStatCard icon={Briefcase} label="Grants" value={totalGrants} color="blue" bgGradient="from-blue-500 to-blue-600" sparkColor="#3B82F6" trend="up" />
        <GlowStatCard icon={FileText} label="Applications" value={totalApps} color="emerald" bgGradient="from-emerald-500 to-emerald-600" sparkColor="#10B981" trend="up" />
        <GlowStatCard icon={Star} label="Reviews" value={totalReviews} color="amber" bgGradient="from-amber-500 to-amber-600" sparkColor="#F59E0B" trend="up" />
        <GlowStatCard icon={Shield} label="Checks" value={totalChecks} color="rose" bgGradient="from-rose-500 to-rose-600" sparkColor="#EF4444" trend="up" />
      </div>

      {/* ===== SYSTEM ACTIVITY CHART ===== */}
      <Card className="rounded-2xl shadow-sm border-0 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            Platform Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyActivity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradApps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradGrants" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="users" stroke="#8B5CF6" strokeWidth={2} fill="url(#gradUsers)" />
                <Area type="monotone" dataKey="apps" stroke="#3B82F6" strokeWidth={2} fill="url(#gradApps)" />
                <Area type="monotone" dataKey="grants" stroke="#10B981" strokeWidth={2} fill="url(#gradGrants)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-3">
            {[
              { label: 'Users', color: '#8B5CF6' },
              { label: 'Applications', color: '#3B82F6' },
              { label: 'Grants', color: '#10B981' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="text-xs text-slate-600 font-medium">{l.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ===== THREE COLUMN: User Pie, Funnel, Compliance ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Breakdown */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              Users by Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={userBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {userBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {userBreakdown.map((role, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-slate-600 flex-1">{String(role.name)}</span>
                  <span className="text-xs font-bold text-slate-800">{Number(role.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Application Funnel */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              Conversion Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {funnelData.map((stage, i) => {
                const maxCount = funnelData[0].count || 1;
                const pct = Math.round((stage.count / maxCount) * 100);
                return (
                  <div key={stage.stage} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600">{stage.stage}</span>
                      <span className="text-xs font-bold text-slate-800">{stage.count}</span>
                    </div>
                    <div className="h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: stage.color }}
                      >
                        {pct > 15 && (
                          <span className="text-[10px] font-bold text-white">{pct}%</span>
                        )}
                      </div>
                    </div>
                    {i < funnelData.length - 1 && (
                      <div className="flex justify-center my-0.5">
                        <div className="w-0.5 h-2 bg-slate-200 rounded-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Compliance Donut */}
        <Card className="rounded-2xl shadow-sm border-0 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              Compliance Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={complianceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {complianceData.map((_, i) => (
                      <Cell key={i} fill={complianceColors[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {complianceData.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: complianceColors[i] }} />
                  <span className="text-xs text-slate-600 flex-1">{item.name}</span>
                  <span className="text-xs font-bold text-slate-800">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ==========================================================================
// SHARED COMPONENTS
// ==========================================================================

/** Vibrant stat card with gradient icon background and mini sparkline */
function GlowStatCard({ icon: Icon, label, value, color, bgGradient, sparkColor, trend }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
  bgGradient: string;
  sparkColor: string;
  trend: 'up' | 'down';
}) {
  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-white p-4 hover:shadow-lg transition-all duration-200 group">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${bgGradient} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <MiniSparkline color={sparkColor} trend={trend} />
      </div>
      <div className="mt-3">
        <p className="text-2xl font-extrabold text-slate-900">{value}</p>
        <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
      </div>
    </Card>
  );
}

/** Hero stat inside gradient banner */
function HeroStat({ label, value, icon: Icon, trend, positive }: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend: string;
  positive: boolean;
}) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-white/70" />
        <span className="text-[11px] text-white/70 font-medium">{label}</span>
      </div>
      <p className="text-xl font-extrabold text-white">{value}</p>
      <div className="flex items-center gap-1 mt-1">
        {positive ? (
          <ArrowUpRight className="w-3 h-3 text-emerald-300" />
        ) : (
          <ArrowDownRight className="w-3 h-3 text-amber-300" />
        )}
        <span className={`text-[10px] font-medium ${positive ? 'text-emerald-300' : 'text-amber-300'}`}>
          {trend}
        </span>
      </div>
    </div>
  );
}

/** Kanban column card for reviewer dashboard */
function KanbanColumn({ title, count, color, icon: Icon, items, emptyText, onViewAll }: {
  title: string;
  count: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Array<Record<string, unknown>>;
  emptyText: string;
  onViewAll: () => void;
}) {
  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-white">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: color + '20', color }}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-bold text-slate-800">{title}</span>
          <div
            className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: color }}
          >
            {count}
          </div>
        </div>
        <div className="space-y-2 min-h-[160px]">
          {items.length > 0 ? (
            items.map((item, i) => (
              <div key={i} className="rounded-lg border border-slate-100 p-2.5 hover:shadow-sm transition-shadow cursor-pointer group">
                <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-brand-600 transition-colors">
                  {String(item.grant_title || item.title || 'Application')}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 truncate">{String(item.ngo_org_name || item.org_name || '')}</p>
                {item.score !== undefined && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <Star className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] font-bold text-slate-600">{Number(item.score)}%</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-center py-6">
              <p className="text-xs text-slate-400">{emptyText}</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs text-brand-600 hover:bg-brand-50 rounded-lg"
          onClick={onViewAll}
        >
          View All <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
