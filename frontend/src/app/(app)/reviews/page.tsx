'use client';

/**
 * Reviews — shadcn + Tailwind.
 * Reviewer view: pending / completed tabs with assignments + AI compare.
 * Donor view: all applications filtered by grant.
 */

import { useState, useMemo, useEffect } from 'react';
import { api } from '@/lib/api';
import { MyPastReviews } from '@/components/reviews/my-past-reviews';
import { BandStreakTip } from '@/components/reviews/band-streak-tip';
import { ScoreDistributionCard } from '@/components/reviews/score-distribution-card';
import { QueueSectorMix } from '@/components/reviews/queue-sector-mix';
import { OverdueCountStat } from '@/components/reviews/overdue-count-stat';
import { FastestScoreStat } from '@/components/reviews/fastest-score-stat';
import { AiAgreementStat } from '@/components/reviews/ai-agreement-stat';
import { ReviewStreakTile } from '@/components/reviews/review-streak-tile';
import { ScoringTimeAvgStat } from '@/components/reviews/scoring-time-avg-stat';
import { HighScoreRateStat } from '@/components/reviews/high-score-rate-stat';
import { MedianScoreStat } from '@/components/reviews/median-score-stat';
import { LowScoreRateStat } from '@/components/reviews/low-score-rate-stat';
import { PendingAgeStat } from '@/components/reviews/pending-age-stat';
import { CompletedThisMonthStat } from '@/components/reviews/completed-this-month-stat';
import { LifetimeCompletedStat } from '@/components/reviews/lifetime-completed-stat';
import { TopTierRateStat } from '@/components/reviews/top-tier-rate-stat';
import { PrivateNotesCoverageStat } from '@/components/reviews/private-notes-coverage-stat';
import { LongestReviewStat } from '@/components/reviews/longest-review-stat';
import { ShortestReviewStat } from '@/components/reviews/shortest-review-stat';
import { AvgRationaleLengthStat } from '@/components/reviews/avg-rationale-length-stat';
import { ReviewerResumeBanner } from '@/components/reviews/resume-banner';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useReviews, useApplications, useGrants } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { describeApplicationStatus, TONE_PILL_CLASS } from '@/lib/status-copy';
import { cn } from '@/lib/utils';
import { ClipboardCheck, FileText, Star, Filter, ChevronDown, GitCompare, Sparkles, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Review } from '@/lib/types';
import { fetchReviewerRecommendation, type ReviewerRecommendation } from '@/lib/copilot-api';
import { ApplicationCompareDialog } from '@/components/reviews/application-compare-dialog';
import { LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';

export default function ReviewsPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return user.role === 'reviewer' ? <ReviewerView /> : <DonorView />;
}

// --------------------------------------------------------------------------
// Reviewer view
// --------------------------------------------------------------------------

