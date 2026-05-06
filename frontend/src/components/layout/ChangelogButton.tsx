'use client';

/**
 * ChangelogButton — Phase 13.16
 *
 * Sparkle button in the header. Red dot when there's an unread entry
 * (stored in localStorage by latest-seen ISO date). Click opens a
 * dialog with the curated RECENT_RELEASES list.
 */

import { useState, useEffect, useMemo } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { RECENT_RELEASES, type ChangelogEntry } from '@/lib/changelog';
import { cn } from '@/lib/utils';

const SEEN_KEY = 'kuja_changelog_seen';

const categoryTone: Record<string, string> = {
  feature:      'bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]',
  fix:          'bg-[hsl(var(--kuja-clay))]/10 text-[hsl(var(--kuja-clay))]',
  security:     'bg-[hsl(var(--kuja-flag))]/10 text-[hsl(var(--kuja-flag))]',
  performance:  'bg-blue-50 text-blue-700',
  announcement: 'bg-[hsl(var(--kuja-spark))]/10 text-[hsl(var(--kuja-spark))]',
};

export function ChangelogButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [seenDate, setSeenDate] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setSeenDate(window.localStorage.getItem(SEEN_KEY));
    } catch {
      // ignore
    }
  }, []);

  const latestEntry = RECENT_RELEASES[0];
  const hasUnread = useMemo(() => {
    if (!latestEntry) return false;
    if (!seenDate) return true;
    return latestEntry.date > seenDate;
  }, [latestEntry, seenDate]);

  const markSeen = () => {
    if (!latestEntry) return;
    try {
      window.localStorage.setItem(SEEN_KEY, latestEntry.date);
    } catch { /* ignore */ }
    setSeenDate(latestEntry.date);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); markSeen(); }}
        className="relative rounded-md p-1.5 hover:bg-muted"
        aria-label={t('changelog.open')}
      >
        <Sparkles className="h-4 w-4 text-[hsl(var(--kuja-spark))]" />
        {hasUnread && (
          <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[hsl(var(--kuja-flag))]" />
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[hsl(var(--kuja-spark))]" />
                <h2 className="kuja-display text-lg">{t('changelog.title')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
              {RECENT_RELEASES.map((entry: ChangelogEntry, i: number) => (
                <article key={i} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <time className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                      {entry.date}
                    </time>
                    {entry.category && (
                      <span className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        categoryTone[entry.category],
                      )}>
                        {entry.category}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{entry.title}</h3>
                  {entry.body && (
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{entry.body}</p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
