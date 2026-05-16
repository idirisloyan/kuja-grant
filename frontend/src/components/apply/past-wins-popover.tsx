'use client';

/**
 * PastWinsPopover — Phase 19B (May 2026).
 *
 * Inline "from your past wins" widget for the apply wizard's criterion
 * cards. Click → fetches the NGO's own awarded applications and shows
 * the best-matching past response, with a one-click "Use this" that
 * copies the text into the current criterion's textarea.
 *
 * Lazy: only fetches when the user actually opens it. Server-side
 * scoring is zero-AI heuristic (token overlap + recency) so the cost
 * is negligible — but we still gate by user intent to avoid wasted
 * requests on every wizard mount.
 */

import { useState } from 'react';
import {
  Loader2, History, Copy, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Candidate {
  response: string;
  word_count: number;
  source_app_id: number;
  source_grant_title?: string | null;
  source_donor_name?: string | null;
  awarded_at?: string | null;
  match_score: number;
  match_kind: 'exact_key' | 'token_match';
  past_key?: string;
}

interface PastWinsResp {
  success: boolean;
  criterion_key: string;
  criterion_label?: string;
  awarded_apps_searched: number;
  candidates: Candidate[];
}

interface Props {
  applicationId: number | null;
  criterionKey: string;
  criterionLabel?: string;
  /** Called when user clicks "Use this" on a candidate */
  onUse: (text: string) => void;
  /** If the user has already typed something, hide the suggestions
   * (we don't want to nudge people into overwriting their own draft). */
  currentText?: string;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function PastWinsPopover({
  applicationId, criterionKey, criterionLabel, onUse, currentText = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PastWinsResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Don't suggest reuse once the user has substantial text — protects
  // their original work from getting clobbered by a one-click overwrite.
  const userHasDraft = (currentText || '').trim().split(/\s+/).filter(Boolean).length >= 50;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data && applicationId) {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          criterion_key: criterionKey,
          ...(criterionLabel ? { criterion_label: criterionLabel } : {}),
        });
        const r = await api.get<PastWinsResp>(
          `/api/applications/${applicationId}/past-wins?${qs.toString()}`,
        );
        setData(r);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not load past wins');
      } finally {
        setLoading(false);
      }
    }
  };

  if (!applicationId) return null;

  return (
    <div className="mt-2 rounded-md border border-dashed border-[hsl(var(--border))] bg-background">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-medium hover:bg-[hsl(var(--kuja-sand))]/40 rounded-md"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5">
          <History className="h-3 w-3 text-[hsl(var(--kuja-clay))]" />
          From your past wins
        </span>
        {open
          ? <ChevronUp className="h-3 w-3" />
          : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-dashed border-[hsl(var(--border))]">
          {loading && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching your awarded applications…
            </div>
          )}

          {error && (
            <div className="text-[11px] text-[hsl(var(--kuja-flag))]">{error}</div>
          )}

          {data && data.candidates.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">
              {data.awarded_apps_searched === 0
                ? "No awarded applications yet — your past wins will show here once you've been awarded a grant."
                : `Searched ${data.awarded_apps_searched} awarded application${data.awarded_apps_searched === 1 ? '' : 's'} — no strong match for this criterion. Try a different phrasing.`}
            </p>
          )}

          {data && data.candidates.length > 0 && (
            <>
              {userHasDraft && (
                <div className="text-[10px] text-[hsl(var(--kuja-sun))]">
                  You already have a draft — past wins shown below for reference only.
                </div>
              )}
              {data.candidates.map((c, i) => (
                <div
                  key={i}
                  className="rounded-md border border-[hsl(var(--border))] p-2 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-[10px] text-muted-foreground">
                      <strong className="text-foreground">{c.source_grant_title ?? `App #${c.source_app_id}`}</strong>
                      {c.source_donor_name && (
                        <> · <em>{c.source_donor_name}</em></>
                      )}
                      {c.awarded_at && (
                        <> · awarded {timeAgo(c.awarded_at)}</>
                      )}
                    </div>
                    <Badge variant="outline" className={cn(
                      'text-[10px]',
                      c.match_kind === 'exact_key' && 'border-[hsl(var(--kuja-grow))] text-[hsl(var(--kuja-grow))]',
                    )}>
                      {c.match_kind === 'exact_key' ? 'Same criterion' : 'Similar criterion'}
                    </Badge>
                  </div>
                  <p className="text-[11px] leading-relaxed line-clamp-4 text-foreground">
                    {c.response}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">{c.word_count} words</span>
                    <button
                      type="button"
                      onClick={() => {
                        onUse(c.response);
                        setCopiedIdx(i);
                        setTimeout(() => setCopiedIdx(null), 1800);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-0.5 text-[10px] font-semibold hover:bg-[hsl(var(--kuja-sand))]/40"
                    >
                      {copiedIdx === i
                        ? <Check className="h-3 w-3 text-[hsl(var(--kuja-grow))]" />
                        : <Copy className="h-3 w-3" />}
                      {copiedIdx === i ? 'Copied to draft' : 'Use as starting point'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
