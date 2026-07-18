'use client';

// ============================================================================
// Redesign Stage 1 — the ONE status→tone system for Proximate surfaces.
//
// Before this, a dozen pages each carried their own
// `Record<status, tailwind-classes>` map; colors drifted (QA-18 found a
// flagged state rendered green). Every Proximate status chip now renders
// through <ProximateStatusBadge>, which pairs:
//   - labelForProximateStatus (plain-language, i18n-aware) for the text
//   - a semantic tone (positive/attention/critical/active/neutral) for
//     the color, with dark-mode variants baked in.
// Add new statuses to STATUS_TONE here — never as inline classes.
// ============================================================================

import { useTranslation } from '@/lib/hooks/use-translation';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';

export type ProximateTone =
  | 'positive'   // good end-states: verified, active, published, resolved
  | 'attention'  // waiting on someone: pending_*, in_review, changes_requested
  | 'critical'   // needs intervention: flagged, disputed, suspended, cancelled
  | 'active'     // in motion / informational: reported, submitted, disbursed
  | 'neutral';   // inert: draft, withdrawn, closed-out records

export const TONE_CLASSES: Record<ProximateTone, string> = {
  positive:
    'bg-emerald-100 text-emerald-800 border-emerald-300 ' +
    'dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  attention:
    'bg-amber-100 text-amber-800 border-amber-300 ' +
    'dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  critical:
    'bg-red-100 text-red-800 border-red-300 ' +
    'dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  active:
    'bg-blue-100 text-blue-800 border-blue-300 ' +
    'dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  neutral: 'bg-muted text-muted-foreground border-border',
};

const STATUS_TONE: Record<string, ProximateTone> = {
  // disbursement lifecycle
  draft: 'neutral',
  pending_cosign: 'attention',
  disbursed: 'active',
  pending_report: 'attention',
  reported: 'active',
  verified: 'positive',
  flagged: 'critical',
  // funding rounds
  in_review: 'attention',
  active: 'positive',
  closed: 'active',
  cancelled: 'critical',
  // 90-day outcome attestations
  pending: 'attention',
  submitted: 'active',
  disputed: 'critical',
  // partners
  nominated: 'attention',
  endorsed: 'active',
  bank_verified: 'positive',
  suspended: 'critical',
  // report packages
  changes_requested: 'attention',
  published: 'positive',
  // partner pipeline stages
  endorsements_open: 'attention',
  endorsement_open: 'attention',
  dd_pending: 'active',
  dd_clear: 'positive',
  // donor grants
  paused: 'attention',
  completed: 'active',
  // grievances / approvals / misc
  open: 'attention',
  in_progress: 'active',
  resolved: 'positive',
  approved: 'positive',
  rejected: 'critical',
  withdrawn: 'neutral',
};

export function toneForProximateStatus(
  status: string | null | undefined,
): ProximateTone {
  return (status && STATUS_TONE[status]) || 'neutral';
}

export function ProximateStatusBadge({
  status,
  className = '',
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!status) return null;
  return (
    <span
      className={`text-xs px-2 py-1 rounded border ${
        TONE_CLASSES[toneForProximateStatus(status)]
      } ${className}`}
    >
      {labelForProximateStatus(status, t)}
    </span>
  );
}
