'use client';

/**
 * ReviewerActionQueue — Phase 13.29
 *
 * Reviewer "what needs you" panel. Sources from /api/reviews/ which
 * returns the reviewer's pending assignments. Simpler shape than the
 * donor queue — reviews are the primary action; everything else is
 * downstream.
 */

import { useEffect, useState } from 'react';
import { Star, ArrowRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Review {
  id: number;
  status: string;
  application_id: number;
  ngo_org_name?: string;
  org_name?: string;
  grant_title?: string;
  due_date?: string | null;
  assigned_at?: string;
}

export function ReviewerActionQueue({ className }: { className?: string }) {
  const { t, formatDate } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [pending, setPending] = useState<Review[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'reviewer') return;
    let cancelled = false;
    setLoading(true);
    api.get<{ reviews?: Review[] }>('/reviews/')
      .then((res) => {
        if (cancelled) return;
        const reviews = res.reviews ?? [];
        setPending(reviews.filter((r) => r.status === 'pending').slice(0, 7));
        setCompletedCount(reviews.filter((r) => r.status === 'completed').length);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user || user.role !== 'reviewer') return null;

  return (
    <div className={cn('rounded-xl border border-border bg-background p-5 space-y-4', className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-[hsl(var(--kuja-clay))]" />
          <h2 className="kuja-display text-lg">{t('reviewer_actions.title')}</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
          <span className="rounded-full bg-muted px-2 py-0.5">
            {pending.length} {t('reviewer_actions.pending')}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">
            {completedCount} {t('reviewer_actions.completed')}
          </span>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-14 rounded-md" />)}
        </div>
      )}

      {!loading && pending.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          {t('reviewer_actions.empty')}
        </div>
      )}

      {!loading && pending.length > 0 && (
        <ol className="space-y-2">
          {pending.map((r) => {
            const isOverdue = r.due_date && new Date(r.due_date) < new Date();
            const tone = isOverdue
              ? 'border-l-[hsl(var(--kuja-flag))] bg-[hsl(0_85%_98%)]'
              : 'border-l-[hsl(var(--kuja-clay))] bg-[hsl(var(--kuja-clay))]/5';
            return (
              <li key={r.id}>
                <Link
                  href={`/reviews/${r.id}/`}
                  className={cn(
                    'group flex items-start gap-3 rounded-md border-l-4 px-3 py-2.5 hover:brightness-95',
                    tone,
                  )}
                >
                  <Star className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {r.ngo_org_name || r.org_name || `Application #${r.application_id}`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      {r.grant_title && <span>{r.grant_title}</span>}
                      {r.due_date && (
                        <span className={cn('inline-flex items-center gap-1',
                          isOverdue ? 'text-[hsl(var(--kuja-flag))] font-semibold' : '')}>
                          <Calendar className="h-3 w-3" />
                          {isOverdue
                            ? t('reviewer_actions.overdue_due', { date: formatDate(r.due_date) })
                            : formatDate(r.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
