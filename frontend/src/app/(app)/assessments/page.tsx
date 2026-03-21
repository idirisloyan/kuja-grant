'use client';

import { useRouter } from 'next/navigation';
import { useAssessments, useAssessmentFrameworks } from '@/lib/hooks/use-api';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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

const FRAMEWORK_COLORS: Record<string, string> = {
  kuja: 'bg-brand-50 border-brand-200 text-brand-700',
  step: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  un_hact: 'bg-blue-50 border-blue-200 text-blue-700',
  chs: 'bg-amber-50 border-amber-200 text-amber-700',
  nupas: 'bg-violet-50 border-violet-200 text-violet-700',
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
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40 lg:col-span-3" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assessment Hub</h1>
          <p className="text-sm text-slate-500 mt-1">
            Measure and strengthen your organization&apos;s capacity
          </p>
        </div>
        <Button
          className="gap-2 bg-brand-600 hover:bg-brand-700"
          onClick={() => router.push('/assessments/wizard')}
        >
          <Play className="w-4 h-4" /> Start Assessment
        </Button>
      </div>

      {/* Current Score Card + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-1">
          <CardContent className="py-6 flex flex-col items-center">
            <ScoreRing score={currentScore} size={120} strokeWidth={8} label="Score" />
            <p className="text-sm font-semibold text-slate-900 mt-3">{getLevelLabel(currentScore)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Current Capacity Level</p>
            {latestAssessment && (
              <Badge variant="outline" className="mt-2 text-xs bg-slate-50 text-slate-500 border-slate-200">
                {latestAssessment.framework.toUpperCase()} Framework
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-600" />
              Assessment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{assessments.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Total Assessments</p>
              </div>
              <div className="text-center p-3 bg-emerald-50 rounded-lg">
                <p className="text-2xl font-bold text-emerald-700">{completedAssessments.length}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Completed</p>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <p className="text-2xl font-bold text-amber-700">
                  {assessments.filter((a) => a.status !== 'completed').length}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">In Progress</p>
              </div>
              <div className="text-center p-3 bg-brand-50 rounded-lg">
                <p className="text-2xl font-bold text-brand-700">{Object.keys(frameworks).length}</p>
                <p className="text-xs text-brand-600 mt-0.5">Frameworks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Framework Cards */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Assessment Frameworks</h2>
        {Object.keys(frameworks).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No frameworks available</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {Object.entries(frameworks).map(([key, fw]) => {
              const info = fw as FrameworkInfo;
              const colorClass = FRAMEWORK_COLORS[key] || 'bg-slate-50 border-slate-200 text-slate-700';
              const icon = FRAMEWORK_ICONS[key] || '?';
              return (
                <Card key={key} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold mb-3 border ${colorClass}`}>
                      {icon}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">{info.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{info.description}</p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {info.estimated_time}
                      </span>
                      <span className="flex items-center gap-1">
                        <ListChecks className="w-3 h-3" /> {info.total_items} items
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3 gap-1"
                      onClick={() => router.push(`/assessments/wizard?framework=${key}`)}
                    >
                      <Play className="w-3 h-3" /> Start Assessment
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Previous Assessments */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Previous Assessments</h2>
        {assessments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No assessments completed yet</p>
              <p className="text-xs text-slate-400 mt-1">Start your first assessment to measure your capacity</p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={() => router.push('/assessments/wizard')}
              >
                Start Assessment <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Framework</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold border ${FRAMEWORK_COLORS[a.framework] || 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                            {FRAMEWORK_ICONS[a.framework] || '?'}
                          </div>
                          <span className="text-sm font-medium text-slate-900 uppercase">{a.framework.replace('_', '-')}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {a.overall_score !== null ? (
                          <div className="flex justify-center">
                            <ScoreRing score={Math.round(a.overall_score)} size={40} strokeWidth={3} />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          {formatDate(a.completed_at || a.created_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
