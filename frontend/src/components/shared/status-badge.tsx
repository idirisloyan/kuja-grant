'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  // Grant
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  review: 'bg-blue-50 text-blue-700 border-blue-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
  awarded: 'bg-brand-50 text-brand-700 border-brand-200',
  // Application
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  under_review: 'bg-amber-50 text-amber-700 border-amber-200',
  scored: 'bg-violet-50 text-violet-700 border-violet-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  // Report
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  revision_requested: 'bg-amber-50 text-amber-700 border-amber-200',
  // Review
  assigned: 'bg-slate-100 text-slate-600 border-slate-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  // Compliance
  clear: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  flagged: 'bg-rose-50 text-rose-700 border-rose-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  // Verification
  unverified: 'bg-slate-100 text-slate-500 border-slate-200',
  ai_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired: 'bg-rose-50 text-rose-700 border-rose-200',
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

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs font-medium border',
        statusStyles[status] || 'bg-slate-100 text-slate-600 border-slate-200',
        className
      )}
    >
      <span className={cn(
        'w-1.5 h-1.5 rounded-full mr-1.5',
        status === 'open' || status === 'clear' || status === 'accepted' || status === 'verified' || status === 'completed' ? 'bg-emerald-500' :
        status === 'flagged' || status === 'rejected' || status === 'error' || status === 'expired' ? 'bg-rose-500' :
        status === 'pending' || status === 'under_review' || status === 'revision_requested' ? 'bg-amber-500' :
        status === 'submitted' || status === 'in_progress' || status === 'review' ? 'bg-blue-500' :
        status === 'awarded' || status === 'scored' || status === 'ai_reviewed' ? 'bg-brand-500' :
        'bg-slate-400'
      )} />
      {statusLabels[status] || status}
    </Badge>
  );
}
