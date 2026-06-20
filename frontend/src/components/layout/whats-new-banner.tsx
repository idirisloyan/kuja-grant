'use client';

/**
 * Phase 99 — "What's new since you last visited" banner.
 *
 * Compresses re-orientation cost for weekly users. Reads the last-visit
 * ISO timestamp from localStorage, pings GET /api/whats-new?since=…,
 * and renders a thin banner with the digest. Dismissing the banner
 * updates last-visit to now so it won't fire again until something new
 * happens.
 *
 * Mounted in the (app) layout below the journey rail. Hidden when:
 *   - no items came back
 *   - user has never visited before (no localStorage marker) — too noisy
 *     for a brand-new session.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

interface Item {
  kind: string;
  count: number;
  label: string;
  href: string;
}
interface Resp {
  success: boolean;
  since: string;
  role: string;
  total: number;
  items: Item[];
}

const LAST_VISIT_KEY = 'kuja_last_visit_iso_v1';
const DISMISS_KEY = 'kuja_whats_new_dismissed_at_v1';

function readLocal(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, val: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, val);
  } catch {
    /* ignore */
  }
}

export function WhatsNewBanner() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Resp | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const since = readLocal(LAST_VISIT_KEY);
    // No prior visit on this device → just stamp now and skip the call.
    if (!since) {
      writeLocal(LAST_VISIT_KEY, new Date().toISOString());
      return;
    }
    const dismissedAt = readLocal(DISMISS_KEY);
    // If they dismissed within the last hour, don't re-fire.
    if (dismissedAt) {
      const elapsed = Date.now() - new Date(dismissedAt).getTime();
      if (elapsed < 60 * 60 * 1000) return;
    }

    let cancelled = false;
    api.get<Resp>(`/whats-new?since=${encodeURIComponent(since)}`)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.total > 0) setData(res);
      })
      .catch(() => { /* network noise — banner just doesn't render */ });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;
  if (dismissed || !data || data.total === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    const now = new Date().toISOString();
    writeLocal(LAST_VISIT_KEY, now);
    writeLocal(DISMISS_KEY, now);
  };

  return (
    <aside
      role="status"
      aria-label={`What's new — ${data.total} updates`}
      className="border-b border-border bg-gradient-to-r from-card to-[hsl(var(--kuja-spark-soft))]/30 dark:to-[hsl(var(--kuja-spark-soft))]/10"
    >
      <div className="mx-auto max-w-[1400px] flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-2 text-xs">
        <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--kuja-spark))] shrink-0" />
        <span className="font-semibold shrink-0">Since you were last here:</span>
        <ol className="flex items-center gap-3 flex-wrap min-w-0">
          {data.items.slice(0, 3).map((item) => (
            <li key={item.kind} className="min-w-0">
              <Link
                href={item.href}
                className="inline-flex items-center gap-1 hover:underline truncate"
                onClick={() => writeLocal(LAST_VISIT_KEY, new Date().toISOString())}
              >
                <span className="truncate">{item.label}</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
              </Link>
            </li>
          ))}
        </ol>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss what's-new banner"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
