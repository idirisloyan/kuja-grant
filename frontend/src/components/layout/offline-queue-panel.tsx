'use client';

/**
 * Phase 100 — Offline outbox manual-review panel.
 *
 * The auto-drain handles the happy path: when you reconnect, queued
 * mutations replay against the server, and successful ones evaporate.
 * Failures (4xx — the server actively rejected the queued mutation)
 * stay in the outbox marked `error` so the user can decide what to do.
 *
 * This panel surfaces those failures via a small dismissible toast in
 * the bottom-left corner. It does NOT show pending entries — those are
 * surfaced by the OfflineBanner queue-size counter. Pure error triage.
 *
 * Auto-polls every 30s (cheap — just an IndexedDB read) so newly-errored
 * entries surface without a page reload.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { listAll, clearAll, type OutboxEntry } from '@/lib/offline-outbox';

const POLL_INTERVAL_MS = 30_000;

export function OfflineQueuePanel() {
  const [errored, setErrored] = useState<OutboxEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const all = await listAll();
        if (cancelled) return;
        setErrored(all.filter((e) => e.status === 'error'));
      } catch {
        /* ignore */
      }
    };
    refresh();
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (collapsed || errored.length === 0) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border border-[hsl(var(--kuja-flag)/0.4)] bg-card shadow-lg p-4 space-y-2"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-[hsl(var(--kuja-flag))] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {errored.length} offline change{errored.length === 1 ? '' : 's'} rejected by the server
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            These were saved while you were offline. The server rejected
            them on reconnect — usually because something has changed
            since you queued the change.
          </p>
          <ul className="mt-2 text-[11px] space-y-1 max-h-32 overflow-y-auto">
            {errored.slice(0, 5).map((e) => (
              <li key={e.id ?? e.localId} className="flex items-start gap-1.5">
                <span className="font-mono shrink-0 text-muted-foreground">{e.method}</span>
                <span className="font-semibold truncate">{e.kind}</span>
                <span className="text-muted-foreground truncate" title={e.lastError ?? ''}>
                  {e.lastError ?? 'rejected'}
                </span>
              </li>
            ))}
            {errored.length > 5 && (
              <li className="text-muted-foreground italic">
                …and {errored.length - 5} more
              </li>
            )}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await clearAll();
                setErrored([]);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--kuja-flag)/0.4)] px-2 py-1 text-[11px] font-semibold hover:bg-[hsl(var(--kuja-flag)/0.05)]"
            >
              <Trash2 className="w-3 h-3" /> Discard all queued changes
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Dismiss this panel"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
