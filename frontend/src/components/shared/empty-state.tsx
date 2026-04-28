'use client';

/**
 * EmptyState — Phase 7.1
 *
 * Consistent empty-state primitive for tables, lists, dashboards.
 * Encourages every empty state to ship with:
 *   - an icon (or lucide component) anchoring the visual
 *   - a one-line title that explains what's empty
 *   - a one-line body that suggests a next step
 *   - optionally a primary action (CTA)
 *
 * The shape matches the team's earlier feedback: "Every empty state ends
 * with a single specific CTA". When `cta` is omitted, body should at
 * least describe what action would populate the area.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: LucideIcon | null;
  title: string;
  body?: string;
  cta?: ReactNode;
  variant?: 'card' | 'inline';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
  variant = 'card',
  className = '',
}: Props) {
  const wrap =
    variant === 'card'
      ? 'rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center'
      : 'px-3 py-6 text-center';
  return (
    <div className={cn(wrap, className)}>
      {Icon && (
        <Icon className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
      )}
      <p className="text-base font-medium text-foreground">{title}</p>
      {body && (
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      )}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
