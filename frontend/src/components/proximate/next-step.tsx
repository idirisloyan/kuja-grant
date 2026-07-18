'use client';

/**
 * Proximate "what happens next" — Phase 717.
 *
 * One shared next-action resolver rendered as a compact guidance strip.
 * Instead of scattering bespoke "what do I do now?" copy across every
 * page, each surface asks the resolver for its entity's current step and
 * renders a single consistent strip. Also powers the round task board.
 */

import Link from 'next/link';
import { ArrowRight, Circle, CheckCircle2, Dot, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

/** t() returns the key itself when a translation is missing (truthy), so
 *  `t(k) || fallback` never fires. This guard returns the English fallback
 *  whenever the key is absent in the active locale. */
function useTx() {
  const { t } = useTranslation();
  return (key: string, fallback: string, params?: Record<string, string | number>) => {
    const v = t(key, params);
    return !v || v === key ? fallback : v;
  };
}

export interface NextStepInfo {
  /** Short imperative label, e.g. "Collect a second signature". */
  label: string;
  /** Optional deep link for the primary action. */
  href?: string;
  /** Optional CTA text for the link. */
  cta?: string;
  /** done = nothing left to do (terminal state). */
  tone?: 'action' | 'waiting' | 'done';
}

export function NextStep({ info }: { info: NextStepInfo | null }) {
  if (!info) return null;
  const tone = info.tone || 'action';
  const styles = {
    action: 'border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300',
    waiting: 'border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300',
    done: 'border-border bg-muted/40 text-muted-foreground',
  }[tone];
  return (
    <div className={`rounded-lg border px-3 py-2.5 flex items-center gap-2.5 text-sm ${styles}`}>
      {tone === 'done'
        ? <CheckCircle2 className="w-4 h-4 shrink-0" />
        : <ArrowRight className="w-4 h-4 shrink-0" />}
      <span className="font-medium flex-1">{info.label}</span>
      {info.href && (
        <Link
          href={info.href}
          className="text-xs font-semibold underline underline-offset-2 hover:no-underline shrink-0"
        >
          {info.cta || 'Go'} →
        </Link>
      )}
    </div>
  );
}

// ---- Resolvers -------------------------------------------------------

export function roundNextStep(round: {
  status?: string; id?: number;
  signed_count?: number; signatures?: unknown[];
}): NextStepInfo | null {
  switch (round?.status) {
    case 'draft':
      return { label: 'Submit this round for signature review.', tone: 'action' };
    case 'in_review': {
      const n = round.signed_count
        ?? (Array.isArray(round.signatures) ? round.signatures.length : 0);
      return {
        label: `Awaiting Oversight Body signatures (${n}/2). It activates automatically once two sign with no rejection.`,
        tone: 'waiting',
      };
    }
    case 'active':
      return {
        label: 'Round is active — add partners and record disbursements.',
        href: '/proximate/disbursements/new',
        cta: 'New disbursement',
        tone: 'action',
      };
    case 'closed':
      return { label: 'Round is closed. Download the end-of-round report for donors.', tone: 'done' };
    case 'cancelled':
      return { label: 'Round was cancelled.', tone: 'done' };
    default:
      return null;
  }
}

export function disbursementNextStep(d: {
  status?: string;
  cosigners_required?: number;
  verifier_verdict?: string | null;
}): NextStepInfo | null {
  switch (d?.status) {
    case 'pending_cosign':
      return {
        label: `Waiting on ${d.cosigners_required || 1} co-signature(s) before funds can move. A different OB member must cosign.`,
        tone: 'waiting',
      };
    case 'pending_report':
      return {
        label: 'Funds released — share the report link with the partner and await their SoP-12 report.',
        tone: 'waiting',
      };
    case 'reported':
      return d.verifier_verdict === 'confirmed'
        ? { label: 'Report verified and independently confirmed. Verify or flag to close it out.', tone: 'action' }
        : { label: 'Report received — verify/flag it, and assign an independent verifier.', tone: 'action' };
    case 'verified':
      return { label: 'Verified. A 90-day outcome attestation obligation is now tracked.', tone: 'done' };
    case 'flagged':
      // QA-18 item 6: flagged guidance must read as a warning (amber),
      // never the green action treatment.
      return { label: 'Flagged — follow-up required. Resolve the issue with the partner, then mark the report verified to resume the normal flow.', tone: 'waiting' };
    default:
      return null;
  }
}

// ---- Round task board ------------------------------------------------

const ROUND_STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'Sign' },
  { key: 'active', label: 'Activate' },
  { key: 'disburse', label: 'Disburse' },
  { key: 'report', label: 'Report' },
  { key: 'verify', label: 'Verify' },
  { key: 'closed', label: 'Close' },
];

/** Maps a round + its disbursements to the furthest-reached board step. */
export function roundBoardActiveIndex(round: { status?: string },
                                      disbursements?: Array<{ status?: string }>): number {
  const st = round?.status;
  if (st === 'draft') return 0;
  if (st === 'in_review') return 1;
  if (st === 'closed') return 6;
  if (st === 'cancelled') return 1;
  // active — infer progress from disbursements
  const ds = disbursements || [];
  if (ds.some((d) => ['reported', 'verified', 'flagged'].includes(d.status || ''))) {
    if (ds.some((d) => d.status === 'verified')) return 5;
    return 4;
  }
  if (ds.length > 0) return 3;
  return 2;
}