function ReviewerView() {
  const router = useRouter();
  const { t, formatDate } = useTranslation();
  const { data, isLoading } = useReviews();
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');
  const [selectedAppIds, setSelectedAppIds] = useState<Set<number>>(new Set());
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<ReviewerRecommendation | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  // Phase 10 — the new richer side-by-side matrix dialog
  const [matrixOpen, setMatrixOpen] = useState(false);

  const pending = (data?.pending ?? []) as Review[];
  const completed = (data?.completed ?? []) as Review[];

  const toggleSelect = (appId: number) => {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else if (next.size < 5) next.add(appId);
      else { toast.error(t('review.compare_select_max')); return prev; }
      return next;
    });
  };

  const runCompare = async () => {
    if (selectedAppIds.size < 2) {
      toast.error(t('review.compare_select_min'));
      return;
    }
    setComparing(true); setCompareError(null); setCompareResult(null);
    try {
      const res = await fetchReviewerRecommendation({
        application_ids: Array.from(selectedAppIds),
      });
      if (res.ok) setCompareResult(res.data);
      else setCompareError(res.message);
    } finally {
      setComparing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-10 w-48 rounded" />
        <div className="kuja-shimmer h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t('review.title_assignments')}
        icon={ClipboardCheck}
        subtitle={t('review.subtitle_queue')}
        primaryAction={tab === 'pending' && pending.length >= 2 ? (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Phase 10 — richer per-criterion matrix dialog. Open alongside
                the existing single-recommendation compare. */}
            <button
              onClick={() => setMatrixOpen(true)}
              disabled={selectedAppIds.size < 2}
              className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-spark))] text-[hsl(var(--kuja-spark))] hover:bg-[hsl(var(--kuja-spark-soft))] text-sm font-medium px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
              title="AI side-by-side matrix with per-criterion winners"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Side-by-side matrix
            </button>
            <button
              onClick={runCompare}
              disabled={selectedAppIds.size < 2 || comparing}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-spark))] hover:opacity-90 text-white text-sm font-medium px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {comparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompare className="h-3.5 w-3.5" />}
              {comparing
                ? t('review.compare_button_running')
                : selectedAppIds.size < 2
                  ? t('review.compare_button_select')
                  : t('review.compare_button_ready', { n: selectedAppIds.size })}
            </button>
          </div>
        ) : null}
      />
      <PageMain>

      {/* Phase 275 — resume in-progress reviews. Self-gates when none. */}
      <ReviewerResumeBanner />

      {/* Phase 295 — live caseload header (open + completed this month). */}
      <MyCaseloadStrip />

      {/* Phase 236 — completion rate over last 90 days. */}
      <MyCompletionStat />
      <MyTurnaroundStat />
      <FastestScoreStat />
      <AiAgreementStat />
      <ReviewStreakTile />
      <ScoringTimeAvgStat />
      <HighScoreRateStat />
      <MedianScoreStat />
      <LowScoreRateStat />
      <PendingAgeStat />
      <CompletedThisMonthStat />
      <LifetimeCompletedStat />
      <TopTierRateStat />
      <PrivateNotesCoverageStat />
      <LongestReviewStat />
      <ShortestReviewStat />
      <AvgRationaleLengthStat />
      <MyCompletedThisWeek />
      <BandStreakTip />
      <ScoreDistributionCard />
      <QueueSectorMix />
      <OverdueCountStat />

      {/* Phase 303 — self-calibration coaching tip (only if > 1.0σ off). */}
      <MyCalibrationTip />

      {/* Phase 311 — last 12 scores sparkline. Self-gates < 5. */}
      <MyScoreSparkline />

      {/* Phase 339 — std deviation of own scores. Self-gates < 5. */}
      <MyScoreConsistency />

      {/* Phase 244 — most recent completed reviews. Self-gates when none. */}
      <MyPastReviews />

      {/* Phase 214 — quick link to the reviewer's starred shortlist
          across all reviews they've handled. Lands on /applications
          which already enforces reviewer scoping. */}
      <div className="flex justify-end">
        <a
          href="/applications?starred=1"
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          ★ My shortlist
        </a>
      </div>

      {(compareResult || compareError) && (
        <ReviewerCompareCard
          result={compareResult}
          error={compareError}
          loading={comparing}
          onClose={() => { setCompareResult(null); setCompareError(null); setSelectedAppIds(new Set()); }}
          onOpenApp={(appId) => router.push(`/reviews/${appId}`)}
        />
      )}

      <div className="flex gap-1 border-b border-border">
        {(['pending', 'completed'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === k
                ? 'text-[hsl(var(--kuja-clay))] border-[hsl(var(--kuja-clay))]'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {k === 'pending'
              ? t('review.tab.pending_count', { n: pending.length })
              : t('review.tab.completed_count', { n: completed.length })}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        pending.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t('review.no_pending_title')} body={t('review.no_pending_body')} />
        ) : (
          <TableWrap>
            <tr className="bg-muted/30 border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 w-8" />
              <th className="px-4 py-2.5">{t('common.col.applicant')}</th>
              <th className="px-4 py-2.5">{t('common.col.grant')}</th>
              <th className="px-4 py-2.5">{t('common.col.status')}</th>
              <th className="px-4 py-2.5 text-right">{t('common.col.actions')}</th>
            </tr>
            {pending.map((r) => {
              const checked = selectedAppIds.has(r.application_id);
              return (
                <tr key={r.id} className={cn(
                  'border-b border-border last:border-0 hover:bg-muted/30 transition-colors',
                  checked && 'bg-[hsl(var(--kuja-spark-soft))]/30',
                )}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(r.application_id)}
                      className="h-4 w-4 rounded border-input text-[hsl(var(--kuja-spark))] focus:ring-[hsl(var(--kuja-spark))]"
                      aria-label={t('review.checkbox_aria')}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.ngo_org_name || t('applications.label_fallback', { n: r.application_id })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {r.grant_title || '—'}
                      {/* Phase 381 — deadline within 24h badge */}
                      {(() => {
                        const dl = r.grant_deadline ? new Date(r.grant_deadline).getTime() : null;
                        if (!dl) return null;
                        const hoursLeft = (dl - Date.now()) / 3_600_000;
                        if (hoursLeft <= 0 || hoursLeft > 24) return null;
                        return (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                            Due {Math.ceil(hoursLeft)}h
                          </span>
                        );
                      })()}
                    </span>
                  </td>
                  <td className="px-4 py-3">{(() => {
                    const sc = describeApplicationStatus(r.status);
                    return (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TONE_PILL_CLASS[sc.tone]}`}>
                        {sc.label}
                      </span>
                    );
                  })()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => router.push(`/reviews/${r.application_id}`)}
                      className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-xs font-medium px-3 py-1.5"
                    >
                      <Star className="h-3.5 w-3.5" />
                      {t('review.start_review_btn')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </TableWrap>
        )
      )}

      {tab === 'completed' && (
        completed.length === 0 ? (
          <EmptyState icon={FileText} title={t('review.no_completed_title')} body={t('review.no_completed_body')} />
        ) : (
          <TableWrap>
            <tr className="bg-muted/30 border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">{t('common.col.applicant')}</th>
              <th className="px-4 py-2.5">{t('common.col.grant')}</th>
              <th className="px-4 py-2.5 text-right">{t('common.col.score')}</th>
              <th className="px-4 py-2.5">{t('common.col.completed')}</th>
            </tr>
            {completed.map((r) => {
              const s = r.overall_score ?? 0;
              const color = s >= 80 ? 'text-[hsl(var(--kuja-grow))]' : s >= 60 ? 'text-[hsl(var(--kuja-sun))]' : 'text-[hsl(var(--kuja-flag))]';
              return (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/reviews/${r.application_id}`)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.ngo_org_name || t('applications.label_fallback', { n: r.application_id })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.grant_title || '—'}</td>
                  <td className={cn('px-4 py-3 text-right kuja-numeric font-semibold', color)}>
                    {r.overall_score ?? '—'}%
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.completed_at)}</td>
                </tr>
              );
            })}
          </TableWrap>
        )
      )}

      {/* Phase 10 — side-by-side matrix dialog. Mounted at root level so
          it can layer above the queue. */}
      <ApplicationCompareDialog
        open={matrixOpen}
        onOpenChange={setMatrixOpen}
        applicationIds={Array.from(selectedAppIds)}
        appLabels={Object.fromEntries(
          pending
            .filter(r => selectedAppIds.has(r.application_id))
            .map(r => [r.application_id, (r as unknown as { ngo_org_name?: string }).ngo_org_name || `App #${r.application_id}`])
        )}
      />
      </PageMain>
    </PageShell>
  );
}

