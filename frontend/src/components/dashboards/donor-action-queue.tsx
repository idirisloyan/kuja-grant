'use client';

/**
 * DonorActionQueue — Phase 13.29
 *
 * Donor analog of <ThisWeekHome>. PMO's pattern: dashboards should
 * answer "what do I do next?" — not "what's the state?"
 *
 * Sources used (no new endpoints — composed from existing ones):
 *   - /api/risks/awaiting-response (donors with assigned risks)
 *   - /api/applications/?status=submitted&grant_donor=mine (pending decisions)
 *   - /api/reports/upcoming (overdue + due-soon)
 *
 * Capped at 7 visible items + counts ribbon.
 */

import { useEffect, useState } from 'react';
import {
  Calendar, ArrowRight, Star, ClipboardCheck, AlertOctagon, Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { fetchMyAwaitingResponse, type Risk } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

type ActionKind = 'review_app' | 'review_report' | 'risk_response' | 'overdue_report';

interface ActionItem {
  kind: ActionKind;
  title: string;
  detail?: string;
  href?: string;
  severity: 'high' | 'medium' | 'low';
  uplift?: number;
}

const kindIcon: Record<ActionKind, typeof ClipboardCheck> = {
  review_app: ClipboardCheck,
  review_report: ClipboardCheck,
  risk_response: AlertOctagon,
  overdue_report: Calendar,
};

const severityTone = {
  high:   'border-l-[hsl(var(--kuja-flag))] bg-[hsl(0_85%_98%)]',
  medium: 'border-l-[hsl(var(--kuja-sun))]  bg-[hsl(38_92%_98%)]',
  low:    'border-l-[hsl(var(--kuja-grow))] bg-[hsl(142_68%_98%)]',
} as const;

interface PendingApp {
  id: number;
  status: string;
  grant_id: number;
  ngo_org_name?: string;
  org_name?: string;
  ai_score?: number | null;
}

interface UpcomingReport {
  id: number;
  status: string;
  due_date?: string | null;
  days_overdue?: number;
  org_name?: string;
  grant_id: number;
}

export function DonorActionQueue({ className }: { className?: string }) {
  const { t, formatDate } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [counts, setCounts] = useState({ pending_apps: 0, overdue: 0, risks: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || (user.role !== 'donor' && user.role !== 'admin')) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      api.get<{ applications: PendingApp[] }>('/applications/?status=submitted'),
      api.get<{ reports: UpcomingReport[] }>('/reports/upcoming'),
      fetchMyAwaitingResponse(),
    ]).then(([pendingRes, reportsRes, risksRes]) => {
      if (cancelled) return;
      const list: ActionItem[] = [];

      // Pending applications awaiting review
      const pending = pendingRes.status === 'fulfilled'
        ? (pendingRes.value as { applications?: PendingApp[] }).applications ?? []
        : [];
      for (const a of pending.slice(0, 3)) {
        list.push({
          kind: 'review_app',
          title: t('donor_actions.review_app', { name: a.ngo_org_name || a.org_name || 'NGO' }),
          detail: a.ai_score != null ? t('donor_actions.ai_score', { score: a.ai_score }) : undefined,
          href: `/reviews/${a.id}/`,
          severity: 'medium',
        });
      }

      // Risks awaiting current donor's response
      const risks: Risk[] = risksRes.status === 'fulfilled' && risksRes.value.ok
        ? risksRes.value.data.risks
        : [];
      for (const r of risks.slice(0, 3)) {
        list.push({
          kind: 'risk_response',
          title: t('donor_actions.risk_open', { title: r.title }),
          detail: r.due_date ? t('donor_actions.due_in', { date: formatDate(r.due_date) }) : undefined,
          href: r.subject.kind === 'application'
            ? `/applications/${r.subject.id}/`
            : r.subject.kind === 'grant'
            ? `/grants/${r.subject.id}/`
            : undefined,
          severity: r.severity === 'critical' ? 'high'
            : r.severity === 'high' ? 'high'
            : r.severity === 'medium' ? 'medium' : 'low',
        });
      }

      // Overdue reports
      const reports = reportsRes.status === 'fulfilled'
        ? (reportsRes.value as { reports?: UpcomingReport[] }).reports ?? []
        : [];
      const overdue = reports.filter((r) => (r.days_overdue ?? 0) > 0);
      for (const r of overdue.slice(0, 2)) {
        list.push({
          kind: 'overdue_report',
          title: t('donor_actions.overdue_report', { org: r.org_name || 'NGO' }),
          detail: t('donor_actions.days_overdue', { n: r.days_overdue ?? 0 }),
          href: '/reports/',
          severity: 'high',
        });
      }

      // Sort by severity (high → medium → low) and trim to 7.
      const order = { high: 0, medium: 1, low: 2 };
      list.sort((a, b) => order[a.severity] - order[b.severity]);

      setItems(list.slice(0, 7));
      setCounts({
        pending_apps: pending.length,
        overdue: overdue.length,
        risks: risks.length,
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user, t, formatDate]);

  if (!user || (user.role !== 'donor' && user.role !== 'admin')) return null;

  return (
    <div className={cn('rounded-xl border border-border bg-background p-5 space-y-4', className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[hsl(var(--kuja-clay))]" />
          <h2 className="kuja-display text-lg">{t('donor_actions.title')}</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
          <span className="rounded-full bg-muted px-2 py-0.5">
            {counts.pending_apps} {t('donor_actions.pending')}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">
            {counts.overdue} {t('donor_actions.overdue')}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">
            {counts.risks} {t('donor_actions.risks')}
          </span>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-14 rounded-md" />)}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          {t('donor_actions.empty')}
        </div>
      )}

      {!loading && items.length > 0 && (
        <ol className="space-y-2">
          {items.map((a, i) => {
            const Icon = kindIcon[a.kind];
            const tone = severityTone[a.severity];
            const Wrap = a.href ? Link : 'div';
            const wrapProps = a.href ? { href: a.href } : {};
            return (
              <li key={i}>
                {/* @ts-expect-error polymorphic href */}
                <Wrap
                  {...wrapProps}
                  className={cn(
                    'group flex items-start gap-3 rounded-md border-l-4 px-3 py-2.5',
                    tone,
                    a.href && 'cursor-pointer hover:brightness-95',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    {a.detail && (
                      <div className="text-xs text-muted-foreground mt-0.5">{a.detail}</div>
                    )}
                  </div>
                  {a.href && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  )}
                </Wrap>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
