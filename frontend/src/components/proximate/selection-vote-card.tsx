'use client';

/**
 * Panel selection vote — OB card on the round page (July 2026).
 *
 * One session per round. Open → each appointed panelist gets a personal
 * /proximate-vote?t= link (WhatsApp share + copy). Live "X of Y voted"
 * while open; strict-majority outcome once the OB closes it. Votes stay
 * OB-only — panelists never see each other's ballots.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Vote, Copy, Check, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrigin } from '@/components/proximate/token-page-support';
import { useTranslation } from '@/lib/hooks/use-translation';

interface VoteInvite {
  id: number;
  voter_name: string;
  voter_phone: string | null;
  voted_at: string | null;
  vote_token?: string;
}

interface BallotEntry {
  participant_id: number;
  partner_name: string;
  locality: string | null;
}

interface VoteSession {
  id: number;
  status: string;
  ballot: BallotEntry[];
  outcome: {
    selected_participant_ids: number[];
    tally: Record<string, { select: number; pass: number }>;
    voted: number;
    invited: number;
  } | null;
  created_at: string | null;
  closed_at: string | null;
}

interface VoteResp {
  success: boolean;
  session: VoteSession | null;
  invites?: VoteInvite[];
  tally?: Record<string, { select: number; pass: number }>;
  voted?: number;
  invited?: number;
}

export function SelectionVoteCard({
  roundId, isOperator,
}: { roundId: number; isOperator: boolean }) {
  const origin = useOrigin();
  const { t } = useTranslation();
  const [data, setData] = useState<VoteResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api.get<VoteResp>(`/api/proximate/rounds/${roundId}/selection-vote`)
      .then(setData)
      .catch(() => {});
  }, [roundId]);

  useEffect(() => {
    if (isOperator) refresh();
  }, [isOperator, refresh]);

  if (!isOperator || !data) return null;

  const session = data.session;
  const invites = data.invites || [];

  const open = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/proximate/rounds/${roundId}/selection-vote`, {});
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('no_appointed_panelists')) {
        setError(t('proximate.vote.err_no_panelists'));
      } else if (msg.includes('roster_empty')) {
        setError(t('proximate.vote.err_roster_empty'));
      } else {
        setError(msg || t('proximate.vote.err_open'));
      }
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/proximate/rounds/${roundId}/selection-vote/close`, {});
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('proximate.vote.err_close'));
    } finally {
      setBusy(false);
    }
  };

  // Origin from a mount effect, never an inline `typeof window` ternary:
  // that resolves to '' on the prerender pass, and a ballot link without
  // its host is dead the moment a panellist receives it on WhatsApp.
  const shareUrl = (token?: string) => `${origin ?? ''}/proximate-vote?t=${token}`;

  const copyLink = async (inv: VoteInvite) => {
    try {
      await navigator.clipboard.writeText(shareUrl(inv.vote_token));
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard unavailable — the WhatsApp button still works */ }
  };

  const waHref = (inv: VoteInvite) => {
    const text = t('proximate.vote.wa_msg', {
      name: inv.voter_name, url: shareUrl(inv.vote_token),
    });
    const phone = (inv.voter_phone || '').replace(/[^\d]/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Vote className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold flex-1">{t('proximate.vote.title')}</h3>
        {session?.status === 'open' && (
          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
            {t('proximate.vote.voted_count', { voted: data.voted ?? 0, invited: data.invited ?? 0 })}
          </Badge>
        )}
        {session?.status === 'closed' && (
          <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">
            {t('proximate.vote.decided')}
          </Badge>
        )}
        {!session && (
          <Button size="sm" disabled={busy} onClick={open}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />}
            {t('proximate.vote.open_btn')}
          </Button>
        )}
        {session?.status === 'open' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={close}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />}
            {t('proximate.vote.close_btn')}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}

      {!session && (
        <p className="text-xs text-muted-foreground">
          {t('proximate.vote.intro')}
        </p>
      )}

      {session?.status === 'open' && (
        <ul className="space-y-1.5">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 text-sm flex-wrap">
              <span className="flex-1 min-w-0 truncate">{inv.voter_name}</span>
              {inv.voted_at ? (
                <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">
                  {t('proximate.vote.voted_badge')}
                </Badge>
              ) : (
                <>
                  <Badge variant="outline" className="text-[10px]">{t('proximate.vote.awaiting')}</Badge>
                  <button
                    type="button"
                    onClick={() => copyLink(inv)}
                    className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted"
                  >
                    {copiedId === inv.id
                      ? <Check className="w-3 h-3" />
                      : <Copy className="w-3 h-3" />}
                    {copiedId === inv.id ? t('proximate.vote.copied') : t('proximate.vote.copy_link')}
                  </button>
                  <a
                    href={waHref(inv)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                  >
                    <MessageCircle className="w-3 h-3" />
                    WhatsApp
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {session?.status === 'closed' && session.outcome && (() => {
        const sel = new Set(session.outcome.selected_participant_ids);
        return (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {t('proximate.vote.outcome', {
                sel: sel.size,
                total: session.ballot.length,
                voted: session.outcome.voted,
                invited: session.outcome.invited,
              })}
            </p>
            <ul className="space-y-1">
              {session.ballot.map((b) => {
                const tal = session.outcome!.tally[String(b.participant_id)]
                  || { select: 0, pass: 0 };
                const isSel = sel.has(b.participant_id);
                return (
                  <li key={b.participant_id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0 truncate">{b.partner_name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {tal.select}–{tal.pass}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${isSel
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-muted text-muted-foreground border-border'}`}
                    >
                      {isSel ? t('proximate.vote.selected') : t('proximate.vote.not_selected')}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })()}
    </Card>
  );
}
