'use client';

/**
 * Proximate Rounds list — Phase 649 (June 2026).
 *
 * Lists every funding round in the tenant, newest first, with status
 * pill (draft / in_review / active / closed / cancelled). OB sees the
 * "New round" CTA; everyone else can browse.
 */

import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/proximate/empty-state';
import Link from 'next/link';
import { Loader2, Plus, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TONE_CLASSES, toneForProximateStatus } from '@/components/proximate/status-badge';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Round {
  id: number;
  title: string;
  title_ar: string | null;
  trigger_type: string;
  donor_name: string | null;
  envelope_usd: number | null;
  status: string;
  drafted_at: string | null;
  activated_at: string | null;
  closed_at: string | null;
  signed_count: number;
  signers_required: number;
}

export default function ProximateRoundsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  // Phase 701 — Proximate OBs are seeded with User.role='ngo' for
  // platform compat, so user.role==='admin' is false even for OB.
  // Use the persona hook (same fix pattern as the header in Phase 697).
  // Reviewer's "no New round CTA visible" was this exact bug.
  const { persona } = useProximatePersona();
  const isOperator =
    persona === 'ob' || persona === 'admin' || user?.role === 'admin';
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<{ rounds: Round[] }>('/api/proximate/rounds')
      .then((r) => { if (!cancelled) setRounds(r.rounds || []); })
      .catch(() => { if (!cancelled) setRounds([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Redesign Stage 3b — status filter chips with counts; selection
  // lives in the URL (same history.replaceState pattern as the
  // partners register) so a filtered view survives refresh.
  const [statusFilter, setStatusFilter] = useState('all');
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status');
    if (s) setStatusFilter(s);
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (statusFilter && statusFilter !== 'all') sp.set('status', statusFilter);
    else sp.delete('status');
    const qs = sp.toString();
    window.history.replaceState(
      null, '', window.location.pathname + (qs ? `?${qs}` : ''),
    );
  }, [statusFilter]);
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rounds ?? []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rounds]);
  const visibleRounds = useMemo(
    () => (rounds ?? []).filter(
      (r) => statusFilter === 'all' || r.status === statusFilter,
    ),
    [rounds, statusFilter],
  );

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.rounds.title')}
        subtitle={t('proximate.rounds.subtitle')}
        primaryAction={isOperator ? (
          <Link href="/proximate/rounds/new">
            <Button size="sm">
              <Plus className="w-3.5 h-3.5 me-1" />
              {t('proximate.rounds.new') || 'Start new round'}
            </Button>
          </Link>
        ) : undefined}
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('proximate.rounds.loading')}
          </p>
        )}
        {rounds !== null && rounds.length === 0 && !loading && (
          <Card className="p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('proximate.rounds.empty') || 'No funding rounds yet.'}
            </p>
            {isOperator && (
              <Link href="/proximate/rounds/new" className="inline-block">
                <Button>
                  <Plus className="w-4 h-4 me-1.5" />
                  {t('proximate.rounds.new') || 'Start new round'}
                </Button>
              </Link>
            )}
          </Card>
        )}
        {rounds !== null && rounds.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {['all', 'draft', 'in_review', 'active', 'closed', 'cancelled']
              .filter((s) => s === 'all' || statusCounts[s])
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    statusFilter === s
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {s === 'all'
                    ? `All (${rounds.length})`
                    : `${labelForProximateStatus(s, t)} (${statusCounts[s]})`}
                </button>
              ))}
          </div>
        )}
        {rounds !== null && rounds.length > 0 && visibleRounds.length === 0 && (
          <Card>
            <EmptyState
              compact
              title={`No ${labelForProximateStatus(statusFilter, t).toLowerCase()} rounds`}
              hint="Try a different status filter."
            />
          </Card>
        )}
        {visibleRounds.length > 0 && (
          <ul className="space-y-2">
            {visibleRounds.map((r) => (
              <li key={r.id}>
                <Link href={`/proximate/rounds/${r.id}`} className="block">
                  <Card className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate">{r.title}</h3>
                          <Badge variant="outline" className={`text-[10px] ${TONE_CLASSES[toneForProximateStatus(r.status)]}`}>
                            {labelForProximateStatus(r.status, t)}
                          </Badge>
                          {r.status === 'in_review' && (
                            <span className="text-xs text-muted-foreground">
                              {r.signed_count}/{r.signers_required} signed
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>{r.trigger_type}</span>
                          {r.donor_name && <span>· {r.donor_name}</span>}
                          {r.envelope_usd && (
                            <span>· ${r.envelope_usd.toLocaleString()}</span>
                          )}
                          {r.drafted_at && (
                            <span>· {new Date(r.drafted_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageMain>
    </PageShell>
  );
}
