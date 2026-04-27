'use client';

/**
 * MatchesCard — Phase 3.2 NGO opportunity feed
 *
 * Replaces the generic "open grants" list on the NGO dashboard with a
 * ranked feed of grants the NGO is most likely to win. Each card shows:
 *   - the predicted match score (0-100)
 *   - top strength (what's working) and top blocker (one specific gap)
 *   - one-click apply
 *
 * Renders only when ai.match_engine flag is on. Falls back to nothing
 * when off — the dashboard's existing "open grants" list remains.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles, ArrowUpRight, Loader2, Trophy, ShieldAlert, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useFlag } from '@/lib/hooks/use-feature-flags';
import { fetchMatchesForMe, type MatchForOrg } from '@/lib/copilot-api';
import { cn } from '@/lib/utils';

const SCORE_TONE = (s: number) =>
  s >= 75
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : s >= 50
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-rose-700 bg-rose-50 border-rose-200';

interface Props {
  limit?: number;
  className?: string;
}

export function MatchesCard({ limit = 5, className = '' }: Props) {
  const { t, formatDate } = useTranslation();
  const { enabled, ready } = useFlag('ai.match_engine');
  const [matches, setMatches] = useState<MatchForOrg[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const load = async (recompute = false) => {
    if (!ready || !enabled) return;
    setLoading(!recompute);
    setRecomputing(recompute);
    try {
      const res = await fetchMatchesForMe({ limit, recompute });
      if (res.ok) setMatches(res.data.matches || []);
    } finally {
      setLoading(false);
      setRecomputing(false);
    }
  };

  useEffect(() => {
    if (ready && enabled) {
      load(false);
    }
  }, [ready, enabled, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !enabled) return null;

  const isEmpty = !loading && matches !== null && matches.length === 0;

  return (
    <div className={cn('rounded-[12px] border border-border bg-card p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-[hsl(var(--kuja-spark))]" />
            {t('matches.heading')}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {t('matches.subtitle')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={recomputing}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {recomputing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {t('matches.recompute')}
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('matches.empty.title')}</p>
          <p className="mt-1 text-xs text-muted-foreground/80">{t('matches.empty.body')}</p>
        </div>
      )}

      {!loading && matches && matches.length > 0 && (
        <ul className="space-y-2">
          {matches.map((m) => (
            <li
              key={m.grant_id}
              className="rounded-md border border-border bg-background p-3 transition hover:shadow-[var(--kuja-elev-2)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/apply/${m.grant_id}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-[hsl(var(--kuja-clay))]"
                  >
                    <span className="truncate">{m.grant.title}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
                  </Link>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {m.grant.total_funding && m.grant.currency
                      ? `${m.grant.currency} ${m.grant.total_funding.toLocaleString()}`
                      : ''}
                    {m.grant.deadline ? ` · ${formatDate(m.grant.deadline)}` : ''}
                  </div>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold',
                    SCORE_TONE(m.score),
                  )}
                >
                  {m.score}%
                </span>
              </div>

              {(m.top_strength || m.top_blocker) && (
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {m.top_strength && (
                    <div className="flex items-start gap-1.5 text-[11px] text-emerald-700">
                      <Trophy className="mt-0.5 h-3 w-3 flex-shrink-0" />
                      <span>{m.top_strength}</span>
                    </div>
                  )}
                  {m.top_blocker && (
                    <div className="flex items-start gap-1.5 text-[11px] text-rose-700">
                      <ShieldAlert className="mt-0.5 h-3 w-3 flex-shrink-0" />
                      <span>{m.top_blocker}</span>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
