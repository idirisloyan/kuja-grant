'use client';

import { useRouter } from 'next/navigation';
import { useAssessments, useAssessmentFrameworks } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';
import { InfoTip } from '@/components/shared/info-tip';
import {
  ClipboardCheck, Clock, ListChecks, ArrowRight, Play, TrendingUp, Award,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FrameworkInfo } from '@/lib/types';

function getLevelKey(score: number): string {
  if (score >= 90) return 'assessments.level.excellent';
  if (score >= 80) return 'assessments.level.very_good';
  if (score >= 70) return 'assessments.level.good';
  if (score >= 60) return 'assessments.level.satisfactory';
  if (score >= 40) return 'assessments.level.developing';
  return 'assessments.level.needs_improvement';
}

const FW_COLORS: Record<string, { bg: string; fg: string }> = {
  kuja:    { bg: 'bg-[hsl(var(--kuja-sand-50))]',     fg: 'text-[hsl(var(--kuja-clay-dark))]' },
  step:    { bg: 'bg-[hsl(142_68%_96%)]',             fg: 'text-[hsl(var(--kuja-grow))]' },
  un_hact: { bg: 'bg-blue-50',                         fg: 'text-blue-700' },
  chs:     { bg: 'bg-[hsl(32_100%_96%)]',             fg: 'text-[hsl(var(--kuja-sun))]' },
  nupas:   { bg: 'bg-[hsl(var(--kuja-spark-soft))]',  fg: 'text-[hsl(var(--kuja-spark))]' },
};

const FW_ICON: Record<string, string> = { kuja: 'K', step: 'S', un_hact: 'U', chs: 'C', nupas: 'N' };

export default function AssessmentsPage() {
  const router = useRouter();
  const { t, formatDate } = useTranslation();
  const { data: assessData, isLoading: assessLoading } = useAssessments();
  const { data: fwData, isLoading: fwLoading } = useAssessmentFrameworks();

  const assessments = assessData?.assessments ?? [];
  const frameworks = fwData?.frameworks ?? {};
  const isLoading = assessLoading || fwLoading;

  const completedAssessments = assessments.filter((a) => a.status === 'completed' && a.overall_score !== null);
  const latestAssessment = completedAssessments.length > 0
    ? completedAssessments.sort((a, b) => {
        const dA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const dB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return dB - dA;
      })[0]
    : null;
  const currentScore = latestAssessment?.overall_score ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="kuja-shimmer h-40 rounded-xl" />
          <div className="kuja-shimmer h-40 rounded-xl lg:col-span-3" />
        </div>
        <div className="kuja-shimmer h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="kuja-display text-3xl inline-flex items-center gap-2">
            {t('assessment.hub_title')}
            <InfoTip>{t('glossary.capacity_assessment')}</InfoTip>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('assessment.hub_subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/assessments/wizard')}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2"
        >
          <Play className="h-4 w-4" />
          {t('assessment.start')}
        </button>
      </div>

      {/* Score + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-background p-5 flex flex-col items-center text-center">
          <ScoreRing score={currentScore} size={120} strokeWidth={8} label={t('assessments.score_label')} />
          <p className="mt-3 text-sm font-semibold">{t(getLevelKey(currentScore))}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('assessments.current_capacity_level')}</p>
          {latestAssessment && (
            <span className="mt-3 rounded-full border border-border text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5">
              {latestAssessment.framework.toUpperCase()} framework
            </span>
          )}
        </div>
        <div className="rounded-xl border border-border bg-background p-5 lg:col-span-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{t('assessment.summary_title')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={t('assessment.summary_total')} value={assessments.length} />
            <Stat label={t('assessment.summary_completed')} value={completedAssessments.length} tone="success" />
            <Stat label={t('assessment.summary_in_progress')} value={assessments.filter((a) => a.status !== 'completed').length} tone="warn" />
            <Stat label={t('assessment.summary_frameworks')} value={Object.keys(frameworks).length} tone="primary" />
          </div>
        </div>
      </div>

      {/* Frameworks */}
      <div>
        <h2 className="kuja-display text-xl mb-3">{t('assessment.frameworks_title')}</h2>
        {Object.keys(frameworks).length === 0 ? (
          <EmptyBox icon={ClipboardCheck} label={t('assessment.no_frameworks')} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {Object.entries(frameworks).map(([key, fw]) => {
              const info = fw as FrameworkInfo;
              const c = FW_COLORS[key] ?? { bg: 'bg-muted', fg: 'text-muted-foreground' };
              return (
                <div key={key} className="rounded-xl border border-border bg-background p-4 hover:shadow-md transition-all">
                  <div className={cn('w-10 h-10 rounded-lg grid place-items-center font-bold text-lg mb-2', c.bg, c.fg)}>
                    {FW_ICON[key] ?? '?'}
                  </div>
                  <p className="text-sm font-semibold">{t(`framework.${key}.label`)}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t(`framework.${key}.description`)}</p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {info.estimated_minutes_min != null && info.estimated_minutes_max != null
                        ? t('framework.minutes_range', { min: info.estimated_minutes_min, max: info.estimated_minutes_max })
                        : info.estimated_time}
                    </span>
                    <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" /> {t('framework.items_count', { n: info.total_items })}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/assessments/wizard?framework=${key}`)}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand-50))] text-xs font-medium px-3 py-1.5"
                  >
                    <Play className="h-3 w-3" /> {t('framework.select_cta')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Previous assessments */}
      <div>
        <h2 className="kuja-display text-xl mb-3">{t('assessment.previous_title')}</h2>
        {assessments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background px-6 py-12 text-center">
            <Award className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">{t('assessment.no_assessments')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('assessment.no_assessments_hint')}</p>
            <button
              type="button"
              onClick={() => router.push('/assessments/wizard')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] text-sm font-medium px-4 py-2"
            >
              {t('assessment.start')} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-background overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">{t('assessments.col.framework')}</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-center">{t('assessments.col.score')}</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">{t('assessments.col.date')}</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">{t('assessments.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((a) => {
                    const c = FW_COLORS[a.framework] ?? { bg: 'bg-muted', fg: 'text-muted-foreground' };
                    return (
                      <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn('w-7 h-7 rounded grid place-items-center text-xs font-bold', c.bg, c.fg)}>
                              {FW_ICON[a.framework] ?? '?'}
                            </div>
                            <span className="font-medium uppercase">{a.framework.replace('_', '-')}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {a.overall_score !== null ? (
                            <div className="flex justify-center">
                              <ScoreRing score={Math.round(a.overall_score)} size={40} strokeWidth={3} />
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(a.completed_at || a.created_at)}</td>
                        <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warn' | 'primary' }) {
  const cls = tone === 'success'
    ? 'bg-[hsl(142_68%_96%)] text-[hsl(var(--kuja-grow))]'
    : tone === 'warn'
    ? 'bg-[hsl(32_100%_96%)] text-[hsl(var(--kuja-sun))]'
    : tone === 'primary'
    ? 'bg-[hsl(var(--kuja-sand-50))] text-[hsl(var(--kuja-clay-dark))]'
    : 'bg-muted text-foreground';
  return (
    <div className={cn('rounded-lg p-3 text-center', cls)}>
      <div className="kuja-numeric text-2xl font-semibold">{value}</div>
      <div className="text-xs mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

function EmptyBox({ icon: Icon, label }: { icon: typeof ClipboardCheck; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-6 py-12 text-center">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
