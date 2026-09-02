'use client';

/**
 * Proximate Rounds list — Phase 649 (June 2026).
 *
 * Lists every funding round in the tenant, newest first, with status
 * pill (draft / in_review / active / closed / cancelled). OB sees the
 * "New round" CTA; everyone else can browse.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/proximate/empty-state';
import { LoadError } from '@/components/proximate/load-error';
import Link from 'next/link';
import { Loader2, Plus, ChevronRight, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { proxPillForStatus } from '@/components/proximate/status-badge';
import { TestDataToggle } from '@/components/proximate/test-data-toggle';
import { isTestRecord, splitTestRecords } from '@/lib/test-records';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { labelForProximateStatus, labelForRoundType } from '@/lib/proximate-status-labels';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

// Round lifecycle → design-system pill tone.

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

// Queue order for the register: what needs a decision first, history last
// (PFX-SEP02-ROUNDS-001).
const STATUS_RANK: Record<string, number> = {
  in_review: 0, active: 1, draft: 2, closed: 3, cancelled: 4,
};
const COMPLETED = new Set(['closed', 'cancelled']);

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
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.get<{ rounds: Round[] }>('/api/proximate/rounds')
      .then((r) => { setRounds(r.rounds || []); })
      // F-02: a failed fetch must not read as "No funding rounds yet".
      .catch((e: unknown) => { setLoadError(e); })
      .finally(() => { setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

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
  // System-wide test-data classification (PFX-SEP02-GLOBAL-004): fixture
  // rounds ("UAT Round…", "QA Fixture Round…", "verification round…") are
  // hidden unless the shared, persisted "Show test data" flag is on. Chips
  // are counted over the same set the list shows, so a chip never promises
  // rows that clicking it will not deliver.
  const showTest = useUIStore((s) => s.showTestData);
  const { real: realRounds, test: testRounds } = useMemo(
    () => splitTestRecords(rounds ?? [], (r) => [r.title, r.donor_name]),
    [rounds],
  );
  const counted = useMemo(
    () => (showTest ? (rounds ?? []) : realRounds),
    [showTest, rounds, realRounds],
  );
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of counted) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [counted]);
  // Search by name or donor (PFX-SEP02-ROUNDS-001); kept in the URL like the
  // status chip so a narrowed view survives refresh and back-navigation.
  const [q, setQ] = useState('');
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('q');
    if (s) setQ(s);
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (q.trim()) sp.set('q', q.trim());
    else sp.delete('q');
    const qs = sp.toString();
    window.history.replaceState(
      null, '', window.location.pathname + (qs ? `?${qs}` : ''),
    );
  }, [q]);
  // The register is an operational queue, not a history: rounds needing a
  // decision come first (In review → Active → Draft) and completed ones
  // (Closed / Cancelled) sit behind a disclosure, so a phone never opens on
  // last year's rounds. Stable sort keeps the API's newest-first order inside
  // each group.
  const visibleRounds = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return counted
      .filter((r) => statusFilter === 'all' || r.status === statusFilter)
      .filter((r) => !needle
        || r.title.toLowerCase().includes(needle)
        || (r.title_ar || '').toLowerCase().includes(needle)
        || (r.donor_name || '').toLowerCase().includes(needle))
      .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9));
  }, [counted, statusFilter, q]);
  const openRounds = useMemo(
    () => visibleRounds.filter((r) => !COMPLETED.has(r.status)),
    [visibleRounds],
  );
  const completedRounds = useMemo(
    () => visibleRounds.filter((r) => COMPLETED.has(r.status)),
    [visibleRounds],
  );
  const [showCompleted, setShowCompleted] = useState(false);

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
        {loadError != null && !loading && (
          <LoadError error={loadError} onRetry={load} />
        )}
        {!loadError && rounds !== null && rounds.length === 0 && !loading && (
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
        {!loadError && rounds !== null && rounds.length > 0 && (
          <TestDataToggle count={testRounds.length} />
        )}
        {!loadError && rounds !== null && counted.length > 0 && (
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--prox-muted)' }}
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('proximate.rounds.search_placeholder')}
              aria-label={t('proximate.rounds.search_placeholder')}
              className="w-full text-sm rounded-md border bg-background p-2 ps-8"
              style={{ borderColor: 'var(--prox-line-2)', minHeight: 40 }}
            />
          </div>
        )}
        {!loadError && rounds !== null && counted.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {['all', 'draft', 'in_review', 'active', 'closed', 'cancelled']
              .filter((s) => s === 'all' || statusCounts[s])
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={statusFilter === s
                    ? { background: 'var(--prox-accent)', color: '#fff', borderColor: 'transparent' }
                    : { background: 'var(--prox-surface)', color: 'var(--prox-muted)', borderColor: 'var(--prox-line-2)' }}
                >
                  {s === 'all'
                    ? `${t('common.all')} (${counted.length})`
                    : `${labelForProximateStatus(s, t)} (${statusCounts[s]})`}
                </button>
              ))}
          </div>
        )}
        {rounds !== null && rounds.length > 0 && visibleRounds.length === 0 && (
          <Card>
            <EmptyState
              compact
              title={t('proximate.rounds.empty_title')}
              hint={t('proximate.rounds.empty_hint')}
            />
          </Card>
        )}
        {visibleRounds.length > 0 && (() => {
          const row = (r: Round, i: number) => (
            <Link
              key={r.id}
              href={`/proximate/rounds/${r.id}`}
              className="prox-qrow"
              style={i === 0 ? { borderTop: 0 } : undefined}
            >
              <div className="min-w-0">
                {/* Two controlled lines, never an ambiguous ellipsis: the name
                    is what tells two rounds apart (PFX-SEP02-MOBILE-002). */}
                <strong className="line-clamp-2" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14.5 }}>
                  {r.title}
                  {isTestRecord(r.title, r.donor_name) && (
                    <span className="prox-pill slate" style={{ marginInlineStart: 6, verticalAlign: 'middle' }}>
                      {t('common.test_record')}
                    </span>
                  )}
                </strong>
                <small className="block truncate">
                  {labelForRoundType(r.trigger_type, t)}
                  {r.donor_name && <> · {r.donor_name}</>}
                  {r.envelope_usd != null && (
                    <> · <span className="prox-mono">${r.envelope_usd.toLocaleString()}</span></>
                  )}
                  {r.drafted_at && <> · {new Date(r.drafted_at).toLocaleDateString()}</>}
                  {r.status === 'in_review' && (
                    <> · {r.signed_count}/{r.signers_required} {t('proximate.rounds.signed')}</>
                  )}
                </small>
              </div>
              <span className={`prox-pill ${proxPillForStatus(r.status)}`}>
                {labelForProximateStatus(r.status, t)}
              </span>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
            </Link>
          );
          // A status chip already narrows to one group — no disclosure then.
          const grouped = statusFilter === 'all';
          const top = grouped ? openRounds : visibleRounds;
          return (
            <>
              {top.length > 0 && (
                <div className="prox-panel overflow-hidden">{top.map(row)}</div>
              )}
              {grouped && completedRounds.length > 0 && (
                <div className="prox-panel overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowCompleted((v) => !v)}
                    aria-expanded={showCompleted}
                    className="prox-qrow w-full text-start"
                    style={{ borderTop: 0 }}
                  >
                    <div className="min-w-0">
                      <strong>{t('proximate.rounds.completed_n', { n: completedRounds.length })}</strong>
                      <small className="block">{t('proximate.rounds.completed_hint')}</small>
                    </div>
                    <ChevronRight
                      className="w-4 h-4 transition-transform"
                      style={{ color: 'var(--prox-muted)', transform: showCompleted ? 'rotate(90deg)' : undefined }}
                    />
                  </button>
                  {showCompleted && completedRounds.map((r, i) => row(r, i + 1))}
                </div>
              )}
            </>
          );
        })()}
      </PageMain>
    </PageShell>
  );
}
