'use client';

/**
 * /admin/windows/[id] — Phase 59 (June 2026).
 *
 * Per-window LIVE operational drill-in. Companion to the historical
 * report page at /admin/windows/[id]/report:
 *
 *   - This page = right now, what's in flight, what to do next
 *   - /report  = the historical snapshot bundle for compliance + audit
 *
 * Click-through target from the OpStat tiles on /admin/funds. Surfaces
 * the same operational rollup + top_risks the funds page teases,
 * plus live lists of:
 *   - Active declarations under this window
 *   - Open grants under this window
 *   - Reports due / overdue under this window's grants
 *
 * Each row links to its detail page so the operator can act
 * immediately. No card sprawl — the page leads with attention
 * (top_risks) and gives one section per work-type below.
 */

import Link from 'next/link';
import { useState } from 'react';
import {
  useDeclarations, useGrants, useReports, useWindowOperational,
} from '@/lib/hooks/use-api';
import { useRouteId } from '@/lib/hooks/use-route-id';
import { useAuthStore } from '@/stores/auth-store';
import {
  PageShell, PageBack, PageHeader, PageAttention, PageMain,
  PageDetail, PageDetailSection,
  type AttentionItem,
} from '@/components/layout/page-shell';
import {
  Wallet, Siren, Briefcase, BarChart3, FileSpreadsheet, Archive,
  ChevronRight, Clock, Sparkles,
} from 'lucide-react';
import {
  describeDeclarationStatus, describeGrantStatus, describeReportStatus,
  TONE_PILL_CLASS,
} from '@/lib/status-copy';

interface ReportRow {
  id: number;
  grant_id: number;
  grant_title?: string | null;
  title?: string;
  status: string;
  due_date?: string | null;
  org_name?: string | null;
}

