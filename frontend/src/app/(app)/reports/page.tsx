'use client';

import { useState, useMemo, useRef } from 'react';
import { useReports, useUpcomingReports } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';
import type { Report } from '@/lib/types';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Upload,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getDeadlineText(dateStr: string | null | undefined): { label: string; cls: string } {
  if (!dateStr) return { label: '', cls: 'text-muted-foreground' };
  const days = getDaysUntil(dateStr);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, cls: 'text-red-600' };
  if (days === 0) return { label: 'Due today', cls: 'text-red-600' };
  if (days <= 7) return { label: `${days}d left`, cls: 'text-red-600' };
  if (days <= 30) return { label: `${days}d left`, cls: 'text-amber-600' };
  return { label: `${days}d left`, cls: 'text-muted-foreground' };
}

function getUrgencyColor(dateStr: string): string {
  const days = getDaysUntil(dateStr);
  if (days < 0) return '#EF4444';
  if (days <= 7) return '#F59E0B';
  if (days <= 30) return '#3B82F6';
  return '#9CA3AF';
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[10px] border border-border bg-card shadow-[var(--kuja-elev-1)] ${className}`}>
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const palette: Record<string, string> = {
    accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    submitted: 'bg-sky-50 text-sky-700 border-sky-200',
    under_review: 'bg-amber-50 text-amber-700 border-amber-200',
    revision_requested: 'bg-amber-50 text-amber-700 border-amber-200',
    draft: 'bg-muted text-muted-foreground border-border',
  };
  const labels: Record<string, string> = {
    accepted: 'Accepted',
    submitted: 'Submitted',
    under_review: 'Review',
    revision_requested: 'Revise',
    draft: 'Draft',
  };
  const cls = palette[status] ?? palette.draft;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

function TypeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Compliance Calendar
// ---------------------------------------------------------------------------

interface CalendarDeadline {
  report: Report;
  grantTitle: string;
}

function ComplianceCalendar({ reportsByGrant }: {
  reportsByGrant: Array<{ grantId: number; grantTitle: string; reports: Report[] }>;
}) {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [popoverDate, setPopoverDate] = useState<string | null>(null);
  const [popoverDeadlines, setPopoverDeadlines] = useState<CalendarDeadline[]>([]);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const deadlineMap = useMemo(() => {
    const map = new Map<string, CalendarDeadline[]>();
    reportsByGrant.forEach((group) => {
      group.reports.forEach((r) => {
        if (!r.due_date) return;
        const d = new Date(r.due_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ report: r, grantTitle: group.grantTitle });
      });
    });
    return map;
  }, [reportsByGrant]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDayOfMonth = new Date(year, month, 1);
  const startDow = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const cells: Array<{ day: number | null; dateKey: string }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: null, dateKey: '' });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateKey });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateKey: '' });

  const handleDayClick = (event: React.MouseEvent<HTMLButtonElement>, dateKey: string) => {
    const deadlines = deadlineMap.get(dateKey);
    if (deadlines && deadlines.length > 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
      setPopoverDate(dateKey);
      setPopoverDeadlines(deadlines);
    }
  };

  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{t('report.calendar')}</div>
          <div className="text-xs text-muted-foreground">{t('report.calendar_subtitle')}</div>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          {[
            { color: '#EF4444', label: t('common.overdue') },
            { color: '#F59E0B', label: '< 7d' },
            { color: '#3B82F6', label: '< 30d' },
            { color: '#9CA3AF', label: '30d+' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-center gap-2">
        <button
          className="rounded-md p-1 hover:bg-muted"
          onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[140px] text-center text-sm font-semibold">{monthName}</span>
        <button
          className="rounded-md p-1 hover:bg-muted"
          onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7">
        {dayHeaders.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (cell.day === null) return <div key={`e-${i}`} className="py-2" />;
          const deadlines = deadlineMap.get(cell.dateKey);
          const hasDeadlines = deadlines && deadlines.length > 0;
          const isToday = cell.dateKey === todayKey;

          let dotColor = '';
          if (hasDeadlines) {
            const colors = deadlines.map((dl) => getUrgencyColor(dl.report.due_date!));
            if (colors.includes('#EF4444')) dotColor = '#EF4444';
            else if (colors.includes('#F59E0B')) dotColor = '#F59E0B';
            else if (colors.includes('#3B82F6')) dotColor = '#3B82F6';
            else dotColor = '#9CA3AF';
          }

          return (
            <button
              key={cell.dateKey}
              onClick={hasDeadlines ? (e) => handleDayClick(e, cell.dateKey) : undefined}
              disabled={!hasDeadlines}
              className={`relative rounded-md py-1.5 text-center transition ${
                hasDeadlines ? 'cursor-pointer hover:bg-muted' : 'cursor-default'
              } ${isToday ? 'bg-[hsl(var(--kuja-clay)/0.08)] ring-1 ring-[hsl(var(--kuja-clay)/0.25)]' : ''}`}
            >
              <span
                className={`text-xs ${
                  isToday ? 'font-bold text-[hsl(var(--kuja-clay))]' : 'text-foreground'
                }`}
              >
                {cell.day}
              </span>
              {hasDeadlines && (
                <div className="mt-0.5 flex items-center justify-center gap-0.5">
                  {deadlines.length <= 3 ? (
                    deadlines.map((dl, idx) => (
                      <span
                        key={idx}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: getUrgencyColor(dl.report.due_date!) }}
                      />
                    ))
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
                      <span className="text-[8px] leading-none text-muted-foreground">
                        +{deadlines.length - 1}
                      </span>
                    </>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {popoverDate && popoverPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopoverDate(null)} />
          <div
            className="absolute z-50 max-w-[320px] rounded-[10px] border border-border bg-card p-3 shadow-[var(--kuja-elev-3)]"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            <div className="mb-2 text-sm font-semibold">
              {new Date(popoverDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            <div className="space-y-1.5">
              {popoverDeadlines.map((dl, i) => {
                const urgencyColor = getUrgencyColor(dl.report.due_date!);
                return (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: urgencyColor }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{dl.report.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{dl.grantTitle}</div>
                    </div>
                    <button className="rounded-md border border-border px-2 py-0.5 text-[10px] hover:bg-background">
                      {dl.report.status === 'draft' ? t('report.continue_draft') : t('report.start_report')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AI Guidance Panel
// ---------------------------------------------------------------------------

function AIReportGuidancePanel({ report }: { report: Report }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [sectionContent, setSectionContent] = useState('');
  const [requirement, setRequirement] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ quality_score: number; guidance: string } | null>(null);

  const handleGetFeedback = async () => {
    if (!sectionContent.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await api.post<{ success: boolean; guidance: string; quality_score: number }>(
        '/ai/guidance',
        {
          field_name: report.report_type || 'report_section',
          grant_criteria: requirement || undefined,
          current_text: sectionContent,
        },
      );
      setResult({ quality_score: resp.quality_score || 0, guidance: resp.guidance || '' });
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  };

  const { strengths, suggestions } = useMemo(() => {
    if (!result?.guidance) return { strengths: [] as string[], suggestions: [] as string[] };
    const lines = result.guidance.split('\n').filter((l) => l.trim());
    const s: string[] = [];
    const sugg: string[] = [];
    let section = 'suggestions';
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('strength') || lower.includes('good') || lower.includes('well')) section = 'strengths';
      if (
        lower.includes('suggestion') ||
        lower.includes('improve') ||
        lower.includes('consider') ||
        lower.includes('recommend')
      )
        section = 'suggestions';
      const cleaned = line.replace(/^[-*\u2022]\s*/, '').trim();
      if (cleaned.length < 5) continue;
      if (section === 'strengths') s.push(cleaned);
      else sugg.push(cleaned);
    }
    if (s.length === 0 && sugg.length === 0) {
      return {
        strengths: [],
        suggestions: lines
          .map((l) => l.replace(/^[-*\u2022]\s*/, '').trim())
          .filter((l) => l.length > 4),
      };
    }
    return { strengths: s, suggestions: sugg };
  }, [result]);

  if (report.status !== 'draft') return null;

  const scoreCls = result
    ? result.quality_score >= 80
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : result.quality_score >= 60
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200'
    : '';

  const ta =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]';

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--kuja-spark))] hover:underline"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t('report.ai_guidance')}
      </button>
      {open && (
        <div className="mt-1 rounded-[10px] border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] p-3">
          <div className="mb-2 text-xs font-semibold text-[hsl(var(--kuja-spark))]">
            {t('report.ai_guidance_subtitle')}
          </div>
          <div className="mb-2 space-y-2">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('report.donor_requirement')}
              </label>
              <textarea
                rows={2}
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                className={ta}
                placeholder={t('report.donor_requirement')}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('report.section_content')}
              </label>
              <textarea
                rows={3}
                value={sectionContent}
                onChange={(e) => setSectionContent(e.target.value)}
                className={ta}
                placeholder={t('report.section_content')}
              />
            </div>
          </div>
          <button
            onClick={handleGetFeedback}
            disabled={loading || !sectionContent.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-medium text-white hover:bg-[hsl(var(--kuja-clay-dark))] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {loading ? t('report.analyzing') : t('report.get_ai_feedback')}
          </button>

          {result && (
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold">{t('report.quality_score')}:</span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${scoreCls}`}>
                  {result.quality_score}/100
                </span>
              </div>
              {strengths.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 text-xs font-semibold text-emerald-700">{t('report.strengths')}</div>
                  {strengths.map((s, i) => (
                    <div key={i} className="mb-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-600" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}
              {suggestions.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-amber-700">{t('report.suggestions')}</div>
                  <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { data: reportData, isLoading: reportsLoading, mutate: mutateReports } = useReports();
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingReports();
  const { t } = useTranslation();
  const [tabValue, setTabValue] = useState(0);

  const reports = useMemo(() => reportData?.reports ?? [], [reportData]);
  const overdueCount = upcomingData?.overdue_count ?? 0;
  const isLoading = reportsLoading || upcomingLoading;

  const reportsByGrant = useMemo(() => {
    const groups: Record<string, { grantId: number; grantTitle: string; reports: Report[] }> = {};
    for (const r of reports) {
      const key = String(r.grant_id);
      if (!groups[key]) {
        groups[key] = {
          grantId: r.grant_id,
          grantTitle: r.grant_title || `Grant #${r.grant_id}`,
          reports: [],
        };
      }
      groups[key].reports.push(r);
    }
    return Object.values(groups);
  }, [reports]);

  const overallCompliance = useMemo(() => {
    const scored = reports.filter(
      (r) => r.ai_analysis && (r.ai_analysis as Record<string, unknown>).score !== undefined,
    );
    if (scored.length === 0) return 0;
    const total = scored.reduce(
      (sum, r) => sum + (Number((r.ai_analysis as Record<string, unknown>).score) || 0),
      0,
    );
    return Math.round(total / scored.length);
  }, [reports]);

  const timelineItems = useMemo(() => {
    const items: Array<{ report: Report; grantTitle: string; daysLeft: number }> = [];
    reportsByGrant.forEach((group) => {
      group.reports.forEach((r) => {
        if (!r.due_date) return;
        const days = getDaysUntil(r.due_date);
        if (days >= -7 && days <= 90) items.push({ report: r, grantTitle: group.grantTitle, daysLeft: days });
      });
    });
    items.sort((a, b) => a.daysLeft - b.daysLeft);
    return items;
  }, [reportsByGrant]);

  if (isLoading) {
    return (
      <div className="max-w-[960px] space-y-6">
        <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[10px] bg-muted" />
          ))}
        </div>
        <div className="h-60 animate-pulse rounded-[10px] bg-muted" />
      </div>
    );
  }

  const submittedCount = reports.filter((r) => r.status === 'submitted' || r.status === 'accepted').length;
  const pendingCount = reports.filter((r) => r.status === 'draft').length;

  const complianceBarCls =
    overallCompliance >= 80
      ? 'bg-emerald-500'
      : overallCompliance >= 60
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="max-w-[960px] space-y-7">
      <div>
        <h1 className="kuja-display text-[2.25rem] font-semibold leading-[1.1] text-foreground">
          {t('report.reports_compliance')}
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {overallCompliance > 0
              ? t('report.compliant', { score: overallCompliance })
              : t('report.reports_total', { count: reports.length })}
          </span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
              {overdueCount} {String(t('common.overdue')).toLowerCase()}
            </span>
          )}
        </div>
      </div>

      <ComplianceCalendar reportsByGrant={reportsByGrant} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <div className="kuja-numeric text-3xl font-bold">{reports.length}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t('report.total_reports')}</div>
        </Card>
        <Card className="p-5">
          <div className="kuja-numeric text-3xl font-bold">{submittedCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t('report.submitted')}</div>
        </Card>
        <Card className="p-5">
          <div className="kuja-numeric text-3xl font-bold">{pendingCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t('report.pending')}</div>
        </Card>
        <Card className="p-5">
          <div className={`kuja-numeric text-3xl font-bold ${overdueCount > 0 ? 'text-red-600' : ''}`}>
            {overdueCount}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{t('common.overdue')}</div>
        </Card>
      </div>

      {overallCompliance > 0 && (
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{t('report.overall_compliance')}</span>
            <span className="kuja-numeric text-sm font-semibold">{overallCompliance}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${complianceBarCls}`}
              style={{ width: `${overallCompliance}%` }}
            />
          </div>
        </Card>
      )}

      <div>
        <div className="border-b border-border">
          <button
            onClick={() => setTabValue(0)}
            className={`relative -mb-px px-4 py-2 text-sm font-medium transition ${
              tabValue === 0
                ? 'border-b-2 border-[hsl(var(--kuja-clay))] text-[hsl(var(--kuja-clay))]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('report.by_grant')}
          </button>
          <button
            onClick={() => setTabValue(1)}
            className={`relative -mb-px px-4 py-2 text-sm font-medium transition ${
              tabValue === 1
                ? 'border-b-2 border-[hsl(var(--kuja-clay))] text-[hsl(var(--kuja-clay))]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('report.timeline')}
          </button>
        </div>

        {tabValue === 0 && (
          <div className="mt-5 space-y-3">
            {reportsByGrant.length === 0 ? (
              <div className="py-10 text-center">
                <div className="text-sm text-muted-foreground">{t('report.no_reports_yet')}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('report.no_reports_hint')}</div>
              </div>
            ) : (
              reportsByGrant.map((group) => (
                <GrantReportGroup key={group.grantId} group={group} mutateReports={mutateReports} />
              ))
            )}
          </div>
        )}

        {tabValue === 1 && (
          <div className="mt-5">
            {timelineItems.length === 0 ? (
              <div className="py-10 text-center">
                <div className="text-sm text-muted-foreground">{t('report.no_upcoming_deadlines')}</div>
              </div>
            ) : (
              <div>
                {timelineItems.map((item) => {
                  const dl = getDeadlineText(item.report.due_date);
                  return (
                    <div
                      key={item.report.id}
                      className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
                    >
                      <span className="w-20 flex-shrink-0 text-xs text-muted-foreground">
                        {formatDate(item.report.due_date)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{item.report.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.grantTitle}</div>
                      </div>
                      <TypeChip label={item.report.report_type} />
                      <StatusChip status={item.report.status} />
                      <span className={`flex-shrink-0 text-xs font-semibold ${dl.cls}`}>{dl.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grant Group (Accordion)
// ---------------------------------------------------------------------------

function GrantReportGroup({
  group,
  mutateReports,
}: {
  group: { grantId: number; grantTitle: string; reports: Report[] };
  mutateReports: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  const scored = group.reports.filter(
    (r) => r.ai_analysis && (r.ai_analysis as Record<string, unknown>).score !== undefined,
  );
  const grantCompliance =
    scored.length > 0
      ? Math.round(
          scored.reduce(
            (sum, r) => sum + (Number((r.ai_analysis as Record<string, unknown>).score) || 0),
            0,
          ) / scored.length,
        )
      : 0;

  const completedCount = group.reports.filter(
    (r) => r.status === 'accepted' || r.status === 'submitted',
  ).length;

  const chipCls =
    grantCompliance >= 80
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : grantCompliance >= 60
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-red-200 bg-red-50 text-red-700';

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/30"
      >
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
            expanded ? '' : '-rotate-90'
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{group.grantTitle}</div>
          <div className="text-xs text-muted-foreground">
            {group.reports.length} {t('report.deliverables')} / {completedCount} {t('report.completed')}
          </div>
        </div>
        {grantCompliance > 0 && (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipCls}`}
          >
            {grantCompliance}%
          </span>
        )}
      </button>
      {expanded && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t('report.title')}</th>
                <th className="px-4 py-2 font-medium">{t('report.type')}</th>
                <th className="px-4 py-2 font-medium">{t('report.due_date')}</th>
                <th className="px-4 py-2 text-center font-medium">{t('report.status')}</th>
                <th className="px-4 py-2 text-center font-medium">{t('report.score')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('report.action')}</th>
              </tr>
            </thead>
            <tbody>
              {group.reports.map((report) => (
                <ReportRow key={report.id} report={report} mutateReports={mutateReports} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Report Row
// ---------------------------------------------------------------------------

function ReportRow({ report, mutateReports }: { report: Report; mutateReports: () => void }) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dl = getDeadlineText(report.due_date);

  const aiScore = report.ai_analysis
    ? Number((report.ai_analysis as Record<string, unknown>).score) || null
    : null;

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload(`/reports/${report.id}/attachments`, formData);
      mutateReports();
    } catch {
      /* noop */
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <tr className="border-t border-border hover:bg-muted/20">
        <td className="max-w-[220px] px-4 py-2.5">
          <div className="truncate">{report.title}</div>
          {report.reporting_period && (
            <div className="truncate text-[11px] text-muted-foreground">{report.reporting_period}</div>
          )}
        </td>
        <td className="px-4 py-2.5">
          <TypeChip label={report.report_type} />
        </td>
        <td className="px-4 py-2.5">
          <div>{formatDate(report.due_date)}</div>
          <div className={`text-[11px] font-medium ${dl.cls}`}>{dl.label}</div>
        </td>
        <td className="px-4 py-2.5 text-center">
          <StatusChip status={report.status} />
        </td>
        <td className="px-4 py-2.5 text-center">
          {aiScore !== null ? (
            <div className="inline-block">
              <ScoreRing score={Math.round(aiScore)} size={28} strokeWidth={2.5} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">--</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          {report.status === 'draft' ? (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {t('common.upload')}
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{t('report.submitted')}</span>
          )}
        </td>
      </tr>
      {report.status === 'draft' && (
        <tr>
          <td colSpan={6} className="border-t-0 px-4 py-0">
            <AIReportGuidancePanel report={report} />
          </td>
        </tr>
      )}
    </>
  );
}