// --------------------------------------------------------------------------
// Reviewer compare card — surfaces fund/clarify/decline rationale per
// application, similarity alerts, and an overall portfolio summary. Calls
// /api/ai/reviewer-recommendation. Replaces the prior "open compare mode"
// behavior that just popped the co-pilot rail.
// --------------------------------------------------------------------------

function ReviewerCompareCard({
  result, error, loading, onClose, onOpenApp,
}: {
  result: ReviewerRecommendation | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onOpenApp: (id: number) => void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="rounded-xl border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/30 p-4">
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--kuja-spark))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('review.compare_running')}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
        <button onClick={onClose} className="mt-2 text-xs text-muted-foreground hover:text-foreground underline">{t('review.compare_dismiss')}</button>
      </div>
    );
  }
  if (!result) return null;

  const tones: Record<string, string> = {
    fund: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    clarify: 'border-amber-200 bg-amber-50 text-amber-800',
    decline: 'border-red-200 bg-red-50 text-red-800',
  };

  return (
    <div className="rounded-xl border border-[hsl(var(--kuja-spark-soft))] bg-background p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[hsl(var(--kuja-spark))]" />
          <div className="text-sm font-semibold text-foreground">{t('review.compare_title')}</div>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground underline">{t('review.compare_close')}</button>
      </div>

      {result.review_summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">{result.review_summary}</p>
      )}

      <div className="space-y-2">
        {result.ranked.map((r) => (
          <div key={r.application_id} className={cn('rounded-lg border p-3', tones[r.recommendation] ?? 'border-border bg-muted/30')}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="kuja-numeric text-xs font-bold rounded-full bg-background border border-border px-1.5 py-0.5">#{r.rank}</span>
                <span className="text-xs uppercase tracking-wide font-bold">{r.recommendation}</span>
                <span className="text-sm font-medium">Application #{r.application_id}</span>
              </div>
              <button
                onClick={() => onOpenApp(r.application_id)}
                className="text-xs font-medium text-[hsl(var(--kuja-clay))] hover:underline"
              >
                {t('review.compare_open')}
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed">{r.rationale}</p>
            {r.key_strengths && r.key_strengths.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wide font-semibold mb-0.5 opacity-70">{t('review.compare_strengths')}</div>
                <ul className="space-y-0.5">
                  {r.key_strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-1 text-[11px]"><CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0" /><span>{s}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {r.key_weaknesses && r.key_weaknesses.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wide font-semibold mb-0.5 opacity-70">{t('review.compare_weaknesses')}</div>
                <ul className="ml-4 list-disc space-y-0.5 text-[11px]">
                  {r.key_weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {result.similarity_alerts && result.similarity_alerts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1.5 inline-flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> {t('review.compare_similarity_alerts')}
          </div>
          <ul className="space-y-1 text-xs text-amber-900">
            {result.similarity_alerts.map((a, i) => (
              <li key={i}>
                <span className="font-medium">#{a.application_ids.join(' & #')}:</span> {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Donor view
// --------------------------------------------------------------------------

function DonorView() {
  const router = useRouter();
  const { t, formatDate } = useTranslation();
  const { data: appsData, isLoading: appsLoading } = useApplications();
  const { data: grantsData, isLoading: grantsLoading } = useGrants();
  const [grantFilter, setGrantFilter] = useState<string>('all');

  const applications = appsData?.applications ?? [];
  const grants = grantsData?.grants ?? [];

  const filtered = useMemo(() => {
    if (grantFilter === 'all') return applications;
    return applications.filter((a) => String(a.grant_id) === grantFilter);
  }, [applications, grantFilter]);

  if (appsLoading || grantsLoading) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-10 w-48 rounded" />
        <div className="kuja-shimmer h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t('review.donor_title')}
        icon={Star}
        subtitle={`${filtered.length} / ${applications.length}`}
      />
      <PageMain>
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="relative">
          <select
            value={grantFilter}
            onChange={(e) => setGrantFilter(e.target.value)}
            className="h-9 pl-3 pr-8 text-sm rounded-md border border-input bg-background appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
          >
            <option value="all">{t('review.filter_all_grants', { n: applications.length })}</option>
            {grants.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.title} ({applications.filter((a) => a.grant_id === g.id).length})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title={t('review.no_apps_donor_title')} body={t('review.no_apps_donor_body')} />
      ) : (
        <TableWrap>
          <tr className="bg-muted/30 border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5">{t('common.col.applicant')}</th>
            <th className="px-4 py-2.5">{t('common.col.grant')}</th>
            <th className="px-4 py-2.5">{t('common.col.status')}</th>
            <th className="px-4 py-2.5 text-right">{t('application.col.submitted')}</th>
          </tr>
          {filtered.map((a) => (
            <tr
              key={a.id}
              className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => router.push(`/applications/${a.id}`)}
            >
              <td className="px-4 py-3 font-medium text-foreground">{a.org_name || '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{a.grant_title || '—'}</td>
              <td className="px-4 py-3">{(() => {
                const sc = describeApplicationStatus(a.status);
                return (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TONE_PILL_CLASS[sc.tone]}`}>
                    {sc.label}
                  </span>
                );
              })()}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{formatDate(a.submitted_at)}</td>
            </tr>
          ))}
        </TableWrap>
      )}
      </PageMain>
    </PageShell>
  );
}

// --------------------------------------------------------------------------
// Shared helpers
// --------------------------------------------------------------------------

function EmptyState({ icon: Icon, title, body }: { icon: typeof ClipboardCheck; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
      <Icon className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
      <p className="kuja-display text-xl">{title}</p>
      <p className="text-sm text-muted-foreground mt-1">{body}</p>
    </div>
  );
}

// Phase 339 — Std deviation of own scores across all completed reviews.
// High variance can be healthy (real rubric spread) or a calibration
// drift signal — render the number so the reviewer can self-reflect.
function MyScoreConsistency() {
  const [data, setData] = useState<{ n: number; mean?: number; stdev?: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<typeof data>('/api/reviews/my-score-consistency').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);
  if (!data || data.n < 5 || data.stdev == null) return null;
  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">Your scoring variance</span>
      <span className="tabular-nums">
        μ {data.mean} · σ <span className="font-semibold">{data.stdev}</span> over {data.n} reviews
      </span>
    </div>
  );
}

// Phase 311 — Last 12 completed-review scores rendered as a tiny SVG
// sparkline. Self-gates when count < 5.
function MyScoreSparkline() {
  const [data, setData] = useState<{
    scores: Array<{ score: number; completed_at: string | null }>;
    total_completed: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<typeof data>('/api/reviews/my-score-history').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);
  if (!data || data.total_completed < 5) return null;
  const vals = data.scores.map((s) => s.score);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 100);
  const w = 200; const h = 28; const pad = 2;
  const stepX = (w - 2 * pad) / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / Math.max(1, max - min)) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = vals[vals.length - 1];
  const first = vals[0];
  const delta = Math.round((last - first) * 10) / 10;
  const tone = delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-700' : 'text-muted-foreground';
  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between gap-3">
      <span className="text-muted-foreground">Your last {vals.length} scores</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-[hsl(var(--kuja-clay))]">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {vals.map((v, i) => {
          const x = pad + i * stepX;
          const y = h - pad - ((v - min) / Math.max(1, max - min)) * (h - 2 * pad);
          return <circle key={i} cx={x} cy={y} r={1.5} fill="currentColor" />;
        })}
      </svg>
      <span className={`tabular-nums ${tone}`}>
        {delta > 0 ? '+' : ''}{delta}
      </span>
    </div>
  );
}

// Phase 303 — Self-calibration coaching tip. Only renders when this
// reviewer's mean is > 1.0σ from the platform mean over 5+ scores.
function MyCalibrationTip() {
  const [data, setData] = useState<{
    my_count?: number;
    my_mean?: number;
    platform_mean?: number;
    platform_stdev?: number;
    delta_vs_platform?: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<typeof data>('/api/reviews/my-calibration').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);
  if (!data || !data.my_count || data.my_count < 5) return null;
  if (data.platform_stdev == null || data.delta_vs_platform == null) return null;
  if (Math.abs(data.delta_vs_platform) <= data.platform_stdev) return null;
  const higher = (data.delta_vs_platform ?? 0) > 0;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-xs">
      <p className="text-amber-900 dark:text-amber-200">
        Your average score is{' '}
        <span className="font-semibold">{Math.abs(data.delta_vs_platform!)} points {higher ? 'higher' : 'lower'}</span>
        {' '}than the platform mean ({data.platform_mean}%) across your last {data.my_count} reviews.
        Consider whether your rubric calibration matches the network norm.
      </p>
    </div>
  );
}

// Phase 295 — Live caseload header: open now + completed this month.
function MyCaseloadStrip() {
  const [data, setData] = useState<{ open_count: number; completed_this_month: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<typeof data>('/api/reviews/my-caseload').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);
  if (!data) return null;
  if (data.open_count === 0 && data.completed_this_month === 0) return null;
  return (
    <div className="rounded-md border border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/5 p-3 text-xs flex items-center justify-between">
      <span>
        You have <span className="font-semibold text-foreground">{data.open_count}</span> open
        review{data.open_count === 1 ? '' : 's'}
        <span className="text-muted-foreground">
          {' · '}
          {data.completed_this_month} completed this month
        </span>
      </span>
    </div>
  );
}

// Phase 236 — Reviewer completion rate strip over the last 90 days.
function MyCompletionStat() {
  const [data, setData] = useState<{
    completion_pct: number | null;
    completed: number;
    total_assigned: number;
    window_days: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<typeof data>('/api/reviews/my-stats').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.total_assigned === 0) return null;
  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">
        Last {data.window_days} days
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.completion_pct ?? 0}%</span> completion
        <span className="text-muted-foreground"> ({data.completed} of {data.total_assigned})</span>
      </span>
    </div>
  );
}

// Phase 405 — Count of reviews completed by this reviewer in the
// last 7 days. Lightweight motivator stat.
function MyCompletedThisWeek() {
  const [data, setData] = useState<{ completed_this_week: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<typeof data>('/api/dashboard/reviews-completed-this-week').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.completed_this_week === 0) return null;
  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">Last 7 days</span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.completed_this_week}</span> completed this week
      </span>
    </div>
  );
}

// Phase 363 — Reviewer turnaround days strip over the last 90 days.
function MyTurnaroundStat() {
  const [data, setData] = useState<{
    median_days: number | null;
    p75_days: number | null;
    count: number;
    window_days: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<typeof data>('/api/reviews/my-turnaround').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || !data.count || data.median_days == null) return null;
  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">
        Last {data.window_days} days
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.median_days}d</span> median turnaround
        <span className="text-muted-foreground"> (p75 {data.p75_days}d · {data.count} reviews)</span>
      </span>
    </div>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
