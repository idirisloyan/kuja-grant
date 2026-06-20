'use client';

/**
 * Phase 239 — Data freshness stamp.
 *
 * Drop this anywhere we want the admin to know when the rendered
 * data was fetched. Caller passes a `loadedAt` Date (or null while
 * loading). Updates the relative-time string every 30s.
 */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  loadedAt: Date | null;
  label?: string;
}

function formatAgo(loadedAt: Date): string {
  const diffSec = Math.max(0, Math.round((Date.now() - loadedAt.getTime()) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.round(diffSec / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function FreshnessStamp({ loadedAt, label }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!loadedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [loadedAt]);

  if (!loadedAt) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Clock className="w-3 h-3" />
      {label ? <>{label}: </> : null}
      {formatAgo(loadedAt)}
    </span>
  );
}
