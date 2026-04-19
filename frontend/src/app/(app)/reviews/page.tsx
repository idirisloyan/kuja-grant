'use client';

/**
 * Reviews — shadcn + Tailwind.
 * Reviewer view: pending / completed tabs with assignments.
 * Donor view: all applications filtered by grant.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useReviews, useApplications, useGrants } from '@/lib/hooks/use-api';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import { ClipboardCheck, FileText, Star, Filter, ChevronDown } from 'lucide-react';
import type { Review } from '@/lib/types';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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
  const { data, isLoading } = useReviews();
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');

  const pending = (data?.pending ?? []) as Review[];
  const completed = (data?.completed ?? []) as Review[];

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
      <div>
        <h1 className="kuja-display text-3xl">Review assignments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">AI-prioritized queue with comparison support</p>
      </div>

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
              <th className="px-4 py-2.5">Applicant</th>
              <th className="px-4 py-2.5">Grant</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
            {pending.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
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
            ))}
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
// Donor view
// --------------------------------------------------------------------------

function DonorView() {
  const router = useRouter();
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
              <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
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
