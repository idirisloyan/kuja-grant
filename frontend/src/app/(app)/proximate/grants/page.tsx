'use client';

/**
 * Proximate inbound-grants list — Phase 721.
 *
 * OB view: all Adeso's grants from institutional donors.
 * Donor view: only their own grants (scoped server-side).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Plus, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
import { EmptyState } from '@/components/proximate/empty-state';
import { LoadError } from '@/components/proximate/load-error';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

// Grant status → design-system pill tone (heuristic over free-form status).
function grantPill(s: string): string {
  if (/active|current|open|received|allocated/.test(s)) return 'good';
  if (/pending|draft|review|due|reporting/.test(s)) return 'warn';
  if (/flag|overdue|breach|suspend/.test(s)) return 'danger';
  return 'slate';
}

interface Grant {
  id: number;
  title: string;
  donor_name: string | null;
  donor_grant_ref: string | null;
  amount_committed_usd: number | null;
  amount_received_usd: number;
  amount_allocated_usd: number;
  amount_remaining_usd: number;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  reporting_cadence: string;
  reporting_next_due_at: string | null;
  status: string;
}

function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

export default function ProximateGrantsListPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const { persona } = useProximatePersona();
  const { t } = useTranslation();
  const isOb = persona === 'ob' || persona === 'admin';

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<{ success: boolean; grants: Grant[] }>('/api/proximate/grants')
      .then((r) => { setGrants(r.grants || []); })
      .catch((e: unknown) => { setError(e); })
      .finally(() => { setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCommitted = grants.reduce(
    (a, g) => a + (g.amount_committed_usd || 0), 0,
  );
  const totalAllocated = grants.reduce((a, g) => a + g.amount_allocated_usd, 0);
  const totalRemaining = grants.reduce((a, g) => a + g.amount_remaining_usd, 0);

  return (
    <PageShell>
      <PageHeader
        title={isOb ? t('proximate.grants.title_ob') : t('proximate.grants.title_donor')}
        subtitle={
          isOb
            ? t('proximate.grants.subtitle_ob')
            : t('proximate.grants.subtitle_donor')
        }
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline me-2" />
            {t('proximate.grants.loading')}
          </p>
        )}
        {error != null && !loading && <LoadError error={error} onRetry={load} />}

        {!loading && error == null && (
          <div className="space-y-4">
            {/* Rollup — compact stat row (Stage 4): summary strip, not
                oversized cards, matching the partners register. */}
            {grants.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="prox-stat">
                  <div className="lab"><DollarSign className="w-3.5 h-3.5" /> {t('proximate.grants.committed')}</div>
                  <div className="val prox-num">{fmtUsd(totalCommitted)}</div>
                  <div className="meta">{t('proximate.grants.across_n', { n: grants.length })}</div>
                </div>
                <div className="prox-stat">
                  <div className="lab"><DollarSign className="w-3.5 h-3.5" /> {t('proximate.grants.allocated_to_rounds')}</div>
                  <div className="val prox-num">{fmtUsd(totalAllocated)}</div>
                  <div className="meta">
                    {totalCommitted
                      ? t('proximate.grants.pct_of_committed', { pct: ((totalAllocated / totalCommitted) * 100).toFixed(0) })
                      : ''}
                  </div>
                </div>
                <div className="prox-stat">
                  <div className="lab"><DollarSign className="w-3.5 h-3.5" /> {t('proximate.grants.uncommitted')}</div>
                  <div className="val prox-num">{fmtUsd(totalRemaining)}</div>
                  <div className="meta">{t('proximate.grants.available_future')}</div>
                </div>
              </div>
            )}

            {/* Grant list */}
            <div className="prox-panel overflow-hidden">
              <div className="prox-phead">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
                  {t('proximate.grants.register_n', { n: grants.length })}
                </h2>
                {isOb && (
                  <Link
                    href="/proximate/admin/grants/new"
                    className="prox-btn ghost"
                    style={{ height: 32, fontSize: 12.5, padding: '0 12px' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('proximate.grants.upload_agreement')}
                  </Link>
                )}
              </div>
              {grants.length === 0 && (
                <div style={{ padding: '18px' }}>
                  <EmptyState
                    compact
                    icon={FileText}
                    title={t('proximate.grants.empty_title')}
                    hint={isOb
                      ? t('proximate.grants.empty_hint_ob')
                      : t('proximate.grants.empty_hint_donor')}
                  />
                </div>
              )}
              {grants.map((g, i) => {
                const pctAllocated =
                  g.amount_committed_usd
                    ? Math.min(100, (g.amount_allocated_usd / g.amount_committed_usd) * 100)
                    : 0;
                return (
                  <Link
                    key={g.id}
                    href={`/proximate/admin/grants/${g.id}`}
                    className="block hover:bg-[color:var(--prox-surface-2)] transition-colors"
                    style={{ padding: '14px 18px', borderTop: i === 0 ? undefined : '1px solid var(--prox-line)' }}
                  >
                    <div className="flex items-start justify-between flex-wrap gap-2" style={{ marginBottom: 11 }}>
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontSize: 14, fontWeight: 700 }}>
                          {g.title}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--prox-muted)' }}>
                          {g.donor_name || t('proximate.grants.donor_tbd')}
                          {g.donor_grant_ref
                            ? ` · ${t('proximate.grants.ref')} ${g.donor_grant_ref}`
                            : ''}
                        </p>
                      </div>
                      <span className={`prox-pill ${grantPill(g.status)}`}>
                        {labelForProximateStatus(g.status, t)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <div className="prox-eyebrow">{t('proximate.grants.committed')}</div>
                        <div className="prox-mono" style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{fmtUsd(g.amount_committed_usd)}</div>
                      </div>
                      <div>
                        <div className="prox-eyebrow">{t('proximate.grants.allocated')}</div>
                        <div className="prox-mono" style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{fmtUsd(g.amount_allocated_usd)}</div>
                      </div>
                      <div>
                        <div className="prox-eyebrow">{t('proximate.grants.remaining')}</div>
                        <div className="prox-mono" style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{fmtUsd(g.amount_remaining_usd)}</div>
                      </div>
                      <div>
                        <div className="prox-eyebrow">{t('proximate.grants.period')}</div>
                        <div className="prox-mono" style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                          {g.start_date
                            ? new Date(g.start_date).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
                            : '—'}
                          {' – '}
                          {g.end_date
                            ? new Date(g.end_date).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
                            : '—'}
                        </div>
                      </div>
                    </div>
                    {g.amount_committed_usd && (
                      <div className="prox-bar" style={{ marginTop: 11 }}>
                        <i style={{ width: `${pctAllocated}%` }} />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
