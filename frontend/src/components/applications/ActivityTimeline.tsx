'use client';

/**
 * ActivityTimeline — Phase 5.3
 *
 * NGO-visible audit trail for an application. Surfaces every recordable
 * event we already store: lifecycle timestamps, AI calls, provenance
 * citations, reviews, document uploads. Renders as a vertical timeline
 * with kind-coded icons and localized labels.
 *
 * The transparency goal: an NGO should never wonder 'what happened to
 * my application?' — every state change, every AI run, every reviewer
 * touch is visible here. Reviews stay anonymous until they're complete
 * (so reviewers aren't pressured during active deliberation).
 */

import { useEffect, useState } from 'react';
import {
  Loader2, AlertTriangle,
  CheckCircle2, Sparkles, FileText, MessageSquare, Upload, Clock,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useApiError } from '@/lib/hooks/use-api-error';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchApplicationActivity, type ActivityEvent } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

interface Props {
  applicationId: number;
  className?: string;
}

const KIND_ICON: Record<string, typeof Clock> = {
  lifecycle: Clock,
  ai_call: Sparkles,
  provenance: FileText,
  review: MessageSquare,
  document: Upload,
};

const KIND_TONE: Record<string, string> = {
  lifecycle: 'border-sky-200 bg-sky-50 text-sky-800',
  ai_call: 'border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] text-[hsl(var(--kuja-spark))]',
  provenance: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  review: 'border-amber-200 bg-amber-50 text-amber-800',
  document: 'border-border bg-muted text-foreground',
};

function fmtDetail(label: string, detail: Record<string, unknown> | undefined): string {
  if (!detail) return '';
  if (label === 'application.activity.ai_call') {
    const parts: string[] = [];
    if (detail.endpoint) parts.push(String(detail.endpoint));
    if (detail.language) parts.push(`(${detail.language})`);
    if (detail.success === false) parts.push('— failed');
    return parts.join(' ');
  }
  if (label === 'application.activity.provenance') {
    const c = detail.criterion ? `${detail.criterion} · ` : '';
    return `${c}${detail.source_kind ?? ''} · ${detail.confidence ?? ''}`.trim();
  }
  if (label === 'application.activity.review') {
    const r = detail.reviewer ? ` by ${detail.reviewer}` : '';
    const s = detail.overall_score != null ? ` · ${detail.overall_score}%` : '';
    return `${detail.status ?? ''}${r}${s}`.trim();
  }
  if (label === 'application.activity.document_uploaded') {
    return [detail.filename, detail.doc_type].filter(Boolean).join(' · ');
  }
  return '';
}

export function ActivityTimeline({ applicationId, className = '' }: Props) {
  const { t, formatDate } = useTranslation();
  const formatError = useApiError();
  const { enabled, ready } = useFlag('ui.audit_trail_tab');
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    fetchApplicationActivity(applicationId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setEvents(res.data.events);
        else setErrorMsg(res.message);
      })
      .catch((e) => {
        if (!cancelled) setErrorMsg(formatError(e).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [applicationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The flag gates SHOWING the tab content, but if the parent already
  // routed here we still render — flag mostly governs the tab affordance.
  if (!ready) return null;
  if (!enabled) {
    return (
      <div className={cn('rounded-xl border border-border bg-card px-6 py-10 text-center', className)}>
        <p className="text-sm text-muted-foreground">{t('application.activity.coming_soon')}</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card p-5', className)}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{t('application.activity.heading')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('application.activity.subtitle')}
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('application.activity.loading')}
        </div>
      )}

      {!loading && errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!loading && events && events.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t('application.activity.empty')}</p>
        </div>
      )}

      {!loading && events && events.length > 0 && (
        <ol className="relative space-y-3 border-l border-border pl-5">
          {events.map((e, i) => {
            const Icon = KIND_ICON[e.kind] || Clock;
            const tone = KIND_TONE[e.kind] || KIND_TONE.lifecycle;
            const detailText = fmtDetail(e.label, e.detail);
            return (
              <li key={`${e.ts}-${i}`} className="relative">
                <span className={cn('absolute -left-[33px] top-0 inline-flex h-6 w-6 items-center justify-center rounded-full border', tone)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t(e.label)}</span>
                    <span className="text-[11px] text-muted-foreground">{formatDate(e.ts)}</span>
                  </div>
                  {detailText && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{detailText}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
