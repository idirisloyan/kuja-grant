'use client';

/**
 * Phase 185 — Anonymized peer win-rate benchmark for the NGO.
 *
 * Reads `/api/journey/peer-win-rate`. Self-gates when:
 *   - the NGO has zero applications in the past year, OR
 *   - the peer pool is smaller than 5 orgs (no benchmark surfaced to
 *     avoid leaking individual org behavior).
 */

import { useEffect, useState } from 'react';
import { Award, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';

interface Resp {
  my_apps: number;
  my_awards: number;
  my_win_rate_pct: number | null;
  peer_count: number;
  peer_apps: number;
  peer_awards: number;
  peer_win_rate_pct: number | null;
  sectors_used: string[];
}

export function PeerWinRateCard() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/journey/peer-win-rate').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.my_apps === 0 || data.peer_win_rate_pct === null) {
    return null;
  }

  const mine = data.my_win_rate_pct ?? 0;
  const peer = data.peer_win_rate_pct;
  const delta = mine - peer;
  const goodNews = delta >= 0;

  return (
    <Card className="p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-sky-600" />
          How you compare to peers
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {data.peer_count} peer{data.peer_count === 1 ? '' : 's'} in {data.sectors_used.join(', ')}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">You</div>
          <div className="font-serif text-2xl">
            {mine.toFixed(1)}%
          </div>
          <div className="text-[11px] text-muted-foreground">
            <Award className="w-3 h-3 inline" /> {data.my_awards}/{data.my_apps} apps awarded
          </div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peers</div>
          <div className="font-serif text-2xl">
            {peer.toFixed(1)}%
          </div>
          <div className="text-[11px] text-muted-foreground">
            anonymized average
          </div>
        </div>
      </div>
      <p className={
        'mt-3 text-xs ' + (
          goodNews ? 'text-emerald-700' : 'text-amber-700'
        )
      }>
        {goodNews
          ? `You're ${Math.abs(delta).toFixed(1)} pts above peers in your sector.`
          : `You're ${Math.abs(delta).toFixed(1)} pts below peers — Compliance Coach can help.`}
      </p>
    </Card>
  );
}
