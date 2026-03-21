'use client';

import { useAuthStore } from '@/stores/auth-store';
import { useDashboardStats } from '@/lib/hooks/use-api';
import { StatCard } from '@/components/shared/stat-card';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import {
  BarChart3, FileText, Search, ClipboardCheck, Briefcase, Star, Users,
  Shield, PlusCircle, ArrowRight, Calendar, TrendingUp, AlertTriangle,
} from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useDashboardStats();
  const router = useRouter();
  const stats = data?.stats as Record<string, unknown> | undefined;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome, {user.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {user.role === 'ngo' && 'Manage your grants, assessments, and compliance'}
            {user.role === 'donor' && 'Create grants, review applications, and track compliance'}
            {user.role === 'reviewer' && 'Review and score assigned applications'}
            {user.role === 'admin' && 'System overview and administration'}
          </p>
        </div>
        <div className="flex gap-2">
          {user.role === 'ngo' && (
            <>
              <Button onClick={() => router.push('/assessments')} variant="outline" className="gap-2">
                <ClipboardCheck className="w-4 h-4" /> Start Assessment
              </Button>
              <Button onClick={() => router.push('/grants')} className="gap-2 bg-brand-600 hover:bg-brand-700">
                <Search className="w-4 h-4" /> Browse Grants
              </Button>
            </>
          )}
          {user.role === 'donor' && (
            <Button onClick={() => router.push('/grants/new')} className="gap-2 bg-brand-600 hover:bg-brand-700">
              <PlusCircle className="w-4 h-4" /> Create Grant
            </Button>
          )}
        </div>
      </div>

      {/* Role-specific dashboards */}
      {user.role === 'ngo' && <NGODashboard stats={stats} />}
      {user.role === 'donor' && <DonorDashboard stats={stats} />}
      {user.role === 'reviewer' && <ReviewerDashboard stats={stats} />}
      {user.role === 'admin' && <AdminDashboard stats={stats} />}
    </div>
  );
}

function NGODashboard({ stats }: { stats?: Record<string, unknown> }) {
  const router = useRouter();
  const s = stats || {};
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Capacity Score" value={`${s.average_score || 0}%`} color="brand" />
        <StatCard icon={FileText} label="Applications" value={Number(s.total_applications) || 0} color="blue" />
        <StatCard icon={Search} label="Open Grants" value={Number(s.open_grants) || 0} color="emerald" />
        <StatCard icon={Calendar} label="Pending Reports" value={Number(s.pending_reports) || 0} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Applications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" /> Recent Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(s.recent_applications) && s.recent_applications.length > 0 ? (
              <div className="space-y-3">
                {(s.recent_applications as Array<Record<string, unknown>>).slice(0, 5).map((app, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{String(app.grant_title || '')}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{String(app.org_name || '')}</p>
                    </div>
                    <StatusBadge status={String(app.status || 'draft')} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-4 text-center">No applications yet</p>
            )}
            <Button variant="ghost" className="w-full mt-3 text-brand-600" onClick={() => router.push('/applications')}>
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* Capacity Assessment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-brand-600" /> Capacity Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <ScoreRing score={Number(s.average_score) || 0} size={100} label="Score" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">
                {Number(s.average_score) >= 80 ? 'Excellent' : Number(s.average_score) >= 60 ? 'Good' : 'Needs Improvement'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {Number(s.assessments) || 0} assessments completed
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => router.push('/assessments')}>
                <ClipboardCheck className="w-3 h-3" /> View Details
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DonorDashboard({ stats }: { stats?: Record<string, unknown> }) {
  const s = stats || {};
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard icon={Briefcase} label="Total Grants" value={Number(s.total_grants) || 0} color="brand" />
      <StatCard icon={FileText} label="Applications" value={Number(s.total_applications) || 0} color="blue" />
      <StatCard icon={Star} label="Pending Review" value={Number(s.pending_reviews) || 0} color="amber" />
      <StatCard icon={TrendingUp} label="Total Awarded" value={`$${((Number(s.total_awarded) || 0) / 1000).toFixed(0)}K`} color="emerald" />
      <StatCard icon={BarChart3} label="Reports to Review" value={Number(s.reports_to_review) || 0} color="violet" />
    </div>
  );
}

function ReviewerDashboard({ stats }: { stats?: Record<string, unknown> }) {
  const s = stats || {};
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={FileText} label="Assignments" value={Number(s.pending_reviews) || 0} color="blue" />
      <StatCard icon={AlertTriangle} label="In Progress" value={Number(s.in_progress) || 0} color="amber" />
      <StatCard icon={Star} label="Completed" value={Number(s.completed_reviews) || 0} color="emerald" />
      <StatCard icon={TrendingUp} label="Avg Score" value={`${Number(s.average_score) || 0}%`} color="brand" />
    </div>
  );
}

function AdminDashboard({ stats }: { stats?: Record<string, unknown> }) {
  const s = stats || {};
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={Users} label="Users" value={Number(s.total_users) || 0} color="brand" />
      <StatCard icon={Briefcase} label="Grants" value={Number(s.total_grants) || 0} color="blue" />
      <StatCard icon={FileText} label="Applications" value={Number(s.total_applications) || 0} color="emerald" />
      <StatCard icon={Shield} label="Compliance Checks" value={Number(s.total_checks) || 0} color="amber" />
    </div>
  );
}
