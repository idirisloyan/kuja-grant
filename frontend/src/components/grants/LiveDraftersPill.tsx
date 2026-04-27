'use client';

/**
 * LiveDraftersPill — Phase 4.2
 *
 * Shows a small pill on the donor's grant detail page indicating how many
 * NGOs currently have an active draft application for this grant. The
 * count is anonymized but real — sourced from /api/grants/:id/drafters.
 * Refreshes every 60s while the page is open. Hidden when count is 0
 * (avoids the demoralizing "0 NGOs are drafting" experience for donors).
 *
 * Gated by ui.live_drafters_pill flag; default OFF until verified in pilot.
 */

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchGrantDrafters } from '@/lib/copilot-api';

interface Props {
  grantId: number;
  className?: string;
}

export function LiveDraftersPill({ grantId, className = '' }: Props) {
  const { t } = useTranslation();
  const { enabled, ready } = useFlag('ui.live_drafters_pill');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !enabled) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const res = await fetchGrantDrafters(grantId);
        if (!cancelled && res.ok) setCount(res.data.count);
      } catch {
        // Silent — pill is best-effort.
      }
    };
    load();
    interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [grantId, ready, enabled]);

  if (!ready || !enabled || !count || count <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--kuja-spark))] ${className}`}
      title={t('drafters.tooltip', { days: 14 })}
    >
      <Users className="h-3 w-3" />
      <span className="kuja-numeric">{count}</span>
      <span>{t('drafters.label')}</span>
    </span>
  );
}
