'use client';

/**
 * WhyThisMatch — Phase 98.6 (design backlog Wave 1)
 *
 * Every "AI match" recommendation carries a one-line explanation of why
 * the system thinks it's a fit. Transparent matching builds trust and
 * teaches NGOs what makes them fundable.
 *
 * Use on: grant-match cards, donor-recommendation cards, peer-NGO
 * suggestions on Marketplace, reviewer-suggestions on the OB queue.
 *
 * The component takes 1-3 short reason facets (sector / country /
 * readiness / past success). Caller is responsible for passing the
 * actually-used signals — no marketing copy.
 */

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReasonFacet =
  | 'sector'
  | 'country'
  | 'language'
  | 'amount-band'
  | 'readiness'
  | 'past-success'
  | 'capacity-match'
  | 'co-funder';

const FACET_LABEL: Record<ReasonFacet, string> = {
  'sector': 'Sector match',
  'country': 'Country match',
  'language': 'Language match',
  'amount-band': 'Amount fits',
  'readiness': 'Readiness ready',
  'past-success': 'Past success similar',
  'capacity-match': 'Capacity matches donor expectations',
  'co-funder': 'Co-funder relationship',
};

interface Reason {
  facet: ReasonFacet;
  /** Optional precise value, e.g. "WASH", "Kenya", "$50K-$200K". */
  value?: string;
}

interface Props {
  reasons: Reason[];
  /** Optional dismissive copy, e.g. "(this match is automated; ask if unclear)". */
  caveat?: string;
  className?: string;
}

export function WhyThisMatch({ reasons, caveat, className }: Props) {
  if (!reasons || reasons.length === 0) return null;

  return (
    <div
      role="note"
      aria-label="Why this is a fit"
      className={cn(
        'rounded-md border border-sky-200 bg-sky-50/60 p-2.5',
        'dark:border-sky-900/40 dark:bg-sky-950/30',
        className,
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-sky-900 dark:text-sky-100">
        <Info className="h-3 w-3" />
        Why this is a fit for you
      </div>
      <ul className="space-y-1">
        {reasons.slice(0, 3).map((r, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
            <span className="mt-0.5 inline-block h-1 w-1 rounded-full bg-sky-500" />
            <span>
              <span className="font-medium">{FACET_LABEL[r.facet]}</span>
              {r.value && <span className="text-muted-foreground"> · {r.value}</span>}
            </span>
          </li>
        ))}
      </ul>
      {caveat && (
        <p className="mt-2 text-[10px] italic text-muted-foreground">{caveat}</p>
      )}
    </div>
  );
}
