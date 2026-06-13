'use client';

/**
 * FundTree — Network → Fund → Window hierarchy view.
 *
 * Replaces the flat 4-tile metric row on the NEAR operator console
 * with the actual organising structure of the network: Funds contain
 * Windows, Windows contain Grants and Declarations. Scales from
 * 1 fund (NEAR today) to N funds without restructuring the page.
 *
 * Levels:
 *   Fund        — collapsible card, shows currency + status + window count
 *   └─ Window   — child card with live stats (declarations, grants,
 *                 NGOs reached, countries, SLA pulse), Reports + Rubric
 *                 buttons, link to the full window report
 *
 * Per-window stats come from WindowReportService — one call per window
 * the user expands. Cached by SWR so re-expand doesn't refetch.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Coins, ChevronDown, ChevronRight, Sparkles, BarChart3,
  Users, Globe, Siren, Lock, Loader2, Plus,
} from 'lucide-react';
import { useFunds, useFund, useWindowReport, type Fund, type FundWindow } from '@/lib/hooks/use-api';

export function FundTree({ onCreateFund }: { onCreateFund?: () => void }) {
  const { data, isLoading } = useFunds();
  const funds = data?.funds ?? [];
  const [openFundIds, setOpenFundIds] = useState<Set<number>>(() => new Set());

  function toggleFund(id: number) {
    setOpenFundIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => <div key={i} className="kuja-shimmer h-20 rounded" />)}
      </div>
    );
  }

  if (funds.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-card p-10 text-center text-sm text-muted-foreground">
        <Coins className="w-8 h-8 mx-auto mb-2 opacity-50" />
        No funds yet.{' '}
        {onCreateFund && (
          <button
            type="button"
            onClick={onCreateFund}
            className="underline hover:no-underline"
          >
            Create the first fund
          </button>
        )}
        .
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {funds.map((fund) => (
        <FundCard
          key={fund.id}
          fund={fund}
          isOpen={openFundIds.has(fund.id) || funds.length === 1 /* auto-open single-fund view */}
          onToggle={() => toggleFund(fund.id)}
        />
      ))}
    </div>
  );
}

function FundCard({ fund, isOpen, onToggle }: {
  fund: Fund;
  isOpen: boolean;
  onToggle: () => void;
}) {
  // Pull the fund detail (which includes windows) only when expanded
  const { data: detail } = useFund(isOpen ? fund.id : null);
  const fullFund = detail?.fund ?? fund;
  const windows = fullFund.windows ?? [];

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <Coins className="w-5 h-5 text-[hsl(var(--kuja-clay))] shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-base truncate">{fund.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span>{fund.slug}</span>
              <span>·</span>
              <span>{fund.currency}</span>
              <span>·</span>
              <span>{fund.window_count} window{fund.window_count !== 1 ? 's' : ''}</span>
              {fund.total_pool_amount != null && (
                <>
                  <span>·</span>
                  <span>pool {fund.total_pool_amount.toLocaleString()}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
          {fund.status}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border bg-muted/15 p-4 space-y-2">
          {windows.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No windows under this fund yet.{' '}
              <Link
                href="/admin/funds"
                className="text-[hsl(var(--kuja-clay))] hover:underline"
              >
                Manage in funds admin →
              </Link>
            </div>
          ) : (
            windows.map((window) => (
              <WindowSummaryCard key={window.id} window={window} fund={fullFund} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function WindowSummaryCard({ window: w, fund }: { window: FundWindow; fund: Fund }) {
  const { data: report } = useWindowReport(w.id);
  const stats = report?.stats;
  const declarations = report?.declarations ?? [];

  // Per-status declaration counts
  const declActive = declarations.filter((d) => d.status === 'signed_active').length;
  const declInReview = declarations.filter((d) => d.status === 'in_review').length;
  const declDraft = declarations.filter((d) => d.status === 'draft').length;

  // SLA pulse: percentage of 72h app window hits
  const sla72Total = (report?.sla.app_window_hits ?? 0) + (report?.sla.app_window_misses ?? 0);
  const slaHit = sla72Total > 0
    ? Math.round(100 * (report?.sla.app_window_hits ?? 0) / sla72Total)
    : null;
  const slaTone =
    slaHit == null ? 'muted'
    : slaHit >= 90 ? 'good'
    : slaHit >= 70 ? 'warn'
    : 'bad';

  return (
    <div className="border border-border rounded-md bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-sm">{w.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{w.status}</span>
            {w.crisis_type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--kuja-clay))]/10 text-[hsl(var(--kuja-clay))] capitalize">
                {w.crisis_type.replace('_', ' ')}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            {w.application_window_hours && <span>{w.application_window_hours}h window</span>}
            {w.decision_sla_days && <><span>·</span><span>{w.decision_sla_days}d decision SLA</span></>}
            {w.direct_to_community_single_min_pct && (
              <>
                <span>·</span>
                <span className="text-[hsl(var(--kuja-grow))] inline-flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5" />
                  ≥{w.direct_to_community_single_min_pct}% direct
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Link
            href={`/admin/windows/${w.id}/report/`}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted/40"
          >
            <BarChart3 className="w-3 h-3" /> Report
          </Link>
        </div>
      </div>

      {/* Stats row */}
      {report ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-border text-xs">
          <Stat
            label="Declarations"
            value={`${declActive}`}
            sub={
              declInReview > 0
                ? `${declInReview} in signature`
                : declDraft > 0
                ? `${declDraft} draft`
                : 'no draft'
            }
            tone={declInReview > 0 ? 'warn' : declActive > 0 ? 'good' : 'muted'}
            icon={<Siren className="w-3 h-3" />}
          />
          <Stat
            label="Grants"
            value={`${stats?.grants_total ?? 0}`}
            sub={
              stats?.total_disbursed_estimate
                ? `~${stats.total_disbursed_estimate.toLocaleString()} ${fund.currency}`
                : 'no disbursed'
            }
            tone="muted"
            icon={<Coins className="w-3 h-3" />}
          />
          <Stat
            label="NGOs"
            value={`${stats?.ngos_reached ?? 0}`}
            sub={stats?.ngos_reached ? 'reached' : 'no NGOs yet'}
            tone="muted"
            icon={<Users className="w-3 h-3" />}
          />
          <Stat
            label="Countries"
            value={`${stats?.countries_count ?? 0}`}
            sub={
              stats?.countries_covered && stats.countries_covered.length > 0
                ? stats.countries_covered.slice(0, 3).join(', ')
                : 'none'
            }
            tone="muted"
            icon={<Globe className="w-3 h-3" />}
          />
          <Stat
            label="72h hit rate"
            value={slaHit != null ? `${slaHit}%` : '—'}
            sub={
              sla72Total > 0
                ? `${report?.sla.app_window_hits}/${sla72Total}`
                : 'no data'
            }
            tone={slaTone}
            icon={<Sparkles className="w-3 h-3" />}
          />
        </div>
      ) : (
        <div className="kuja-shimmer h-12 rounded" />
      )}
    </div>
  );
}

function Stat({
  label, value, sub, tone, icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'good' | 'warn' | 'bad' | 'muted';
  icon: React.ReactNode;
}) {
  const valueCls =
    tone === 'good' ? 'text-[hsl(var(--kuja-grow))]'
    : tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]'
    : tone === 'bad' ? 'text-destructive'
    : 'text-foreground';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-base font-bold ${valueCls}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}
