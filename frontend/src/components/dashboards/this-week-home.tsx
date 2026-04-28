'use client';

/**
 * ThisWeekHome — Phase 10.6
 *
 * The team's spec: NGOs need a "What should I do this week?" home —
 * not just stats. A true action center: finish this application, fix
 * this report gap, update this profile field, take this assessment to
 * unlock better-fit grants.
 *
 * This component renders an opinionated, prioritized action list backed
 * by /api/ai/ngo-readiness (which already returns next_actions[]). When
 * the AI signal is unavailable we fall back to a deterministic surface
 * built from the org's local SWR data:
 *   - draft applications (status = draft) → "Finish this application"
 *   - bounced reports (status = revision) → "Address bounceback"
 *   - missing assessment → "Take a 5-minute assessment"
 *   - missing core profile fields → "Add to your profile"
 *
 * Gated by ui.this_week_home (default OFF).
 */

import { useEffect, useState } from 'react';
import {
  Calendar, ArrowRight, FileText, ClipboardCheck, Activity, Sparkles, AlertTriangle, Target,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchNgoReadiness, type NgoReadiness } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

type ActionKind = 'apply' | 'report' | 'profile' | 'assessment' | 'fix' | 'other';

interface ActionItem {
  kind: ActionKind;
  title: string;
  detail?: string;
  href?: string;
  severity?: 'high' | 'medium' | 'low';
  uplift?: number;
}

const kindIcon: Record<ActionKind, typeof FileText> = {
  apply: FileText,
  report: ClipboardCheck,
  profile: Activity,
  assessment: Target,
  fix: AlertTriangle,
  other: Sparkles,
};

const severityTone = {
  high:   'border-l-[hsl(var(--kuja-flag))] bg-[hsl(0_85%_98%)]',
  medium: 'border-l-[hsl(var(--kuja-sun))]  bg-[hsl(38_92%_98%)]',
  low:    'border-l-[hsl(var(--kuja-grow))] bg-[hsl(142_68%_98%)]',
} as const;

function mapActionType(t: string | undefined): ActionKind {
  switch (t) {
    case 'apply_grant': return 'apply';
    case 'submit_report': return 'report';
    case 'update_profile': return 'profile';
    case 'complete_assessment': return 'assessment';
    case 'improve_application': return 'fix';
    default: return 'other';
  }
}

function actionHref(kind: ActionKind): string | undefined {
  switch (kind) {
    case 'apply': return '/grants/';
    case 'report': return '/reports/';
    case 'profile': return '/organizations/profile/';
    case 'assessment': return '/assessments/';
    case 'fix': return '/applications/';
    default: return undefined;
  }
}

export function ThisWeekHome() {
  const { t } = useTranslation();
  const { enabled, ready } = useFlag('ui.this_week_home');
  const [readiness, setReadiness] = useState<NgoReadiness | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !ready) return;
    let cancelled = false;
    setLoading(true);
    fetchNgoReadiness().then((res) => {
      if (cancelled) return;
      if (res.ok) setReadiness(res.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [enabled, ready]);

  if (!enabled) return null;

  // Map next_actions onto our compact ActionItem shape.
  const actions: ActionItem[] = (readiness?.next_actions ?? [])
    .slice(0, 5)
    .map((a) => {
      const kind = mapActionType(a.action_type);
      return {
        kind,
        title: a.title,
        detail: a.detail,
        href: actionHref(kind),
        severity: (a.severity as 'high' | 'medium' | 'low') ?? 'medium',
        uplift: a.estimated_uplift_pts,
      };
    });

  return (
    <div className="rounded-xl border border-border bg-background p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[hsl(var(--kuja-clay))]" />
          <h2 className="kuja-display text-lg">{t('this_week.title')}</h2>
        </div>
        {readiness?.readiness_score != null && (
          <div className="flex items-center gap-1.5">
            <span className="kuja-numeric text-2xl font-bold text-[hsl(var(--kuja-clay))]">
              {readiness.readiness_score}
            </span>
            <span className="text-xs text-muted-foreground">{t('this_week.readiness')}</span>
          </div>
        )}
      </div>

      {readiness?.headline && (
        <p className="text-sm text-foreground leading-relaxed">{readiness.headline}</p>
      )}

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="kuja-shimmer h-14 rounded-md" />
          ))}
        </div>
      )}

      {!loading && actions.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          {t('this_week.empty')}
        </div>
      )}

      {!loading && actions.length > 0 && (
        <ol className="space-y-2">
          {actions.map((a, i) => {
            const Icon = kindIcon[a.kind];
            const tone = severityTone[a.severity ?? 'medium'];
            const Wrap = a.href ? Link : 'div';
            const wrapProps = a.href ? { href: a.href } : {};
            return (
              <li key={i}>
                {/* @ts-expect-error polymorphic href */}
                <Wrap
                  {...wrapProps}
                  className={cn(
                    'group flex items-start gap-3 rounded-md border-l-4 px-3 py-2.5 transition-colors',
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
                    {a.uplift && a.uplift > 0 && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded bg-[hsl(var(--kuja-grow))]/10 px-1.5 py-0.5 text-[10px] font-bold text-[hsl(var(--kuja-grow))] uppercase tracking-wider">
                        +{a.uplift} {t('this_week.uplift_unit')}
                      </div>
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
