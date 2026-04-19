'use client';

import { useRouter } from 'next/navigation';
import { useReviews } from '@/lib/hooks/use-api';
import { Eye, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Review } from '@/lib/types';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CompletedReviewsPage() {
  const router = useRouter();
  const { data, isLoading } = useReviews();
  const completed = (data?.completed ?? []) as Review[];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="kuja-shimmer h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="kuja-display text-3xl">Completed reviews</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {completed.length} review{completed.length !== 1 ? 's' : ''} completed
        </p>
      </div>

      {completed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="kuja-display text-xl">No completed reviews yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Reviews you complete will be listed here for reference.
          </p>
          <button
            type="button"
            onClick={() => router.push('/reviews')}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand-50))] text-sm font-medium px-4 py-2"
          >
            View pending assignments
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Application</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Grant</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Score</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Completed</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
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
                        {r.overall_score != null ? `${r.overall_score}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(r.completed_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`/reviews/${r.application_id}`)}
                          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-[hsl(var(--kuja-clay))] text-sm"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
