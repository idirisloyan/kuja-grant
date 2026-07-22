'use client';

/**
 * The money story: Committed → Allocated → Disbursed → Reported →
 * Verified (2026-07-21).
 *
 * Replaces the four-tile stat grid as the donor portal's primary
 * framing. The grid answered "what are the numbers"; a funder's actual
 * first question is "where is my money right now, and how far down the
 * assurance chain has it got". Four equal-weight tiles cannot express a
 * chain — they read as four unrelated facts, and reviewers consistently
 * mistook `disbursed` for "done".
 *
 * Stage definitions are taken from the server's own vocabulary so the
 * funnel can never disagree with the grant traceability endpoint:
 *
 *   Committed  sum of signed grant agreements (amount_committed_usd).
 *              Only knowable when a grant row exists — see below.
 *   Allocated  round envelopes (portfolio.envelope_usd).
 *   Disbursed  payments in pending_report | reported | verified | flagged
 *              — i.e. money that has actually left, which is exactly the
 *              server's `disbursed_usd`.
 *   Reported   payments in reported | verified | flagged — matches
 *              `report_submitted` in /grants/<id>/traceability.
 *   Verified   payments in verified only.
 *
 * Honesty rules baked in:
 *  - Committed renders "not recorded" (never $0, never silently equal to
 *    Allocated) when no grant agreement is on file. $0 committed would
 *    read as "this donor gave nothing".
 *  - A stage is never shown as a percentage of a zero-denominator stage.
 *  - Flagged money is counted inside Reported, because a flagged payment
 *    DID come with a report. It is called out separately rather than
 *    quietly folded away.
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { useTranslation } from '@/lib/hooks/use-translation';
import { DonorExplainer, type ExplainerTerm } from '@/components/proximate/donor-explainer';

export interface FunnelRoundInput {
  envelope_usd: number;
  disbursed_usd: number;
  status_totals_usd: Record<string, number>;
}

export interface MoneyFunnelTotals {
  /** null when no grant agreement is on file — rendered as "not recorded". */
  committed_usd: number | null;
  allocated_usd: number;
  disbursed_usd: number;
  reported_usd: number;
  verified_usd: number;
}

/** Statuses whose money has physically left the account. Mirrors
 *  `moved_states` in proximate_routes.py. */
const MOVED = ['pending_report', 'reported', 'verified', 'flagged'];
/** Statuses where the partner has filed their SoP-12 report. */
const REPORTED = ['reported', 'verified', 'flagged'];

export function computeFunnelTotals(
  rounds: FunnelRoundInput[],
  committedUsd: number | null,
): MoneyFunnelTotals {
  let allocated = 0;
  let disbursed = 0;
  let reported = 0;
  let verified = 0;
  for (const r of rounds) {
    allocated += r.envelope_usd || 0;
    const totals = r.status_totals_usd || {};
    // Recompute disbursed from status_totals rather than trusting
    // `disbursed_usd`, so all four stages come from one source and a
    // future status added server-side can't make the bars inconsistent.
    for (const s of MOVED) disbursed += totals[s] || 0;
    for (const s of REPORTED) reported += totals[s] || 0;
    verified += totals.verified || 0;
  }
  return {
    committed_usd: committedUsd,
    allocated_usd: allocated,
    disbursed_usd: disbursed,
    reported_usd: reported,
    verified_usd: verified,
  };
}

