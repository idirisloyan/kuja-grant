'use client';

import Chip from '@mui/material/Chip';
import type { SxProps, Theme } from '@mui/material/styles';

// ---------------------------------------------------------------------------
// Status color mapping — maps each status to a color category
// ---------------------------------------------------------------------------

type ChipColor = 'success' | 'error' | 'warning' | 'info' | 'primary' | 'default';

const statusColorMap: Record<string, ChipColor> = {
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

const statusLabels: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  status: string;
  className?: string;
  sx?: SxProps<Theme>;
}

export function StatusBadge({ status, className, sx }: StatusBadgeProps) {
  const color = statusColorMap[status] || 'default';
  const label = statusLabels[status] || status;

  return (
    <Chip
      label={label}
      color={color}
      size="small"
      variant="outlined"
      className={className}
      sx={{
        fontWeight: 500,
        fontSize: '0.6875rem',
        height: 24,
        ...sx,
      }}
    />
  );
}
