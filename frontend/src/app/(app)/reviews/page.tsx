'use client';

/**
 * Reviews — shadcn + Tailwind.
 * Reviewer view: pending / completed tabs with assignments + AI compare.
 * Donor view: all applications filtered by grant.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useReviews, useApplications, useGrants } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import { ClipboardCheck, FileText, Star, Filter, ChevronDown, GitCompare, Sparkles, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Review } from '@/lib/types';
import { fetchReviewerRecommendation, type ReviewerRecommendation } from '@/lib/copilot-api';
import { toast } from 'sonner';

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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="kuja-display text-3xl">Review assignments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI-prioritized queue with comparison support</p>
        </div>
        {tab === 'pending' && pending.length >= 2 && (
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
        )}
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
            {k === 'pending' ? `Pending (${pending.length})` : `Completed (${completed.length})`}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        pending.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No pending assignments" body="You have no applications to review right now." />
        ) : (
          <TableWrap>
            <tr className="bg-muted/30 border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 w-8" />
              <th className="px-4 py-2.5">Applicant</th>
              <th className="px-4 py-2.5">Grant</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
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
                    {r.ngo_org_name || `Application #${r.application_id}`}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.grant_title || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => router.push(`/reviews/${r.application_id}`)}
                      className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-xs font-medium px-3 py-1.5"
                    >
                      <Star className="h-3.5 w-3.5" />
                      Start review
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
          <EmptyState icon={FileText} title="No completed reviews" body="Reviews you complete will appear here." />
        ) : (
          <TableWrap>
            <tr className="bg-muted/30 border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Applicant</th>
              <th className="px-4 py-2.5">Grant</th>
              <th className="px-4 py-2.5 text-right">Score</th>
              <th className="px-4 py-2.5">Completed</th>
            </tr>
            {completed.map((r) => {
              const s = r.overall_score ?? 0;
              const color = s >= 80 ? 'text-[hsl(var(--kuja-grow))]' : s >= 60 ? 'text-[hsl(var(--kuja-sun))]' : 'text-[hsl(var(--kuja-flag))]';
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.ngo_org_name || `Application #${r.application_id}`}
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
    </div>
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
  const { formatDate } = useTranslation();
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
    <div className="space-y-4">
      <div>
        <h1 className="kuja-display text-3xl">Applications to review</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} of {applications.length}</p>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="relative">
          <select
            value={grantFilter}
            onChange={(e) => setGrantFilter(e.target.value)}
            className="h-9 pl-3 pr-8 text-sm rounded-md border border-input bg-background appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
          >
            <option value="all">All grants ({applications.length})</option>
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
        <EmptyState icon={FileText} title="No applications" body="Applications will appear here as NGOs submit them." />
      ) : (
        <TableWrap>
          <tr className="bg-muted/30 border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5">Applicant</th>
            <th className="px-4 py-2.5">Grant</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5 text-right">Submitted</th>
          </tr>
          {filtered.map((a) => (
            <tr
              key={a.id}
              className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => router.push(`/applications/${a.id}`)}
            >
              <td className="px-4 py-3 font-medium text-foreground">{a.org_name || '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{a.grant_title || '—'}</td>
              <td className="px-4 py-3"><StatusBadge status={a.status} kind="app" /></td>
              <td className="px-4 py-3 text-right text-muted-foreground">{formatDate(a.submitted_at)}</td>
            </tr>
          ))}
        </TableWrap>
      )}
    </div>
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
