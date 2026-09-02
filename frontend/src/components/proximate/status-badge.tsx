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

// PF-UX-017 — the ONE reconciled status→tone map for every Proximate surface.
// Before consolidation a dozen pages carried their own maps and the same
// status drifted across colors (e.g. `reported` was amber in the disbursement
// queue, green in the round roster, orange in traceability). This map is now
// the single source of truth; per-page maps were deleted in favour of
// proxPillForStatus() below. Roles: neutral=inert/early (grey),
// attention=waiting on someone (amber), active=in motion (orange/accent),
// positive=cleared/concluded (green), critical=true risk only (red).
const STATUS_TONE: Record<string, ProximateTone> = {
  // ── neutral (grey): inert, early, or positional-only — no health signal ──
  draft: 'neutral',
  planned: 'neutral',
  nominated: 'neutral',
  candidate: 'neutral',
  not_awarded: 'neutral',
  stood_down: 'neutral',
  deferred: 'neutral',
  withdrawn: 'neutral',
  closed: 'neutral',
  drafting: 'neutral', // being prepared; nothing awaited from the reviewer yet
  no_footprint: 'neutral',
  other: 'neutral',

  // ── attention (amber): waiting on someone / a pending decision / a warning ─
  pending: 'attention',
  pending_cosign: 'attention',
  pending_report: 'attention',
  in_review: 'attention',
  endorsements_open: 'attention',
  endorsement_open: 'attention',
  dd_pending: 'attention',
  dd_in_progress: 'attention',
  sent: 'attention',
  clarification: 'attention',
  changes_requested: 'attention',
  revision_requested: 'attention',
  inconclusive: 'attention',
  medium: 'attention',
  safety: 'attention',
  open: 'attention',
  paused: 'attention',

  // ── active (orange/accent): in motion / progressing / informational ──
  disbursed: 'active',
  reported: 'active',
  submitted: 'active',
  endorsed: 'active',
  partner_signed: 'active',
  adeso_signed: 'active',
  in_progress: 'active',

  // ── positive (green): cleared, verified, or successfully concluded ──
  verified: 'positive',
  dd_clear: 'positive',
  dd_passed: 'positive',
  clear: 'positive',
  confirmed: 'positive',
  attested: 'positive',
  approved: 'positive',
  resolved: 'positive',
  published: 'positive',
  accepted: 'positive',
  completed: 'positive',
  bank_verified: 'positive',
  awarded: 'positive',
  active: 'positive', // a live/open funding round is healthy
  positive: 'positive',
  low: 'positive',

  // ── critical (red): genuine risk or failure — nothing routine here ──
  flagged: 'critical',
  disputed: 'critical',
  suspended: 'critical',
  cancelled: 'critical',
  fraud: 'critical',
  rejected: 'critical',
  void: 'critical',
  dd_failed: 'critical',
  high: 'critical',
  negative: 'critical',
  critical: 'critical',
  expired: 'critical',
  expired_response: 'critical',
};

export function toneForProximateStatus(
  status: string | null | undefined,
): ProximateTone {
  return (status && STATUS_TONE[status]) || 'neutral';
}

// The five Proximate `.prox-pill` classes (globals.css, scoped to
// [data-tenant="proximate"]): good=green, warn=amber, danger=red, slate=grey,
// acc=burnt-orange (the accent — the visual home of the "active/in motion"
// role, which the Tailwind ProximateStatusBadge draws in blue).
export type ProxPill = 'good' | 'warn' | 'danger' | 'slate' | 'acc';

const TONE_TO_PILL: Record<ProximateTone, ProxPill> = {
  positive: 'good',
  attention: 'warn',
  critical: 'danger',
  active: 'acc',
  neutral: 'slate',
};

// One source of truth for the `.prox-pill` class of any status. Known statuses
// resolve through STATUS_TONE; genuinely free-form / unknown statuses fall back
// to a conservative keyword heuristic (subsuming the old per-page grantPill /
// statusPill / pillTone matchers); everything else is neutral grey.
export function proxPillForStatus(status: string | null | undefined): ProxPill {
  if (!status) return 'slate';
  const tone = STATUS_TONE[status];
  if (tone) return TONE_TO_PILL[tone];
  const s = status.toLowerCase();
  if (/flag|suspend|reject|block|fraud|void|fail|overdue|breach|dispute|cancel|expired|denied/.test(s)) return 'danger';
  if (/clear|verif|complete|approved|passed|confirm|attest|publish|accept|resolved|award|current|received|allocated/.test(s)) return 'good';
  if (/disburs|submit|\bsent\b|progress|endors|signed|transit/.test(s)) return 'acc';
  if (/pending|review|report|draft|intake|due|cosign|clarif|await|revision|request|open/.test(s)) return 'warn';
  return 'slate';
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