interface GrantRow {
  id: number;
  fund_window_id?: number | null;
  title: string;
  status: string;
  total_funding?: number | null;
  currency?: string | null;
  deadline?: string | null;
}

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function WindowOperationalClient() {
  const windowId = useRouteId('windows');
  const viewer = useAuthStore((s) => s.user);
  // Phase 60 — operator can toggle AI-narrated risks. Default off so the
  // first paint is instant + free; flipping it on swaps to specifics.
  const [narrate, setNarrate] = useState(false);
  const { data: ops, isLoading: opsLoading } = useWindowOperational(windowId, { narrate });
  const { data: declsAll } = useDeclarations();
  const { data: grantsAll } = useGrants();
  const { data: reportsAll } = useReports();

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">Only admins can view window operations.</p>
      </div>
    );
  }

  if (windowId == null || opsLoading || !ops) {
    return (
      <div className="space-y-3">
        <div className="kuja-shimmer h-10 w-72 rounded" />
        <div className="kuja-shimmer h-32 rounded" />
        <div className="kuja-shimmer h-48 rounded" />
      </div>
    );
  }

  // Client-side filter to this window
  const decls = (declsAll?.declarations ?? []).filter((d) => d.window_id === windowId);
  const activeDecls = decls.filter((d) =>
    ['in_review', 'signed_active'].includes(d.status),
  );
  const draftDecls = decls.filter((d) => d.status === 'draft');

  const grants = ((grantsAll?.grants ?? []) as GrantRow[])
    .filter((g) => g.fund_window_id === windowId);
  const openGrants = grants.filter((g) => g.status === 'open');

  const reports = ((reportsAll?.reports ?? []) as ReportRow[])
    .filter((r) => grants.some((g) => g.id === r.grant_id));
  const dueOrOverdueReports = reports.filter((r) => {
    if (!['draft', 'pending'].includes(r.status)) return false;
    const days = daysUntil(r.due_date);
    return days !== null && days <= 30;
  });

  // Attention strip — derived from top_risks + draft declarations
  const attention: AttentionItem[] = (ops.top_risks ?? []).map((r) => ({
    tone: r.severity === 'high' ? 'bad' : r.severity === 'medium' ? 'warn' : 'muted',
    label: r.label,
    hint: r.hint ?? undefined,
  }));
  if (draftDecls.length > 0) {
    attention.push({
      tone: 'muted',
      label: `${draftDecls.length} draft declaration${draftDecls.length === 1 ? '' : 's'} not yet submitted`,
      hint: 'Add committee members and submit for signature when ready.',
    });
  }

  return (
    <PageShell>
      <PageBack href="/admin/funds" label="Back to Funds &amp; Windows" />

      <PageHeader
        title={`Window #${windowId} — operations`}
        icon={Wallet}
        subtitle={
          `${ops.available_budget != null ? `${ops.available_budget.toLocaleString()} ${ops.currency ?? ''} available · ` : ''}` +
          `${ops.active_declaration_count} active declaration${ops.active_declaration_count === 1 ? '' : 's'} · ` +
          `${ops.open_grant_count} open grant${ops.open_grant_count === 1 ? '' : 's'}`
        }
        primaryAction={
          <Link
            href={`/admin/windows/${windowId}/report`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
          >
            <FileSpreadsheet className="w-3 h-3" /> Full report &amp; CSV
          </Link>
        }
      />

      {/* Phase 60 — optional AI narration of the risks. Opt-in so the
          first paint is the deterministic rule-based view; flipping the
          toggle re-fetches with ?narrate=true and AI rewrites each
          risk's label + hint to cite the specific declarations involved. */}
      {attention.length > 0 && (
        <div className="flex items-center justify-between gap-3 -mb-2">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
            What needs your attention
          </div>
          <button
            type="button"
            onClick={() => setNarrate((v) => !v)}
            className={
              `inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-colors ` +
              (narrate
                ? 'border-[hsl(var(--kuja-spark))] bg-[hsl(var(--kuja-spark))]/10 text-[hsl(var(--kuja-spark))]'
                : 'border-border text-muted-foreground hover:bg-muted')
            }
            title={narrate
              ? 'AI is rewriting each risk to cite specific declarations. Click to switch back to deterministic labels.'
              : 'Ask Claude to rewrite each risk with specific declaration names. ~2s.'}
          >
            <Sparkles className="w-3 h-3" />
            {narrate
              ? (ops?.narration_ok === false ? 'AI offline — rule labels' : 'AI-narrated')
              : 'Plain risks'}
          </button>
        </div>
      )}

      <PageAttention items={attention} />

      <PageMain>
        {/* Active declarations */}
        <section className="border border-border rounded-lg bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Siren className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
              Active declarations
            </h2>
            {/* Phase 65 — scope the deep-link to this window so the user
                lands on a filtered list, not the full declarations log. */}
            <Link
              href={`/admin/declarations?window_id=${windowId}`}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              See all in this window <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {activeDecls.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No declarations in review or active right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeDecls.slice(0, 5).map((d) => {
                const sc = describeDeclarationStatus(d);
                return (
                  <li key={d.id} className="text-xs">
                    <Link
                      href={`/admin/declarations/${d.id}`}
                      className="flex items-center justify-between gap-3 border border-border rounded-md p-3 hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{d.title}</div>
                        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          {d.country && <span>{d.country}</span>}
                          {d.severity && <span>severity: {d.severity}</span>}
                          {d.proposed_total_amount && (
                            <span>· {d.proposed_total_amount.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${TONE_PILL_CLASS[sc.tone]}`}>
                        {sc.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Open grants */}
        {openGrants.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Open grants
              </h2>
              {/* Phase 66 — scope the deep-link to this window. */}
              <Link
                href={`/grants?window_id=${windowId}`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                See all in this window <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {openGrants.slice(0, 5).map((g) => {
                const sc = describeGrantStatus(g.status);
                return (
                  <li key={g.id} className="text-xs">
                    <Link
                      href={`/grants/${g.id}`}
                      className="flex items-center justify-between gap-3 border border-border rounded-md p-3 hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{g.title}</div>
                        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          {g.total_funding && (
                            <span>{g.total_funding.toLocaleString()} {g.currency || ''}</span>
                          )}
                          {g.deadline && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              closes {new Date(g.deadline).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${TONE_PILL_CLASS[sc.tone]}`}>
                        {sc.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Reports due / overdue */}
        {dueOrOverdueReports.length > 0 && (
          <section className="border border-border rounded-lg bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
                Reports due in the next 30 days
              </h2>
              <Link
                href="/reports"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Open Reports <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {dueOrOverdueReports.slice(0, 5).map((r) => {
                const sc = describeReportStatus(r.status);
                const days = daysUntil(r.due_date);
                const overdue = days !== null && days < 0;
                return (
                  <li key={r.id} className="text-xs">
                    <Link
                      href={`/reports/${r.id}`}
                      className="flex items-center justify-between gap-3 border border-border rounded-md p-3 hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">
                          {r.grant_title || r.title || `Report #${r.id}`}
                        </div>
                        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          {r.org_name && <span>{r.org_name}</span>}
                          {r.due_date && (
                            <span className={overdue ? 'text-destructive font-semibold' : ''}>
                              {overdue
                                ? `overdue by ${Math.abs(days!)} day${Math.abs(days!) === 1 ? '' : 's'}`
                                : days === 0
                                ? 'due today'
                                : `due in ${days} day${days === 1 ? '' : 's'}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${TONE_PILL_CLASS[sc.tone]}`}>
                        {sc.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </PageMain>

      {/* Supporting detail — link to the historical report bundle */}
      <PageDetail>
        <PageDetailSection
          title="Full report bundle (historical snapshot)"
          icon={Archive}
          defaultOpen={false}
        >
          <p className="text-xs text-muted-foreground mb-3">
            The historical report bundles SLA hit rates, signature methods,
            recusals, audit anchors, monitoring visits, and CSV/ZIP downloads
            for archival. Open the report page for full detail.
          </p>
          <Link
            href={`/admin/windows/${windowId}/report`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
          >
            Open the full report page <ChevronRight className="w-3 h-3" />
          </Link>
        </PageDetailSection>
      </PageDetail>
    </PageShell>
  );
}
