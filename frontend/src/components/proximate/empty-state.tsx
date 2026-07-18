'use client';

// Redesign Stage 1 — the standard empty-state block for Proximate lists
// and card bodies. Spec requirement: every list surface renders a real
// empty state (what this is + what to do next), never a bare "No X yet."

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`text-center px-4 ${compact ? 'py-5' : 'py-10'}`}>
      {Icon && (
        <Icon className="w-8 h-8 mx-auto mb-3 text-muted-foreground/60" />
      )}
      <p className="text-sm text-muted-foreground">{title}</p>
      {hint && (
        <p className="text-xs text-muted-foreground/80 mt-1 max-w-md mx-auto">
          {hint}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
