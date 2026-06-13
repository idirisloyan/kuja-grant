/**
 * Status copy — Phase 50.
 *
 * Maps internal state codes to human workflow language per
 * docs/DESIGN_PRINCIPLES.md ("Use human workflow language").
 *
 * Each describer returns { label, tone } so pages can render a
 * status pill via <PageHeader status={...}> consistently across
 * the app.
 *
 * Pure functions — no React, no hooks. Trivial to unit-test.
 */

export type StatusTone = 'muted' | 'info' | 'good' | 'warn' | 'bad' | 'accent';

export interface StatusCopy {
  label: string;
  tone: StatusTone;
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export function describeApplicationStatus(status: string): StatusCopy {
  switch (status) {
    case 'draft':              return { label: 'Draft',              tone: 'muted'  };
    case 'submitted':          return { label: 'Submitted — awaiting review', tone: 'info' };
    case 'in_review':          return { label: 'In review',          tone: 'warn'   };
    case 'shortlisted':        return { label: 'Shortlisted',        tone: 'accent' };
    case 'approved':
    case 'awarded':            return { label: 'Awarded',            tone: 'good'   };
    case 'rejected':
    case 'declined':           return { label: 'Declined',           tone: 'bad'    };
    case 'withdrawn':          return { label: 'Withdrawn',          tone: 'muted'  };
    default:                   return { label: status.replace(/_/g, ' '), tone: 'muted' };
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function describeReportStatus(status: string): StatusCopy {
  switch (status) {
    case 'draft':              return { label: 'Draft',              tone: 'muted'  };
    case 'pending':            return { label: 'Not yet started',    tone: 'warn'   };
    case 'submitted':          return { label: 'Submitted — awaiting review', tone: 'info' };
    case 'in_review':          return { label: 'In review',          tone: 'warn'   };
    case 'accepted':
    case 'approved':           return { label: 'Accepted',           tone: 'good'   };
    case 'rejected':           return { label: 'Rejected — revise', tone: 'bad'    };
    case 'overdue':            return { label: 'Overdue',            tone: 'bad'    };
    default:                   return { label: status.replace(/_/g, ' '), tone: 'muted' };
  }
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export function describeGrantStatus(status: string): StatusCopy {
  switch (status) {
    case 'draft':    return { label: 'Draft',                 tone: 'muted' };
    case 'open':     return { label: 'Open for applications', tone: 'good' };
    case 'review':   return { label: 'In review',             tone: 'warn' };
    case 'closed':   return { label: 'Closed',                tone: 'muted' };
    case 'awarded':  return { label: 'Awarded',               tone: 'accent' };
    default:         return { label: status.replace(/_/g, ' '), tone: 'muted' };
  }
}

// ---------------------------------------------------------------------------
// Memberships (NEAR)
// ---------------------------------------------------------------------------

export function describeMembershipStatus(status: string): StatusCopy {
  switch (status) {
    case 'pending':       return { label: 'Awaiting review', tone: 'warn'  };
    case 'under_review':  return { label: 'Under review',    tone: 'warn'  };
    case 'active':        return { label: 'Active member',   tone: 'good'  };
    case 'rejected':      return { label: 'Rejected',        tone: 'bad'   };
    case 'suspended':     return { label: 'Suspended',       tone: 'bad'   };
    case 'expelled':      return { label: 'Expelled',        tone: 'bad'   };
    default:              return { label: status.replace(/_/g, ' '), tone: 'muted' };
  }
}

// ---------------------------------------------------------------------------
// Declarations (NEAR emergency)
// ---------------------------------------------------------------------------

export interface DeclarationStatusInput {
  status: string;
  signed_count?: number;
  required_signer_count?: number;
  applicants_notified_at?: string | null;
}

export function describeDeclarationStatus(d: DeclarationStatusInput): StatusCopy {
  if (d.status === 'cancelled')   return { label: 'Cancelled',  tone: 'bad'    };
  if (d.status === 'closed')      return { label: 'Closed',     tone: 'muted'  };
  if (d.status === 'signed_active') {
    return d.applicants_notified_at
      ? { label: 'Applications open', tone: 'good'   }
      : { label: 'Ready to release',  tone: 'accent' };
  }
  if (d.status === 'in_review') {
    const remaining = Math.max(
      0,
      (d.required_signer_count ?? 0) - (d.signed_count ?? 0),
    );
    return remaining === 0
      ? { label: 'Signatures complete', tone: 'good' }
      : { label: `Waiting for ${remaining} signature${remaining === 1 ? '' : 's'}`, tone: 'warn' };
  }
  return { label: 'Draft', tone: 'muted' };
}

// ---------------------------------------------------------------------------
// Phase 89 — Simplified state buckets for NGO-facing surfaces.
// ---------------------------------------------------------------------------
// The full status enums (7 report states, 6+ application states) are
// donor-side and reviewer-side concerns. For the NGO, all that matters
// is one of three buckets:
//   - "You owe a response"  (draft, pending, revision_requested, overdue)
//   - "Donor has it"        (submitted, in_review, under_review)
//   - "Done"                (accepted, approved, awarded, rejected, declined)
// Use these on dashboards and list rows; use the full describeXStatus
// on detail pages where the precise donor state is informative.

export type SimpleNgoState = 'on_you' | 'on_donor' | 'done';

export function describeReportStatusForNgo(status: string): { bucket: SimpleNgoState; label: string; tone: StatusTone } {
  switch (status) {
    case 'draft':
    case 'pending':
    case 'overdue':
    case 'revision_requested':
    case 'rejected':
      return { bucket: 'on_you', label: 'Your turn', tone: 'warn' };
    case 'submitted':
    case 'in_review':
    case 'under_review':
      return { bucket: 'on_donor', label: 'With the donor', tone: 'info' };
    case 'accepted':
    case 'approved':
      return { bucket: 'done', label: 'Done', tone: 'good' };
    default:
      return { bucket: 'on_you', label: 'Your turn', tone: 'muted' };
  }
}

export function describeApplicationStatusForNgo(status: string): { bucket: SimpleNgoState; label: string; tone: StatusTone } {
  switch (status) {
    case 'draft':
    case 'declined':
    case 'rejected':
    case 'revision_requested':
      return { bucket: 'on_you', label: 'Your turn', tone: 'warn' };
    case 'submitted':
    case 'in_review':
    case 'under_review':
      return { bucket: 'on_donor', label: 'With the donor', tone: 'info' };
    case 'awarded':
    case 'accepted':
    case 'approved':
      return { bucket: 'done', label: 'Done', tone: 'good' };
    default:
      return { bucket: 'on_you', label: 'Your turn', tone: 'muted' };
  }
}

// ---------------------------------------------------------------------------
// Tone -> Tailwind pill class — for places that don't use <PageHeader>
// but still want the same vocabulary.
// ---------------------------------------------------------------------------

export const TONE_PILL_CLASS: Record<StatusTone, string> = {
  muted:  'bg-muted text-muted-foreground',
  info:   'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  good:   'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]',
  warn:   'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]',
  bad:    'bg-destructive/15 text-destructive',
  accent: 'bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))]',
};
