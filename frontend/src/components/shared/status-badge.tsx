'use client';

/**
 * StatusBadge — shadcn/Tailwind replacement of the MUI <Chip>.
 *
 * Renders a small outlined pill with tone-coded color. The `sx` prop from
 * the old MUI version is intentionally dropped — callers should use
 * `className` instead.
 *
 * Role-aware labels (added 2026-04-26):
 *   Pass `kind` ("app" | "report" | "grant") and the badge will render a
 *   coaching tone for NGOs (warmer, second-person) and an enterprise tone for
 *   donor/admin/reviewer (crisp, neutral). When `kind` is omitted, falls back
 *   to the legacy hardcoded label table so callers that haven't been updated
 *   keep working — including non-{app,report,grant} statuses (review,
 *   compliance, verification).
 */

import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';

export type StatusBadgeKind = 'app' | 'report' | 'grant';

type Tone = 'success' | 'error' | 'warning' | 'info' | 'primary' | 'default';

const TONE_CLS: Record<Tone, string> = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  error: 'border-red-300 bg-red-50 text-red-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
  info: 'border-sky-300 bg-sky-50 text-sky-800',
  primary: 'border-[hsl(var(--kuja-clay)/0.35)] bg-[hsl(var(--kuja-sand-50))] text-[hsl(var(--kuja-clay))]',
  default: 'border-border bg-background text-foreground',
};

const STATUS_TONE: Record<string, Tone> = {
  // Grant
  draft: 'default',
  open: 'success',
  review: 'info',
  closed: 'default',
  awarded: 'primary',
  // Application
  submitted: 'info',
  under_review: 'warning',
  scored: 'primary',
  rejected: 'error',
  // Report
  accepted: 'success',
  revision_requested: 'warning',
  // Review
  assigned: 'default',
  in_progress: 'info',
  completed: 'success',
  // Compliance
  clear: 'success',
  flagged: 'error',
  pending: 'warning',
  error: 'error',
  // Verification
  unverified: 'default',
  ai_reviewed: 'primary',
  verified: 'success',
  expired: 'error',
};

/**
 * Legacy fallback labels — used when no `kind` is supplied or when the
 * status doesn't belong to one of the role-aware kinds (e.g. review,
 * compliance, verification). Also acts as a safety net if an i18n key is
 * missing.
 */
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  review: 'In Review',
  closed: 'Closed',
  awarded: 'Awarded',
  submitted: 'Submitted',
  under_review: 'Under Review',
  scored: 'Scored',
  rejected: 'Rejected',
  accepted: 'Accepted',
  revision_requested: 'Revision Requested',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  clear: 'Clear',
  flagged: 'Flagged',
  pending: 'Pending',
  error: 'Error',
  unverified: 'Unverified',
  ai_reviewed: 'AI Reviewed',
  verified: 'Verified',
  expired: 'Expired',
};

interface StatusBadgeProps {
  status: string;
  /**
   * Domain of the status. When supplied, the label is resolved via i18n key
   * `status.{kind}.{status}.{enterprise|coaching}` based on the current
   * user's role. Omit for non-domain statuses (review, compliance, etc.).
   */
  kind?: StatusBadgeKind;
  className?: string;
}

export function StatusBadge({ status, kind, className = '' }: StatusBadgeProps) {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);

  const tone = STATUS_TONE[status] ?? 'default';

  let label: string;
  if (kind) {
    const variant = role === 'ngo' ? 'coaching' : 'enterprise';
    const key = `status.${kind}.${status}.${variant}`;
    const translated = t(key);
    // translate() falls back to the raw key when no translation exists.
    // If that happened, drop down to the legacy label table for safety.
    label = translated === key ? (STATUS_LABEL[status] ?? status) : translated;
  } else {
    label = STATUS_LABEL[status] ?? status;
  }

  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium ${TONE_CLS[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
