'use client';

/**
 * PanelCalibrationCard — Phase 21A (May 2026).
 *
 * Renders reviewer score variance + outliers when 2+ reviewers have
 * completed a review on the same application. Quiet on single
 * reviewer (just shows "no calibration possible with 1 reviewer").
 * Quiet on zero (no card).
 *
 * Donors use this to spot rogue scores BEFORE making a decision.
 * Reviewers can see how their score compares (transparency over
 * panel dynamics).
 */

import { useEffect, useState } from 'react';
import {
  ScaleIcon, AlertTriangle, CheckCircle2, Loader2, User as UserIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PerReviewer {
  reviewer_user_id: number;
  reviewer_name?: string | null;
  score: number;
  deviation_from_mean: number;
  is_outlier: boolean;
}

interface CalibrationResp {
  success: boolean;
  reviewer_count: number;
  mean_score?: number;
  median_score?: number;
  spread?: number;
  std_dev?: number;
  calibration_status: 'no_reviews' | 'single' | 'tight' | 'normal' | 'divergent';
  per_reviewer: PerReviewer[];
  outliers: number[];
}

const STATUS_META: Record<string, { Icon: typeof CheckCircle2; tone: string; label: string; hint: string }> = {
  tight:     { Icon: CheckCircle2,  tone: 'text-[hsl(var(--kuja-grow))]', label: 'Tight panel', hint: 'Reviewers agree within 8 points.' },
  normal:    { Icon: ScaleIcon,     tone: 'text-[hsl(var(--kuja-ink-soft))]', label: 'Normal variance', hint: 'Reviewers within 20 points — typical for human review.' },
  divergent: { Icon: AlertTriangle, tone: 'text-[hsl(var(--kuja-flag))]', label: 'Divergent panel', hint: 'Spread > 20 points — consider a tie-breaking review.' },
};

interface Props {
  applicationId: number;
}

export function PanelCalibrationCard({ applicationId }: Props) {
  const [data, setData] = useState<CalibrationResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    api.get<CalibrationResp>(`/api/applications/${applicationId}/panel-calibration`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => {/* quiet */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applicationId]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading panel calibration…
        </div>
      </Card>
    );
  }
  // Quiet on no reviews — donor sees a different surface for "no reviewers yet"
  if (!data || !data.success || data.reviewer_count === 0) return null;

  if (data.calibration_status === 'single') {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-2">
          <ScaleIcon className="h-4 w-4 mt-0.5 text-[hsl(var(--kuja-ink-soft))]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
              Panel calibration
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Only one reviewer has scored — calibration becomes available with 2+ reviews.
              Single score: <strong className="text-foreground tabular-nums">{data.per_reviewer[0]?.score}</strong>/100.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const meta = STATUS_META[data.calibration_status] ?? STATUS_META.normal;
  const { Icon } = meta;

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2 flex-wrap">
        <Icon className={cn('h-5 w-5 mt-0.5', meta.tone)} aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Panel calibration
          </div>
          <h3 className="kuja-display text-lg">{meta.label}</h3>
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mean</div>
            <div className="text-lg font-semibold tabular-nums">{data.mean_score}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Spread</div>
            <div className="text-lg font-semibold tabular-nums">{data.spread}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">σ</div>
            <div className="text-lg font-semibold tabular-nums">{data.std_dev}</div>
          </div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {data.per_reviewer.map((r) => (
          <li
            key={r.reviewer_user_id}
            className={cn(
              'rounded-md border p-2 flex items-center gap-2',
              r.is_outlier
                ? 'border-[hsl(var(--kuja-flag))]/40 bg-[hsl(var(--kuja-flag))]/5'
                : 'border-[hsl(var(--border))]',
            )}
          >
            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 text-sm">
              {r.reviewer_name ?? `Reviewer #${r.reviewer_user_id}`}
            </span>
            {r.is_outlier && (
              <Badge variant="outline" className="text-[10px] text-[hsl(var(--kuja-flag))] border-[hsl(var(--kuja-flag))]">
                Outlier
              </Badge>
            )}
            <span className="text-sm font-semibold tabular-nums w-12 text-right">
              {r.score}
            </span>
            <span
              className={cn(
                'text-[10px] tabular-nums w-12 text-right',
                Math.abs(r.deviation_from_mean) > 5
                  ? 'text-[hsl(var(--kuja-flag))]'
                  : 'text-muted-foreground',
              )}
            >
              {r.deviation_from_mean > 0 ? '+' : ''}{r.deviation_from_mean}
            </span>
          </li>
        ))}
      </ul>

      {data.calibration_status === 'divergent' && data.outliers.length > 0 && (
        <div className="mt-3 rounded-md border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-2 text-xs">
          <strong className="text-[hsl(var(--kuja-flag))]">Action recommended:</strong> the
          panel disagrees by more than 20 points. Ask the outlier reviewer(s) for their
          rationale, or assign a third reviewer to break the tie.
        </div>
      )}
    </Card>
  );
}
