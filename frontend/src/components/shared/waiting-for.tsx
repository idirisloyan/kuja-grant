'use client';

/**
 * WaitingFor — Phase 98.1 (design backlog Wave 1)
 *
 * Humanises every "Waiting on X" status by showing exactly which named
 * humans we are waiting on and which ones have already acted.
 *
 * Replaces opaque states like "Waiting for signatures (2/4)" with
 * "Waiting for 2 signatures — Amina (signed), Peter (pending)..." so
 * the NGO / OB member can chase the right person instead of staring
 * at a number.
 *
 * Extends the Phase 62-63 named-entity work to wait states.
 */

import { Check, Clock } from 'lucide-react';
import { NameChip } from './name-chip';
import { cn } from '@/lib/utils';

export interface Actor {
  name: string;
  status: 'done' | 'pending' | 'declined';
  /** Optional ISO timestamp shown on hover. */
  at?: string | null;
  /** Optional role label like "OB Co-chair". */
  role?: string;
}

interface Props {
  /** What we're waiting on, e.g. "2 signatures", "OB approval". Already pluralised. */
  what: string;
  actors: Actor[];
  /** When true, render in a compact one-line variant. Default false. */
  inline?: boolean;
  className?: string;
}

export function WaitingFor({ what, actors, inline = false, className }: Props) {
  const done = actors.filter(a => a.status === 'done');
  const pending = actors.filter(a => a.status === 'pending');

  if (inline) {
    return (
      <div className={cn('flex flex-wrap items-center gap-1.5 text-xs', className)}>
        <Clock className="h-3.5 w-3.5 text-amber-600" />
        <span className="font-medium text-foreground">Waiting for {what}</span>
        {done.length > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{done.length} signed</span>
          </>
        )}
        {pending.length > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              still waiting on{' '}
              {pending.slice(0, 2).map(a => a.name).join(', ')}
              {pending.length > 2 && ` +${pending.length - 2}`}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Waiting for ${what}`}
      className={cn(
        // Light tokens with explicit dark: variants so the surface adapts
        // when the app-wide dark mode lands (Phase 98 Wave 2b backlog).
        'rounded-md border border-amber-200 bg-amber-50/60 p-3',
        'dark:border-amber-900/40 dark:bg-amber-950/30',
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-300" />
        <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Waiting for {what}
        </span>
      </div>
      <div className="space-y-1.5">
        {actors.map(a => (
          <div key={a.name} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              {a.status === 'done' ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : a.status === 'declined' ? (
                <span className="text-xs text-rose-600">✗</span>
              ) : (
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <NameChip name={a.name} size="xs" />
              {a.role && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {a.role}
                </span>
              )}
            </div>
            <span
              className={cn(
                'text-[11px]',
                a.status === 'done' && 'text-emerald-700',
                a.status === 'pending' && 'text-muted-foreground',
                a.status === 'declined' && 'text-rose-700',
              )}
              title={a.at || undefined}
            >
              {a.status === 'done' ? 'signed' : a.status === 'declined' ? 'declined' : 'pending'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
