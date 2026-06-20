'use client';

/**
 * Applications list — shadcn + Tailwind.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApplications } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { StatusBadge } from '@/components/shared/status-badge';
import { ScoreRing } from '@/components/shared/score-ring';
import { SavedSearchesBar } from '@/components/shared/saved-searches-bar';
import { RecencyChip } from '@/components/shared/recency-chip';
import { ApplicationKanban } from '@/components/applications/application-kanban';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

import { FileText, Eye, ArrowRight, Inbox } from 'lucide-react';
import {
  PageShell, PageHeader, PageAttention, PageMain, type AttentionItem,
} from '@/components/layout/page-shell';
import { describeApplicationStatus } from '@/lib/status-copy';

interface AppRow {
  id: number;
  grant_id: number;
  grant_title?: string | null;
  org_name?: string | null;
  status: string;
  ai_score?: number | null;
  submitted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const STATUS_FILTERS = [
  'all', 'active', 'archived',
  'submitted', 'under_review', 'scored', 'accepted', 'rejected',
] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

// Phase 195 — donor-friendly bucketing: "active" = anything still in the
// review/decision pipeline; "archived" = decisions reached + apps tied to
// closed grants. This keeps the donor queue focused on what still needs
// action without losing access to history.
const ARCHIVED_STATES = new Set<string>([
  'awarded', 'rejected', 'declined', 'withdrawn',
]);

export default function ApplicationsPage() {
  const { t, formatDate } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useApplications();
  const all = (data?.applications ?? []) as AppRow[];
  const viewer = useAuthStore((s) => s.user);
  // Phase 15B — donors get a pipeline kanban toggle. NGOs stay on the
  // single-list view since they don't move other people's applications.
  const canSeeKanban = viewer?.role === 'donor' || viewer?.role === 'admin';
  const [view, setView] = useState<'table' | 'kanban'>('table');
  // Phase 13.40 — minimal status filter so SavedSearchesBar has something
  // worth capturing. The filter chip strip is keyboard-accessible and
  // i18n-free (status labels come from StatusBadge's role-aware lookup).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Phase 211 — donor/reviewer shortlist filter (in-memory only — the
  // is_starred bool already lands in app.to_dict()).
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const canSeeStarred = viewer?.role !== 'ngo';
  const applications = useMemo(() => {
    let rows = all;
    if (statusFilter !== 'all') {
      if (statusFilter === 'archived') {
        rows = rows.filter((a) => ARCHIVED_STATES.has(a.status));
      } else if (statusFilter === 'active') {
        rows = rows.filter((a) => !ARCHIVED_STATES.has(a.status));
      } else {
        rows = rows.filter((a) => a.status === statusFilter);
      }
    }
    if (showStarredOnly && canSeeStarred) {
      rows = rows.filter((a) => Boolean((a as { is_starred?: boolean }).is_starred));
    }
    return rows;
  }, [all, statusFilter, showStarredOnly, canSeeStarred]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="kuja-shimmer h-9 w-32 rounded" />
        {[1, 2, 3, 4].map((i) => <div key={i} className="kuja-shimmer h-14 rounded" />)}
      </div>
    );
  }

  // Phase 51 — attention items derived from the user's pipeline.
  // For NGO viewers only: drafts to continue, submitted awaiting decision.
  const attention: AttentionItem[] = [];
  if (viewer?.role === 'ngo') {
    const drafts = all.filter((a) => a.status === 'draft').length;
    const inFlight = all.filter((a) => ['submitted', 'in_review', 'under_review'].includes(a.status)).length;
    if (drafts > 0) {
      attention.push({
        tone: 'accent',
        label: `Continue ${drafts} draft application${drafts === 1 ? '' : 's'}`,
        hint: 'Pick up where you left off — submit once you\'re ready.',
      });
    }
    if (inFlight > 0) {
      attention.push({
        tone: 'info',
        label: `${inFlight} application${inFlight === 1 ? '' : 's'} awaiting decision`,
      });
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={t('application.list_title')}
        subtitle={`${applications.length} application${applications.length !== 1 ? 's' : ''}`}
        primaryAction={
          <div className="flex items-center gap-2 flex-wrap">
            {canSeeKanban && (
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setView('table')}
                  aria-pressed={view === 'table'}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold',
                    view === 'table' ? 'bg-[hsl(var(--kuja-clay))] text-white' : 'hover:bg-muted',
                  )}
                >Table</button>
                <button
                  type="button"
                  onClick={() => setView('kanban')}
                  aria-pressed={view === 'kanban'}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold border-l border-border',
                    view === 'kanban' ? 'bg-[hsl(var(--kuja-clay))] text-white' : 'hover:bg-muted',
                  )}
                >Pipeline</button>
              </div>
            )}
            <a
              href="/api/exports/applications.csv"
              className="inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand))]/40 text-sm font-medium px-3 py-2"
              title="Export visible applications as CSV"
            >
              <FileText className="h-4 w-4" /> Export CSV
            </a>
            <button
              type="button"
              onClick={() => router.push('/grants')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-sm font-medium px-4 py-2"
            >
              <FileText className="h-4 w-4" />
              {t('application.browse_grants')}
            </button>
          </div>
        }
      />

      <PageAttention items={attention} />

      <PageMain>
      {/* Saved searches + status filter chips */}
      <SavedSearchesBar
        scope="applications"
        currentFilter={{ status: statusFilter }}
        onApply={(f) => {
          if (typeof f.status === 'string' && (STATUS_FILTERS as readonly string[]).includes(f.status)) {
            setStatusFilter(f.status as StatusFilter);
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-full border text-xs px-3 py-1.5 transition-colors',
              statusFilter === s
                ? 'bg-[hsl(var(--kuja-clay))] text-white border-transparent'
                : 'border-border text-foreground hover:bg-muted',
            )}
          >
            {/* Phase 51 — use the shared status-copy helper so the chip
                labels match the StatusBadge labels on the rows. */}
            {s === 'all' ? t('common.all') || 'All' : describeApplicationStatus(s).label}
          </button>
        ))}
        {/* Phase 211 — shortlist filter (donor/reviewer/admin). */}
        {canSeeStarred && (
          <button
            type="button"
            onClick={() => setShowStarredOnly((v) => !v)}
            aria-pressed={showStarredOnly}
            className={cn(
              'rounded-full border text-xs px-3 py-1.5 transition-colors inline-flex items-center gap-1',
              showStarredOnly
                ? 'bg-[hsl(var(--kuja-clay))] text-white border-transparent'
                : 'border-border text-foreground hover:bg-muted',
            )}
          >
            <span aria-hidden>★</span> Shortlisted
          </button>
        )}
        {/* Phase 215 — bulk unstar when shortlist filter is on. */}
        {canSeeStarred && showStarredOnly && applications.length > 0 && (
          <BulkUnstarButton
            ids={applications.map((a) => a.id)}
            onDone={() => window.location.reload()}
          />
        )}
      </div>

      {canSeeKanban && view === 'kanban' ? (
        <ApplicationKanban />
      ) : applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <Inbox className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">{t('application.no_applications')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('application.no_applications_hint')}</p>
          <button
            type="button"
            onClick={() => router.push('/grants')}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand-50))] text-sm font-medium px-4 py-2"
          >
            {t('application.browse_grants')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('application.col.grant')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('application.col.status')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-center">{t('application.col.ai_score')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">{t('application.col.submitted')}</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">{t('application.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => router.push(`/applications/${app.id}`)}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-foreground">
                        {app.grant_title || `Grant #${app.grant_id}`}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {app.org_name && (
                          <div className="text-xs text-muted-foreground">{app.org_name}</div>
                        )}
                        {/* PMO-transfer: last-touched chip for at-a-glance staleness */}
                        <RecencyChip iso={app.updated_at || app.created_at} />
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={app.status} kind="app" /></td>
                    <td className="px-4 py-3 text-center">
                      {app.ai_score !== null && app.ai_score !== undefined ? (
                        <div className="flex justify-center">
                          <ScoreRing score={Math.round(app.ai_score)} size={40} strokeWidth={3} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(app.submitted_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(`/applications/${app.id}`); }}
                        className="inline-flex items-center gap-1.5 text-[hsl(var(--kuja-clay))] hover:underline text-sm font-medium"
                      >
                        <Eye className="h-4 w-4" />
                        {t('common.view')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </PageMain>
    </PageShell>
  );
}

// Phase 215 — bulk-unstar action when the shortlist filter is on.
function BulkUnstarButton({ ids, onDone }: { ids: number[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy || ids.length === 0) return;
    if (!confirm(`Remove ${ids.length} application${ids.length === 1 ? '' : 's'} from shortlist?`)) return;
    setBusy(true);
    try {
      await api.post('/api/applications/bulk-star', { ids, starred: false });
      onDone();
    } catch {
      alert('Could not unstar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="rounded-full border border-border text-xs px-3 py-1.5 hover:bg-muted disabled:opacity-60"
    >
      {busy ? 'Removing…' : `Unstar ${ids.length}`}
    </button>
  );
}
