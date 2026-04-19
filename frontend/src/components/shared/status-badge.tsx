'use client';

/**
 * StatusBadge — shadcn/Tailwind replacement of the MUI <Chip>.
 *
 * Renders a small outlined pill with tone-coded color. The `sx` prop from
 * the old MUI version is intentionally dropped — callers should use
 * `className` instead. No external consumers pass `sx` today.
 */

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
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const tone = STATUS_TONE[status] ?? 'default';
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium ${TONE_CLS[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
