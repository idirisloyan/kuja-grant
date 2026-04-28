'use client';

/**
 * BurdenEstimate — Phase 10.4
 *
 * Pre-publish AI critique on a donor's grant draft. Returns:
 *   - burden_score 0-100 with verdict (low/moderate/high)
 *   - vague criteria with sharper wording
 *   - too-burdensome asks with realistic alternatives
 *   - simplifications across criteria/docs/reporting/eligibility
 *   - predicted quality issues
 *   - eligibility concerns (too narrow / too loose / ambiguous)
 *   - recommended deadline extension days
 *
 * The donor sees this in the publish step of the grant wizard. Apply
 * any suggestion patches the draft state directly.
 *
 * Gated by ui.burden_estimator (default OFF).
 */

import { useState, useCallback } from 'react';
import {
  Sparkles, Loader2, AlertTriangle, CheckCircle2, XCircle,
  Lightbulb, FileQuestion, Target, ChevronDown, ChevronUp, Clock,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchBurdenEstimate, type BurdenEstimate as Burden, type BurdenVerdict } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

interface Props {
  grantId?: number;
  /** Live draft from the donor wizard. Used when grantId not yet saved. */
  draft?: Record<string, unknown>;
  className?: string;
}

const verdictTone: Record<BurdenVerdict, { bg: string; border: string; text: string; icon: typeof CheckCircle2; label: string }> = {
  low: {
    bg: 'bg-[hsl(142_68%_96%)]',
    border: 'border-[hsl(var(--kuja-grow))]/30',
    text: 'text-[hsl(var(--kuja-grow))]',
    icon: CheckCircle2,
    label: 'LOW BURDEN',
  },
  moderate: {
    bg: 'bg-[hsl(38_92%_96%)]',
    border: 'border-[hsl(var(--kuja-sun))]/30',
    text: 'text-[hsl(var(--kuja-sun))]',
    icon: AlertTriangle,
    label: 'MODERATE',
  },
  high: {
    bg: 'bg-[hsl(0_85%_96%)]',
    border: 'border-[hsl(var(--kuja-flag))]/30',
    text: 'text-[hsl(var(--kuja-flag))]',
    icon: XCircle,
    label: 'HIGH BURDEN',
  },
};

export function BurdenEstimate({ grantId, draft, className }: Props) {
  const { t } = useTranslation();
  const { enabled } = useFlag('ui.burden_estimator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burden, setBurden] = useState<Burden | null>(null);
  const [expanded, setExpanded] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchBurdenEstimate({ grantId, draft });
    if (res.ok) {
      setBurden(res.data.burden);
      setExpanded(true);
    } else {
      setError(res.message || 'Burden analysis failed');
    }
    setLoading(false);
  }, [grantId, draft]);

  if (!enabled) return null;

  const tone = burden ? verdictTone[burden.verdict] : null;
  const VerdictIcon = tone?.icon ?? Target;

  return (
    <div className={cn('rounded-xl border', burden && tone ? tone.border : 'border-border', className)}>
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[hsl(var(--kuja-spark))]" />
          <span className="text-sm font-semibold">{t('burden.title')}</span>
          {burden?.source === 'fallback' && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {t('burden.fallback_label')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={run}
            disabled={loading || (!grantId && !draft)}
            className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-spark))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loading ? t('burden.analyzing') : burden ? t('burden.recheck') : t('burden.check')}
          </button>
          {burden && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="rounded p-1 hover:bg-muted"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-3 rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-2 text-xs text-[hsl(var(--kuja-flag))]">
          {error}
        </div>
      )}

      {burden && tone && expanded && (
        <div className="border-t border-border p-3 space-y-3">
          {/* Verdict header */}
          <div className={cn('rounded-lg border p-3', tone.bg, tone.border)}>
            <div className="flex items-center gap-3">
              <VerdictIcon className={cn('h-7 w-7', tone.text)} />
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={cn('kuja-numeric text-2xl font-bold', tone.text)}>
                    {burden.burden_score}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                  <span
                    className={cn(
                      'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      tone.text,
                      tone.bg,
                    )}
                  >
                    {tone.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground">{burden.summary}</p>
              </div>
            </div>
            {burden.recommended_deadline_extension_days > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  {t('burden.recommend_extend', { n: burden.recommended_deadline_extension_days })}
                </span>
              </div>
            )}
          </div>

          {/* Vague criteria */}
          {burden.vague_criteria.length > 0 && (
            <Section icon={<Lightbulb className="h-4 w-4 text-[hsl(var(--kuja-sun))]" />} title={t('burden.vague_criteria')}>
              <div className="space-y-2">
                {burden.vague_criteria.map((v, i) => (
                  <div key={i} className="rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">{v.key}</span>
                      <span className="text-xs font-medium">{v.label}</span>
                    </div>
                    <p className="text-sm text-foreground">{v.issue}</p>
                    <p className="mt-1 text-sm text-foreground">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-grow))] mr-1">
                        {t('burden.sharper')}:
                      </span>
                      {v.sharper}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Too burdensome */}
          {burden.too_burdensome.length > 0 && (
            <Section icon={<AlertTriangle className="h-4 w-4 text-[hsl(var(--kuja-flag))]" />} title={t('burden.too_burdensome')}>
              <div className="space-y-2">
                {burden.too_burdensome.map((b, i) => (
                  <div key={i} className="rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">{b.key}</span>
                      <span className="text-xs font-medium">{b.label}</span>
                    </div>
                    <p className="text-sm text-foreground italic">&ldquo;{b.ask}&rdquo;</p>
                    <p className="mt-1 text-xs text-muted-foreground">{b.why_burdensome}</p>
                    <p className="mt-1 text-sm text-foreground">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-grow))] mr-1">
                        {t('burden.alternative')}:
                      </span>
                      {b.alternative}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Simplifications */}
          {burden.simplifications.length > 0 && (
            <Section icon={<Sparkles className="h-4 w-4 text-[hsl(var(--kuja-spark))]" />} title={t('burden.simplifications')}>
              <div className="space-y-2">
                {burden.simplifications.map((s, i) => (
                  <div key={i} className="rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        {s.area}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">{t('burden.current')}:</span> {s.current}
                    </p>
                    <p className="text-sm text-foreground">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-grow))] mr-1">
                        {t('burden.proposed')}:
                      </span>
                      {s.proposed}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground italic">{s.why}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Predicted quality issues */}
          {burden.predicted_quality_issues.length > 0 && (
            <Section icon={<FileQuestion className="h-4 w-4 text-[hsl(var(--kuja-sun))]" />} title={t('burden.predicted_issues')}>
              <ul className="space-y-1 text-sm text-foreground">
                {burden.predicted_quality_issues.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[hsl(var(--kuja-sun))]" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Eligibility concerns */}
          {burden.eligibility_concerns.length > 0 && (
            <Section icon={<Target className="h-4 w-4 text-[hsl(var(--kuja-clay))]" />} title={t('burden.eligibility_concerns')}>
              <div className="space-y-2">
                {burden.eligibility_concerns.map((e, i) => (
                  <div key={i} className="rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--kuja-clay))]">
                        {e.kind.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{e.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t('burden.suggestion')}:</span> {e.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}
