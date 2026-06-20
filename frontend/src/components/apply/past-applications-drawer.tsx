'use client';

/**
 * Phase 179 — Past-applications drawer for NGOs.
 *
 * The per-criterion `<PastWinsPopover>` (Phase 19B) suggests reusable
 * language for one specific question. This is the complement: a
 * top-level drawer the NGO can open at any time to remind themselves
 * of their successful past applications and see what they wrote, with
 * one-click "open in new tab".
 *
 * Reads from /api/applications/ filtered to status=awarded for the
 * caller's org.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, X, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PastApp {
  id: number;
  status: string;
  grant_title?: string | null;
  ai_score?: number | null;
  human_score?: number | null;
  submitted_at?: string | null;
}

export function PastApplicationsDrawer() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PastApp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const r = await api.get<{ applications: PastApp[] }>(
        '/api/applications/?status=awarded&limit=50',
      );
      setItems(r.applications ?? []);
      setLoaded(true);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void load(); }}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card text-[10px] font-semibold px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="See your past awarded applications"
      >
        <Award className="w-3 h-3" />
        Past wins
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <aside
            role="dialog"
            aria-label="Past awarded applications"
            className={cn(
              'absolute right-0 top-0 h-full w-full max-w-md bg-card border-l border-border shadow-xl',
              'flex flex-col',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border p-3">
              <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                Your past awarded applications
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading && (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading…
                </div>
              )}
              {!loading && loaded && items.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No awarded applications yet — this drawer will fill up as you win grants.
                </p>
              )}
              {items.map((a) => (
                <Link
                  key={a.id}
                  href={`/applications/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md border border-border p-3 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{a.grant_title ?? `Application #${a.id}`}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Awarded
                        {a.submitted_at && (
                          <> · submitted {new Date(a.submitted_at).toLocaleDateString()}</>
                        )}
                        {(a.human_score ?? a.ai_score) != null && (
                          <> · score {Math.round(a.human_score ?? a.ai_score ?? 0)}</>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>

            <footer className="border-t border-border p-3 text-[11px] text-muted-foreground">
              Open any past application in a new tab to copy framing forward.
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
