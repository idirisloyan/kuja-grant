'use client';

/**
 * SlipsForecastBadge — Phase 13.36.
 *
 * Tiny component that hits /api/grants/<id>/compliance-health/trajectory
 * and surfaces a "slips below at-risk in N days" warning when the linear
 * regression projects a band drop within the next 30 days. Renders
 * nothing when slips_below_at_risk_in_days is null (not slipping) or
 * when the trajectory data is unavailable — fail-closed UX, never noisy.
 *
 * Drop in next to a grant's score badge:
 *
 *   <SlipsForecastBadge grantId={grant.id} />
 */

import { useEffect, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import { api } from '@/lib/api';

interface TrajectoryPayload {
  success?: boolean;
  slips_below_at_risk_in_days?: number | null;
}

interface SlipsForecastBadgeProps {
  grantId: number;
  /** Hide the badge if the projected slip is more than `thresholdDays` away. Default 30. */
  thresholdDays?: number;
  className?: string;
}

export function SlipsForecastBadge({ grantId, thresholdDays = 30, className = '' }: SlipsForecastBadgeProps) {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<TrajectoryPayload>(`/grants/${grantId}/compliance-health/trajectory?days=60`)
      .then((res) => {
        if (cancelled) return;
        const n = res?.slips_below_at_risk_in_days;
        if (typeof n === 'number' && n > 0 && n <= thresholdDays) {
          setDays(n);
        } else {
          setDays(null);
        }
      })
      .catch(() => {
        if (!cancelled) setDays(null);
      });
    return () => { cancelled = true; };
  }, [grantId, thresholdDays]);

  if (days === null) return null;

  const tone = days <= 7
    ? 'border-red-300 bg-red-50 text-red-800'
    : days <= 14
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-sky-300 bg-sky-50 text-sky-800';

  return (
    <span
      title={`Linear regression on the last 60 daily snapshots projects this grant to slip below the at-risk threshold in ${days} day${days === 1 ? '' : 's'}.`}
      className={`inline-flex items-center gap-1 h-6 rounded-full border px-2 text-[11px] font-medium ${tone} ${className}`}
    >
      <TrendingDown className="h-3 w-3" aria-hidden />
      {`Slips in ${days}d`}
    </span>
  );
}
