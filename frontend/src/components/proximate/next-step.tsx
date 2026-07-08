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
import { ArrowRight, Circle, CheckCircle2, Dot } from 'lucide-react';

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
      return { label: 'Flagged. Follow the Plan-B route if this was a route failure.', tone: 'action' };
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
