'use client';

/**
 * Donor-safe plain-language explainers (2026-07-21).
 *
 * A funder reading this portal is not an auditor. "Audit anchor",
 * "independent verifier attestation" and "outcome check" are precise
 * internally and either meaningless or alarming externally — donors have
 * read "pending" as "the money is missing".
 *
 * So every control the portal surfaces carries a short note saying what
 * that control actually proves AND what it does not prove. The
 * "does not prove" half is deliberate: overselling an anchor as an audit
 * is the failure mode that costs trust when someone eventually reads the
 * SoP. Wording describes the mechanism, never promises an outcome.
 *
 * Click, not hover: donors read this on phones, where a hover-only
 * tooltip is unreachable. The trigger toggles; Escape or an outside
 * click dismisses. `ui/tooltip` is hover-driven, hence the local
 * implementation rather than reusing it.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

/** Terms the donor portal is allowed to explain. Keeping this a closed
 *  union means a typo produces a type error rather than a silently
 *  empty bubble at runtime. */
export type ExplainerTerm =
  | 'committed'
  | 'allocated'
  | 'disbursed'
  | 'reported'
  | 'verified'
  | 'audit_anchor'
  | 'verifier_attestation'
  | 'outcome_check'
  | 'flagged'
  | 'assurance_pack';

export function DonorExplainer({
  term,
  className = '',
}: {
  term: ExplainerTerm;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();
  // Horizontal nudge, in px, that keeps the bubble on screen. Anchoring
  // alone is not enough: a trigger near the inline-end edge pushes a
  // 320px bubble off a 390px phone entirely (measured at 390px: bubble
  // ran to x=629 with the viewport ending at 390 — unreadable). Measured
  // rather than guessed, so it holds in RTL and at any trigger position.
  const [shift, setShift] = useState(0);

  // Layout effect so the correction lands before paint — with useEffect
  // the bubble visibly jumps. Never runs during prerender: `open` starts
  // false and only a click can set it.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const el = bubbleRef.current;
    if (!el) return;
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    // Measured with shift still 0, so this reads the natural position.
    const r = el.getBoundingClientRect();
    let dx = 0;
    if (r.right > vw - margin) dx = vw - margin - r.right;
    // Overflow on the other edge wins: a bubble pushed off the start is
    // no more readable than one pushed off the end.
    if (r.left + dx < margin) dx = margin - r.left;
    if (dx) setShift(dx);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const title = t(`proximate.donor.explain.${term}.title`);
  const body = t(`proximate.donor.explain.${term}.body`);

  return (
    <span ref={wrapRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? bubbleId : undefined}
        aria-label={t('proximate.donor.explain.aria_open', { term: title })}
        className="text-muted-foreground/70 hover:text-foreground transition p-0.5 -m-0.5 rounded"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          id={bubbleId}
          ref={bubbleRef}
          role="note"
          /* start-0 (not left-0) so the bubble hangs the correct way in
             Arabic; width is clamped so it fits a 390px phone, and the
             measured `shift` above pulls it back inside the viewport. */
          className="absolute top-full start-0 mt-1.5 z-30 w-[min(20rem,86vw)] rounded-lg border border-border bg-background p-3 shadow-lg text-start"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        >
          <span className="block text-xs font-semibold mb-1">{title}</span>
          <span className="block text-xs text-muted-foreground leading-relaxed">
            {body}
          </span>
        </span>
      )}
    </span>
  );
}

/** Label + its explainer, the shape nearly every caller wants. */
export function DonorExplainedLabel({
  term,
  label,
  className = '',
}: {
  term: ExplainerTerm;
  label: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {label}
      <DonorExplainer term={term} />
    </span>
  );
}
