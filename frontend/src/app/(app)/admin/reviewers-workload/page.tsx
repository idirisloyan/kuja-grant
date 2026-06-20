'use client';

/**
 * Phase 146 — Reviewer workload balance dashboard.
 *
 * Admin / donor view that surfaces how busy each reviewer currently is
 * (assigned, in-progress, overdue, completed). Aim is to spot imbalance
 * before assigning more — pair with /admin/reviews-bulk to fix it.
 */

import { useEffect, useState } from 'react';
import { Users, AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Row {
  reviewer_user_id: number;
  name?: string | null;
  email: string;
  assigned: number;
  in_progress: number;
  overdue: number;
  completed: number;
  total: number;
}

interface Resp {
  reviewers: Row[];
  overdue_threshold_days: number;
  summary: {
    reviewers: number;
    total_assigned: number;
    total_in_progress: number;
    total_overdue: number;
  };
}

export default function ReviewerWorkloadPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/reviews/workload').then((r) => {
      if (!cancelled) setData(r);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const maxActive = data
    ? Math.max(1, ...data.reviewers.map((r) => r.assigned + r.in_progress))
    : 1;

  return (
    <PageShell>
      <PageHeader
        title="Reviewer workload"
        icon={Users}
        subtitle="Current pipeline per reviewer. Sort highest active load first."
      />
      <PageMain>
        {loading && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Loading…
          </div>
        )}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3 mb-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Total assigned</div>
                <div className="font-serif text-2xl">{data.summary.total_assigned}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">In progress</div>
                <div className="font-serif text-2xl">{data.summary.total_in_progress}</div>
              </Card>
              <Card className={cn(
                'p-4',
                data.summary.total_overdue > 0 ? 'border-rose-300' : '',
              )}>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  Overdue ({'>'}{data.overdue_threshold_days}d)
                  {data.summary.total_overdue > 0 && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                </div>
                <div className={cn(
                  'font-serif text-2xl',
                  data.summary.total_overdue > 0 ? 'text-rose-700' : '',
                )}>
                  {data.summary.total_overdue}
                </div>
              </Card>
            </div>

            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left">Reviewer</th>
                      <th className="px-3 py-2 text-left">Active load</th>
                      <th className="px-3 py-2 text-right">Assigned</th>
                      <th className="px-3 py-2 text-right">In progress</th>
                      <th className="px-3 py-2 text-right">Overdue</th>
                      <th className="px-3 py-2 text-right">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reviewers.map((r) => {
                      const active = r.assigned + r.in_progress;
                      const widthPct = Math.round((active / maxActive) * 100);
                      return (
                        <tr key={r.reviewer_user_id} className="border-b border-border last:border-b-0">
                          <td className="px-3 py-2">
                            <Link
                              href={`/admin/reviews-bulk`}
                              className="font-medium hover:underline"
                            >
                              {r.name || r.email}
                            </Link>
                            <div className="text-[10px] text-muted-foreground">{r.email}</div>
                          </td>
                          <td className="px-3 py-2 min-w-[180px]">
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  'h-full',
                                  r.overdue > 0
                                    ? 'bg-rose-500'
                                    : active >= maxActive * 0.75
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500',
                                )}
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground">{active} active</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.assigned}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.in_progress}</td>
                          <td className={cn(
                            'px-3 py-2 text-right tabular-nums',
                            r.overdue > 0 ? 'text-rose-700 font-semibold' : 'text-muted-foreground',
                          )}>{r.overdue}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.completed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}