function usd(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

interface Stage {
  key: ExplainerTerm;
  value: number | null;
  /** Denominator for the "x% of <stage>" sub-line; null = don't show one. */
  prev: { key: string; value: number } | null;
}

export function DonorMoneyFunnel({
  totals,
  flaggedCount = 0,
  className = '',
}: {
  totals: MoneyFunnelTotals;
  flaggedCount?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const [showDetail, setShowDetail] = useState(false);

  const {
    committed_usd, allocated_usd, disbursed_usd, reported_usd, verified_usd,
  } = totals;

  const stages: Stage[] = [
    { key: 'committed', value: committed_usd, prev: null },
    {
      key: 'allocated',
      value: allocated_usd,
      prev: committed_usd != null && committed_usd > 0
        ? { key: 'committed', value: committed_usd }
        : null,
    },
    {
      key: 'disbursed',
      value: disbursed_usd,
      prev: allocated_usd > 0 ? { key: 'allocated', value: allocated_usd } : null,
    },
    {
      key: 'reported',
      value: reported_usd,
      prev: disbursed_usd > 0 ? { key: 'disbursed', value: disbursed_usd } : null,
    },
    {
      key: 'verified',
      value: verified_usd,
      prev: reported_usd > 0 ? { key: 'reported', value: reported_usd } : null,
    },
  ];

  // Bar scale: the widest KNOWN stage. Using committed when it is absent
  // would leave every bar unscaled; using a fixed max would make a small
  // portfolio look empty.
  const scale = Math.max(
    committed_usd ?? 0, allocated_usd, disbursed_usd, reported_usd, verified_usd, 1,
  );

  return (
    <Card className={`p-4 sm:p-5 space-y-4 ${className}`}>
      <div>
        <h2 className="text-lg kuja-display">
          {t('proximate.donor.funnel.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('proximate.donor.funnel.subtitle')}
        </p>
      </div>

      <ol className="space-y-3">
        {stages.map((s) => {
          const known = s.value != null;
          const width = known ? Math.max((s.value! / scale) * 100, s.value! > 0 ? 2 : 0) : 0;
          const share = s.prev && s.prev.value > 0 && known
            ? Math.round((s.value! / s.prev.value) * 100)
            : null;
          return (
            <li key={s.key}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-sm font-medium inline-flex items-center gap-1">
                  {t(`proximate.donor.funnel.stage.${s.key}`)}
                  <DonorExplainer term={s.key} />
                </span>
                <span className="text-lg font-medium tabular-nums">
                  {known ? usd(s.value!) : (
                    <span className="text-base text-muted-foreground font-normal">
                      {t('proximate.donor.funnel.not_recorded')}
                    </span>
                  )}
                </span>
              </div>
              <div
                className="h-2 rounded-full bg-muted overflow-hidden mt-1.5"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-[hsl(var(--kuja-clay))] transition-all"
                  style={{ width: `${width}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {!known
                  ? t('proximate.donor.funnel.committed_unknown_note')
                  : share != null
                    ? t('proximate.donor.funnel.of_stage', {
                        pct: share,
                        stage: t(`proximate.donor.funnel.stage.${s.prev!.key}`),
                      })
                    : s.value === 0
                      ? t('proximate.donor.funnel.nothing_yet')
                      : ''}
              </p>
            </li>
          );
        })}
      </ol>

      {flaggedCount > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 inline-flex items-start gap-1">
          <span>
            {t('proximate.donor.funnel.flagged_note', { count: flaggedCount })}
          </span>
          <DonorExplainer term="flagged" />
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        aria-expanded={showDetail}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        {showDetail
          ? t('proximate.donor.funnel.hide_figures')
          : t('proximate.donor.funnel.show_figures')}
      </button>
      {/* The detail block is what remains of the old stat grid — every
          number it used to show is still reachable, one click down. */}
      {showDetail && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <dl className="grid gap-2 sm:grid-cols-2 text-xs">
            {stages.map((s) => (
              <div key={s.key} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  {t(`proximate.donor.funnel.stage.${s.key}`)}
                </dt>
                <dd className="tabular-nums">
                  {s.value == null
                    ? t('proximate.donor.funnel.not_recorded')
                    : usd(s.value)}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {t('proximate.donor.funnel.undisbursed')}
              </dt>
              <dd className="tabular-nums">
                {usd(Math.max(allocated_usd - disbursed_usd, 0))}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {t('proximate.donor.funnel.awaiting_report')}
              </dt>
              <dd className="tabular-nums">
                {usd(Math.max(disbursed_usd - reported_usd, 0))}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}
