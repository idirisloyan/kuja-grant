'use client';

/**
 * Phase 117 — Peer reference snippets ("orgs like yours wrote this").
 *
 * Drop next to a criterion textarea. On click, fetches up to 3
 * anonymized excerpts from past awarded peer applications matched
 * by sector + country, and displays them in an inline expandable
 * panel.
 *
 *   <PeerSnippetsButton criterionKey={c.key} grantId={grant.id} />
 *
 * Backend: GET /api/peer-snippets/<criterionKey>?grant_id=<id>
 * NGO-only — silently hides for other roles via 403.
 */

import { useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Snippet {
  snippet: string;
  peer_label: string;
  sector_label: string;
}

interface Resp {
  success: boolean;
  criterion_key: string;
  snippets: Snippet[];
  notice: string;
}

interface Props {
  criterionKey: string;
  grantId?: number | null;
  className?: string;
}

export function PeerSnippetsButton({ criterionKey, grantId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setOpen(true);
    if (loaded || loading) return;
    setLoading(true);
    setError(null);
    try {
      const qs = grantId ? `?grant_id=${grantId}` : '';
      const res = await api.get<Resp>(`/api/peer-snippets/${encodeURIComponent(criterionKey)}${qs}`);
      setSnippets(res?.snippets ?? []);
      setNotice(res?.notice ?? '');
      setLoaded(true);
    } catch {
      setError('Could not load peer examples.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('mt-2', className)}>
      {!open ? (
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card text-[10px] font-semibold px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="See how peer NGOs phrased this in winning proposals"
        >
          <Users className="w-3 h-3" />
          See peer examples
        </button>
      ) : (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 text-xs">
          <header className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Users className="w-3.5 h-3.5 text-[hsl(var(--kuja-clay))]" />
              Peer examples
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Hide
            </button>
          </header>

          {loading && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Finding peers like you…
            </div>
          )}
          {error && <div className="text-rose-600">{error}</div>}
          {loaded && !loading && snippets.length === 0 && (
            <p className="text-muted-foreground">
              No peer examples yet for this criterion — be the first to set the benchmark.
            </p>
          )}

          {snippets.map((s, i) => (
            <div key={i} className="border-l-2 border-[hsl(var(--kuja-clay))]/40 pl-2 py-1">
              <p className="text-foreground italic">&ldquo;{s.snippet}&rdquo;</p>
              <p className="text-[10px] text-muted-foreground mt-1">— {s.peer_label}</p>
            </div>
          ))}

          {notice && snippets.length > 0 && (
            <p className="text-[10px] text-muted-foreground italic border-t border-border pt-2">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
