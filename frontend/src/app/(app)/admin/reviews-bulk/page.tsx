'use client';

/**
 * Phase 140 — Bulk reviewer assignment.
 *
 * Lists submitted/under-review applications + lets the admin (or donor)
 * select N rows, pick one reviewer, and POST to
 * /api/reviews/bulk-assign (Phase 136 backend).
 *
 * Hits the existing list endpoint with status=submitted,under_review;
 * keeps the UI deliberately compact so it's a one-page workflow.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, ChevronRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { api, ApiError } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface ListItem {
  id: number;
  status: string;
  grant?: { id: number; title?: string | null } | null;
  ngo_org?: { id: number; name?: string | null } | null;
  submitted_at?: string | null;
}

interface ReviewerUser {
  id: number;
  name?: string | null;
  email: string;
  role: string;
}

export default function BulkReviewerAssignPage() {
  const { t } = useTranslation();
  const viewer = useAuthStore((s) => s.user);
  const [apps, setApps] = useState<ListItem[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerUser[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reviewerId, setReviewerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ applications?: ListItem[] }>('/api/applications/?status=submitted'),
      api.get<{ applications?: ListItem[] }>('/api/applications/?status=under_review'),
      api.get<{ users?: ReviewerUser[] }>('/api/users/?role=reviewer'),
    ]).then(([s, u, r]) => {
      if (cancelled) return;
      const merged = [
        ...(s.applications ?? []),
        ...(u.applications ?? []),
      ];
      setApps(merged);
      setReviewers((r.users ?? []).filter((x) => x.role === 'reviewer'));
    }).catch(() => {
      if (!cancelled) toast.error(t('reviews_bulk.load_failed'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (viewer && viewer.role !== 'admin' && viewer.role !== 'donor') {
    return (
      <PageShell>
        <PageHeader title={t('reviews_bulk.title')} subtitle={t('reviews_bulk.admins_donors_only')} />
      </PageShell>
    );
  }

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === apps.length) setSelected(new Set());
    else setSelected(new Set(apps.map((a) => a.id)));
  };

  const assign = async () => {
    if (!reviewerId || selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ summary: { created: number; already_assigned: number; failed: number } }>(
        '/api/reviews/bulk-assign',
        {
          reviewer_user_id: reviewerId,
          application_ids: Array.from(selected),
        },
      );
      const { created, already_assigned, failed } = res.summary;
      const msg = [
        created ? t('reviews_bulk.n_new', { n: created }) : '',
        already_assigned ? t('reviews_bulk.n_already_assigned', { n: already_assigned }) : '',
        failed ? t('reviews_bulk.n_failed', { n: failed }) : '',
      ].filter(Boolean).join(', ');
      toast.success(t('reviews_bulk.bulk_assignment_result', { result: msg || t('reviews_bulk.no_changes') }));
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('reviews_bulk.bulk_assign_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title={t('reviews_bulk.title')}
        icon={Users}
        subtitle={t('reviews_bulk.subtitle')}
      />
      <PageMain>
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">{t('reviews_bulk.reviewer_label')}</label>
            <select
              value={reviewerId ?? ''}
              onChange={(e) => setReviewerId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t('reviews_bulk.pick_reviewer')}</option>
              {reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || r.email}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {t('reviews_bulk.n_of_m_selected', { selected: selected.size, total: apps.length })}
            </span>
            <Button
              type="button"
              onClick={assign}
              disabled={!reviewerId || selected.size === 0 || busy}
              className="ml-auto"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {t('reviews_bulk.assign')} {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>

          {loading && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
              {t('reviews_bulk.loading_submissions')}
            </div>
          )}

          {!loading && apps.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t('reviews_bulk.empty_state')}
            </p>
          )}

          {!loading && apps.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-2 py-2 w-8 text-left">
                      <input
                        type="checkbox"
                        aria-label={t('reviews_bulk.select_all')}
                        checked={selected.size === apps.length && apps.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">{t('reviews_bulk.col_application')}</th>
                    <th className="px-3 py-2 text-left">{t('reviews_bulk.col_ngo')}</th>
                    <th className="px-3 py-2 text-left">{t('reviews_bulk.col_grant')}</th>
                    <th className="px-3 py-2 text-left">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label={t('reviews_bulk.select_application', { id: a.id })}
                          checked={selected.has(a.id)}
                          onChange={() => toggle(a.id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/applications/${a.id}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          #{a.id}
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {a.ngo_org?.name ?? t('reviews_bulk.org_fallback', { id: a.ngo_org?.id ?? '?' })}
                      </td>
                      <td className="px-3 py-2 text-xs truncate max-w-[280px]">
                        {a.grant?.title ?? t('reviews_bulk.grant_fallback', { id: a.grant?.id ?? '?' })}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">
                        {a.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageMain>
    </PageShell>
  );
}
