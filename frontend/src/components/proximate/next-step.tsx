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
  const toneStyle = {
    action: { borderColor: 'var(--prox-good)', background: 'var(--prox-good-tint)', color: 'var(--prox-good)' },
    waiting: { borderColor: 'var(--prox-warn)', background: 'var(--prox-warn-tint)', color: 'var(--prox-warn)' },
    done: { borderColor: 'var(--prox-line)', background: 'var(--prox-inset)', color: 'var(--prox-muted)' },
  }[tone];
  return (
    <div className="rounded-lg border px-3 py-2.5 flex items-center gap-2.5 text-sm" style={toneStyle}>
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
}, t: (key: string, params?: Record<string, string | number>) => string): NextStepInfo | null {
  switch (d?.status) {
    case 'pending_cosign':
      return {
        label: t('proximate.disbursement.next.pending_cosign', { n: d.cosigners_required || 1 }),
        tone: 'waiting',
      };
    case 'pending_report':
      return {
        label: t('proximate.disbursement.next.pending_report'),
        tone: 'waiting',
      };
    case 'reported':
      return d.verifier_verdict === 'confirmed'
        ? { label: t('proximate.disbursement.next.reported_confirmed'), tone: 'action' }
        : { label: t('proximate.disbursement.next.reported'), tone: 'action' };
    case 'verified':
      return { label: t('proximate.disbursement.next.verified'), tone: 'done' };
    case 'flagged':
      // QA-18 item 6: flagged guidance must read as a warning (amber),
      // never the green action treatment.
      return { label: t('proximate.disbursement.next.flagged'), tone: 'waiting' };
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
                <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--prox-good)' }} />
              ) : current ? (
                <Circle className="w-5 h-5" style={{ color: 'var(--prox-good)', fill: 'var(--prox-good-tint)' }} />
              ) : (
                <Dot className="w-5 h-5" style={{ color: 'var(--prox-line-2)' }} />
              )}
              <span className="text-[11px]" style={{ color: current ? 'var(--prox-ink)' : 'var(--prox-muted)', fontWeight: current ? 600 : undefined }}>
                {s.label}
              </span>
            </div>
            {i < ROUND_STEPS.length - 1 && (
              <div className="h-0.5 w-5 sm:w-8" style={{ background: i < active ? 'var(--prox-good)' : 'var(--prox-line)' }} />
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
                <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--prox-good)' }} />
              ) : current ? (
                <Circle className="w-5 h-5" style={{ color: 'var(--prox-good)', fill: 'var(--prox-good-tint)' }} />
              ) : (
                <Dot className="w-5 h-5" style={{ color: 'var(--prox-line-2)' }} />
              )}
              <span className="text-[11px]" style={{ color: current ? 'var(--prox-ink)' : 'var(--prox-muted)', fontWeight: current ? 600 : undefined }}>
                {tx(`proximate.journey.${s.key}`, s.label)}
              </span>
            </div>
            {i < PARTNER_STEPS.length - 1 && (
              <div className="h-0.5 w-5 sm:w-8" style={{ background: i < active ? 'var(--prox-good)' : 'var(--prox-line)' }} />
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
  /** 2026-07-21 — interpolation values for `proximate.why.msg.<code>`.
   *  Two preflight items (cosign_required, partner_not_cleared_status)
   *  used to bake their numbers/status into the English `message`, so
   *  no localized key could carry them and every locale fell through to
   *  English. Optional: items without placeholders send nothing. */
  params?: Record<string, string | number>;
  /** Machine names for the partner_not_cleared "still needs …" list.
   *  Localized fragment-by-fragment here, then joined — sending the
   *  English phrases was the bug. */
  missing_codes?: string[];
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
    const iconColor = tone === 'block' ? 'var(--prox-danger)' : 'var(--prox-warn)';
    const ctaLabel = b.cta_code
      ? tx(`proximate.why.cta.${b.cta_code}`, 'Fix it')
      : tx('proximate.why.cta.fix', 'Fix it');
    const params: Record<string, string | number> = { ...(b.params || {}) };
    // Money arrives as a raw number so the locale, not the server,
    // decides the formatting.
    if (typeof params.amount === 'number') {
      params.amount = `$${Math.round(params.amount).toLocaleString()}`;
    }
    if (b.missing_codes?.length) {
      params.missing = b.missing_codes
        .map((c) => tx(`proximate.why.missing.${c}`, c))
        .join(tx('proximate.why.missing_separator', ', '));
    }
    return (
      <li className="flex items-start gap-2 text-sm">
        {tone === 'block'
          ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: iconColor }} />
          : <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: iconColor }} />}
        <span className="flex-1">
          {tx(`proximate.why.msg.${b.code}`, b.message, params)}
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
    <div className="rounded-lg border px-3 py-2.5" style={hard
      ? { borderColor: 'var(--prox-danger)', background: 'var(--prox-danger-tint)' }
      : { borderColor: 'var(--prox-warn)', background: 'var(--prox-warn-tint)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: hard ? 'var(--prox-danger)' : 'var(--prox-warn)' }}>
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
