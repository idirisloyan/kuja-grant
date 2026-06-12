'use client';

/**
 * Phase 84 — Resume banner.
 *
 * "Resume where you left off." Surfaces any in-flight work stored by
 * useAutosave so the NGO never feels like a closed tab cost them work.
 * Reads from localStorage on mount, lists up to 4 entries newest first,
 * each one a deep-link back to the surface where the work was happening.
 *
 * Renders nothing when there's no active autosave. The empty case is
 * the common one and we don't want a banner taking dashboard real
 * estate for no reason.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ChevronRight, X } from 'lucide-react';
import { listAutosavedGrouped } from '@/lib/hooks/use-autosave';

interface Entry {
  kind: 'application' | 'report' | 'declaration';
  id: number;
  title: string | null;
  href: string;
  updated_at: string;
  field_count: number;
  preview: string;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function kindLabel(k: Entry['kind']): string {
  return k === 'application' ? 'application'
       : k === 'report'      ? 'report'
       : 'declaration';
}

export function ResumeBanner({ className = '' }: { className?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Read on mount only — localStorage doesn't change while this card
    // is visible (the user can't autosave the dashboard itself).
    try {
      const items = listAutosavedGrouped() as Entry[];
      setEntries(items.slice(0, 4));
    } catch { /* ignore */ }
  }, []);

  if (dismissed || entries.length === 0) return null;

  return (
    <section className={`border border-[hsl(var(--kuja-spark))]/30 bg-[hsl(var(--kuja-spark-soft))] rounded-lg p-4 space-y-2 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[hsl(var(--kuja-spark))]" />
          <h3 className="font-semibold text-sm">Resume where you left off</h3>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Hide resume banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        We saved your work locally so a closed tab or lost connection didn&apos;t cost you anything.
      </p>
      <ul className="space-y-1">
        {entries.map((e) => (
          <li key={`${e.kind}:${e.id}`}>
            <Link
              href={e.href}
              className="flex items-center justify-between gap-3 border border-border bg-background rounded-md px-3 py-2 hover:bg-muted/30 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  {e.title || `${kindLabel(e.kind)} #${e.id}`}
                </div>
                {e.preview && (
                  <div className="text-muted-foreground truncate mt-0.5">
                    “{e.preview}”
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {e.field_count} field{e.field_count === 1 ? '' : 's'} · saved {timeAgo(e.updated_at)}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
