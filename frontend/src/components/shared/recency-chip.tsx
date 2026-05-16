'use client';

/**
 * RecencyChip — small "last-touched X ago" chip for list rows.
 *
 * PMO-transfer pattern: lists should never make you click in to find
 * out whether a row is fresh or stale. A muted chip on the right
 * (Updated 3d ago / 2 weeks ago / stale) lets program staff scan a
 * 40-row list and triage in seconds.
 *
 * Tone:
 *   - default (under 14 days): muted
 *   - warn   (14-60 days):     amber
 *   - stale  (60+ days):       red
 *   - none   (no date):        hidden
 *
 * Use as a tiny inline element next to a row title — not as a column.
 */

import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/hooks/use-translation';

interface Props {
  /** ISO date string. Pass null/undefined to render nothing. */
  iso?: string | null;
  /** Override the prefix label key; defaults to recency.updated_prefix. */
  labelKey?: string;
  /** Show the clock icon (default: false — keep it tight). */
  withIcon?: boolean;
  className?: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** Pure recency formatter — used in PDF/test paths without i18n context. */
export function formatRecency(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return 'in future';
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / DAY);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function recencyTranslationKey(iso: string | null | undefined): { key: string; vars?: Record<string, number> } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return { key: 'recency.in_future' };
  if (diff < 60 * 1000) return { key: 'recency.just_now' };
  if (diff < 60 * 60 * 1000) return { key: 'recency.minutes_ago', vars: { n: Math.floor(diff / 60_000) } };
  if (diff < DAY) return { key: 'recency.hours_ago', vars: { n: Math.floor(diff / 3_600_000) } };
  const days = Math.floor(diff / DAY);
  if (days < 14) return { key: 'recency.days_ago', vars: { n: days } };
  if (days < 60) return { key: 'recency.weeks_ago', vars: { n: Math.floor(days / 7) } };
  if (days < 365) return { key: 'recency.months_ago', vars: { n: Math.floor(days / 30) } };
  return { key: 'recency.years_ago', vars: { n: Math.floor(days / 365) } };
}

export function recencyTone(iso: string | null | undefined): 'fresh' | 'warn' | 'stale' | 'none' {
  if (!iso) return 'none';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'none';
  const days = (Date.now() - t) / DAY;
  if (days < 14) return 'fresh';
  if (days < 60) return 'warn';
  return 'stale';
}

const TONE_CLASS: Record<string, string> = {
  fresh: 'text-[hsl(var(--kuja-ink-soft))]',
  warn:  'text-[hsl(var(--kuja-sun))]',
  stale: 'text-[hsl(var(--kuja-flag))]',
  none:  'hidden',
};

export function RecencyChip({ iso, labelKey = 'recency.updated_prefix', withIcon = false, className }: Props) {
  const { t } = useTranslation();
  const tk = recencyTranslationKey(iso);
  const tone = recencyTone(iso);
  if (!tk) return null;
  const text = t(tk.key, tk.vars as Record<string, string | number> | undefined);
  const label = t(labelKey);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-medium tabular-nums whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
      title={iso ? new Date(iso).toLocaleString() : undefined}
    >
      {withIcon && <Clock className="h-2.5 w-2.5" aria-hidden="true" />}
      {label} {text}
    </span>
  );
}
