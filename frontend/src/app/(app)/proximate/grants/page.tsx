'use client';

/**
 * Proximate inbound-grants list — Phase 721.
 *
 * OB view: all Adeso's grants from institutional donors.
 * Donor view: only their own grants (scoped server-side).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Plus, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { TONE_CLASSES, toneForProximateStatus } from '@/components/proximate/status-badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

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
  const [error, setError] = useState<string | null>(null);
  const { persona } = useProximatePersona();
  const isOb = persona === 'ob' || persona === 'admin';

  useEffect(() => {
    let cancelled = false;
    api.get<{ success: boolean; grants: Grant[] }>('/api/proximate/grants')
      .then((r) => { if (!cancelled) setGrants(r.grants || []); })
      .catch(() => { if (!cancelled) setError('Failed to load grants.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totalCommitted = grants.reduce(
    (a, g) => a + (g.amount_committed_usd || 0), 0,
  );
  const totalAllocated = grants.reduce((a, g) => a + g.amount_allocated_usd, 0);
  const totalRemaining = grants.reduce((a, g) => a + g.amount_remaining_usd, 0);

  return (
    <PageShell>
      <PageHeader
        title={isOb ? 'Adeso grants (inbound)' : 'Your grants to Adeso'}
        subtitle={
          isOb
            ? 'Grants Adeso holds from institutional donors funding Proximate Fund'
            : 'Track how Adeso is deploying your commitment'
        }
      />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline me-2" />
            Loading grants…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && (
          <div className="space-y-4">
            {/* Rollup — three big numbers */}
            {grants.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Committed
                    </p>
                  </div>
                  <p className="text-3xl font-semibold">{fmtUsd(totalCommitted)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    across {grants.length} grant{grants.length === 1 ? '' : 's'}
                  </p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Allocated to rounds
                    </p>
                  </div>
                  <p className="text-3xl font-semibold">{fmtUsd(totalAllocated)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalCommitted
                      ? `${((totalAllocated / totalCommitted) * 100).toFixed(0)}% of committed`
                      : ''}
                  </p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Uncommitted
                    </p>
                  </div>
                  <p className="text-3xl font-semibold">{fmtUsd(totalRemaining)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    available for future rounds
                  </p>
                </Card>
              </div>
            )}

            {/* Grant list */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Grant register ({grants.length})
                  </p>
                </div>
                {isOb && (
                  <Link
                    href="/proximate/admin/grants/new"
                    className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  >
                    <Plus className="w-3 h-3" />
                    Upload signed agreement
                  </Link>
                )}
              </div>
              {grants.length === 0 && (
                <p className="text-sm text-muted-foreground italic py-6 text-center">
                  No grants recorded yet.
                  {isOb && ' Upload a signed agreement to get started.'}
                </p>
              )}
              {grants.length > 0 && (
                <ul className="space-y-2">
                  {grants.map((g) => {
                    const statusCls = TONE_CLASSES[toneForProximateStatus(g.status)];
                    const pctAllocated =
                      g.amount_committed_usd
                        ? Math.min(
                            100,
                            (g.amount_allocated_usd / g.amount_committed_usd) * 100,
                          )
                        : 0;
                    return (
                      <li
                        key={g.id}
                        className="border rounded-md p-3 hover:bg-muted/30 transition-colors"
                      >
                        <Link
                          href={`/proximate/admin/grants/${g.id}`}
                          className="block"
                        >
                          <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {g.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {g.donor_name || 'Donor TBD'}
                                {g.donor_grant_ref
                                  ? ` · Ref ${g.donor_grant_ref}`
                                  : ''}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${statusCls}`}
                            >
                              {labelForProximateStatus(g.status)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div>
                              <p className="text-[10px] uppercase text-muted-foreground">
                                Committed
                              </p>
                              <p className="font-mono">{fmtUsd(g.amount_committed_usd)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-muted-foreground">
                                Allocated
                              </p>
                              <p className="font-mono">{fmtUsd(g.amount_allocated_usd)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-muted-foreground">
                                Remaining
                              </p>
                              <p className="font-mono">{fmtUsd(g.amount_remaining_usd)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-muted-foreground">
                                Reporting
                              </p>
                              <p className="font-mono">{g.reporting_cadence}</p>
                            </div>
                          </div>
                          {g.amount_committed_usd && (
                            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${pctAllocated}%` }}
                              />
                            </div>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