export function RoundTaskBoard({ round, disbursements }: {
  round: { status?: string };
  disbursements?: Array<{ status?: string }>;
}) {
  const active = roundBoardActiveIndex(round, disbursements);
  const cancelled = round?.status === 'cancelled';
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-1" role="list" aria-label="Round progress">
      {ROUND_STEPS.map((s, i) => {
        const done = i < active;
        const current = i === active && !cancelled;
        return (
          <div key={s.key} className="flex items-center shrink-0" role="listitem">
            <div className="flex flex-col items-center gap-1 min-w-[64px]">
              {done ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : current ? (
                <Circle className="w-5 h-5 text-emerald-600 fill-emerald-100 dark:fill-emerald-950" />
              ) : (
                <Dot className="w-5 h-5 text-muted-foreground/40" />
              )}
              <span className={`text-[11px] ${current ? 'font-semibold text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                {s.label}
              </span>
            </div>
            {i < ROUND_STEPS.length - 1 && (
              <div className={`h-0.5 w-5 sm:w-8 ${i < active ? 'bg-emerald-400' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Partner journey -------------------------------------------------

const PARTNER_STEPS = [
  { key: 'nominate', label: 'Nominated' },
  { key: 'endorsed', label: 'Endorsed' },
  { key: 'cleared', label: 'Cleared' },
  { key: 'funded', label: 'Funded' },
  { key: 'reported', label: 'Reported' },
  { key: 'verified', label: 'Verified' },
];

export function partnerJourneyIndex(status?: string, opts?: {
  funded?: boolean; reported?: boolean; verified?: boolean;
}): number {
  let i = 0;
  if (status === 'dd_pending') i = 1;
  else if (status === 'dd_clear') i = 2;
  else if (status === 'suspended' || status === 'dd_failed') i = 1;
  // Advance past "Cleared" only from real downstream signals.
  if (opts?.verified) i = Math.max(i, 5);
  else if (opts?.reported) i = Math.max(i, 4);
  else if (opts?.funded) i = Math.max(i, 3);
  return i;
}

export function PartnerJourney({ status, funded, reported, verified }: {
  status?: string; funded?: boolean; reported?: boolean; verified?: boolean;
}) {
  const tx = useTx();
  const active = partnerJourneyIndex(status, { funded, reported, verified });
  const suspended = status === 'suspended';
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-1" role="list" aria-label="Partner journey">
      {PARTNER_STEPS.map((s, i) => {
        const done = i < active;
        const current = i === active && !suspended;
        return (
          <div key={s.key} className="flex items-center shrink-0" role="listitem">
            <div className="flex flex-col items-center gap-1 min-w-[64px]">
              {done ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : current ? (
                <Circle className="w-5 h-5 text-emerald-600 fill-emerald-100 dark:fill-emerald-950" />
              ) : (
                <Dot className="w-5 h-5 text-muted-foreground/40" />
              )}
              <span className={`text-[11px] ${current ? 'font-semibold text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                {tx(`proximate.journey.${s.key}`, s.label)}
              </span>
            </div>
            {i < PARTNER_STEPS.length - 1 && (
              <div className={`h-0.5 w-5 sm:w-8 ${i < active ? 'bg-emerald-400' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Why blocked? ----------------------------------------------------

export interface Blocker {
  code: string;
  message: string;
  href?: string;
  /** Phase 717 #3 — drives a precise, localized "fix this now" CTA
   *  (e.g. add_route → "Add a payment route"). */
  cta_code?: string;
}

/** Renders the "why blocked?" preconditions: red = hard blocker, amber =
 *  advisory warning. Message + CTA localize by code (English `message` is
 *  the fallback). Nothing renders when both lists are empty. */
export function WhyBlocked({ blockers = [], warnings = [] }: {
  blockers?: Blocker[]; warnings?: Blocker[];
}) {
  const tx = useTx();
  if (blockers.length === 0 && warnings.length === 0) return null;
  const Row = ({ b, tone }: { b: Blocker; tone: 'block' | 'warn' }) => {
    const styles = tone === 'block'
      ? 'text-red-700 dark:text-red-400'
      : 'text-amber-700 dark:text-amber-400';
    const ctaLabel = b.cta_code
      ? tx(`proximate.why.cta.${b.cta_code}`, 'Fix it')
      : tx('proximate.why.cta.fix', 'Fix it');
    return (
      <li className="flex items-start gap-2 text-sm">
        {tone === 'block'
          ? <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${styles}`} />
          : <Info className={`w-4 h-4 shrink-0 mt-0.5 ${styles}`} />}
        <span className="flex-1">
          {tx(`proximate.why.msg.${b.code}`, b.message)}
          {b.href && (
            <>
              {' '}
              <Link href={b.href} className="underline underline-offset-2 hover:no-underline font-medium">
                {ctaLabel} →
              </Link>
            </>
          )}
        </span>
      </li>
    );
  };
  const hard = blockers.length > 0;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${hard
      ? 'border-red-400/50 bg-red-50/60 dark:bg-red-950/20'
      : 'border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${hard
        ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
        {hard ? tx('proximate.why.title.blocked', "Can't proceed yet")
              : tx('proximate.why.title.warn', 'Before you continue')}
      </p>
      <ul className="space-y-1.5">
        {blockers.map((b) => <Row key={b.code} b={b} tone="block" />)}
        {warnings.map((b) => <Row key={b.code} b={b} tone="warn" />)}
      </ul>
    </div>
  );
}
