'use client';

/**
 * StarButton — optimistic star/unstar toggle for the personal watchlist.
 *
 * - Single-icon button (filled star = starred, outline = not)
 * - Optimistic update flips immediately, calls POST, rolls back on error
 * - Self-fetches starred state on mount (one cheap GET) — caller can skip
 *   this by passing `initialStarred`
 * - aria-pressed announces state to screen readers
 *
 * Usage:
 *   <StarButton kind="grant" targetId={grant.id} />
 *   <StarButton kind="organization" targetId={org.id} initialStarred={true} />
 */

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  kind: 'grant' | 'organization';
  targetId: number;
  initialStarred?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** Stop event propagation (use when the parent is also a clickable card) */
  stopPropagation?: boolean;
}

export function StarButton({
  kind, targetId, initialStarred, size = 'md', className, stopPropagation = true,
}: Props) {
  const [starred, setStarred] = useState<boolean | null>(initialStarred ?? null);
  const [pending, setPending] = useState(false);

  // Self-fetch if not provided
  useEffect(() => {
    if (initialStarred !== undefined) return;
    let cancelled = false;
    api.get<{ starred: boolean }>(`/api/watchlist/check/${kind}/${targetId}`)
      .then(d => { if (!cancelled) setStarred(d.starred); })
      .catch(() => { if (!cancelled) setStarred(false); });
    return () => { cancelled = true; };
  }, [kind, targetId, initialStarred]);

  const toggle = async (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (pending || starred === null) return;
    const prev = starred;
    setStarred(!prev);    // optimistic
    setPending(true);
    try {
      const resp = await api.post<{ starred: boolean }>('/api/watchlist/toggle', { kind, target_id: targetId });
      setStarred(resp.starred);
    } catch {
      setStarred(prev);   // rollback
    } finally {
      setPending(false);
    }
  };

  const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const pad = size === 'sm' ? 'p-1' : 'p-1.5';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!!starred}
      aria-label={starred ? 'Remove from watchlist' : 'Add to watchlist'}
      title={starred ? 'Remove from watchlist' : 'Add to watchlist'}
      disabled={pending || starred === null}
      className={cn(
        'inline-flex items-center justify-center rounded-md hover:bg-[hsl(var(--kuja-sand-50))] transition-colors',
        pad,
        starred ? 'text-[hsl(var(--kuja-sun))]' : 'text-[hsl(var(--kuja-ink-soft))]',
        className,
      )}
    >
      <Star
        className={cn(dim, 'transition-transform', starred ? 'fill-current' : '')}
        aria-hidden
      />
    </button>
  );
}
