'use client';

/**
 * PageShell — Phase 47 (June 2026).
 *
 * Encodes the standard page anatomy from docs/DESIGN_PRINCIPLES.md
 * so individual pages can't drift from the shape:
 *
 *   ┌────────────────────────────────────────────┐
 *   │  Back link (optional)                      │
 *   │  Header: title · status · meta · actions   │
 *   ├────────────────────────────────────────────┤
 *   │  Attention strip (blockers / next action)  │
 *   ├────────────────────────────────────────────┤
 *   │  Main work area                            │
 *   ├────────────────────────────────────────────┤
 *   │  Supporting detail (collapsible by default)│
 *   └────────────────────────────────────────────┘
 *
 * Usage is composition-based; every subcomponent is optional. A page
 * that doesn't need an attention strip just omits <PageAttention/>.
 *
 *   <PageShell>
 *     <PageBack href="/admin/declarations" label="Back to declarations" />
 *     <PageHeader
 *       title="Drought response Turkana"
 *       status={{ label: 'Draft', tone: 'muted' }}
 *       meta={[{ label: 'KEN' }, { label: 'humanitarian' }]}
 *       primaryAction={<button>Submit for signature</button>}
 *     />
 *     <PageAttention items={[{ tone: 'warn', label: 'Add 2 more committee members' }]} />
 *     <PageMain>...page content...</PageMain>
 *     <PageDetail>
 *       <PageDetailSection title="Audit chain">...</PageDetailSection>
 *     </PageDetail>
 *   </PageShell>
 */

import { ChevronLeft, AlertCircle, AlertTriangle, CheckCircle2, Info, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tones — shared status / attention vocabulary
// ---------------------------------------------------------------------------

type Tone = 'muted' | 'info' | 'good' | 'warn' | 'bad' | 'accent';

const TONE_PILL: Record<Tone, string> = {
  muted:  'bg-muted text-muted-foreground',
  info:   'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  good:   'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]',
  warn:   'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]',
  bad:    'bg-destructive/15 text-destructive',
  accent: 'bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))]',
};

const TONE_BANNER: Record<Tone, string> = {
  muted:  'border-border bg-muted/30 text-muted-foreground',
  info:   'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
  good:   'border-[hsl(var(--kuja-grow))]/30 bg-[hsl(var(--kuja-grow))]/10 text-[hsl(var(--kuja-grow))]',
  warn:   'border-[hsl(var(--kuja-sun))]/30 bg-[hsl(var(--kuja-sun))]/10 text-[hsl(var(--kuja-sun))]',
  bad:    'border-destructive/30 bg-destructive/10 text-destructive',
  accent: 'border-[hsl(var(--kuja-clay))]/30 bg-[hsl(var(--kuja-clay))]/10 text-[hsl(var(--kuja-clay))]',
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  muted:  Info,
  info:   Info,
  good:   CheckCircle2,
  warn:   AlertTriangle,
  bad:    AlertCircle,
  accent: Info,
};

// ---------------------------------------------------------------------------
// PageShell — top-level container, just consistent vertical rhythm
// ---------------------------------------------------------------------------

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-5', className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// PageBack — small "← Back to <list>" link above the header
// ---------------------------------------------------------------------------

export function PageBack({
  href, label, onClick,
}: {
  href?: string;
  label: string;
  onClick?: () => void;
}) {
  const cls = 'text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1';
  if (href) {
    return (
      <Link href={href} className={cls}>
        <ChevronLeft className="w-3 h-3" /> {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <ChevronLeft className="w-3 h-3" /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PageHeader — title · status · meta strip · actions
// ---------------------------------------------------------------------------

interface StatusPill {
  label: string;
  tone: Tone;
}

interface MetaItem {
  label: string;
  icon?: LucideIcon;
}

export function PageHeader({
  title, subtitle, icon: Icon, status, meta, primaryAction, secondaryAction,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  status?: StatusPill;
  /** Compact meta strip rendered under the title — country, sector, severity, etc. */
  meta?: MetaItem[];
  /** Primary action (single button) — appears top-right. */
  primaryAction?: ReactNode;
  /** Secondary action — appears next to the primary; use sparingly. */
  secondaryAction?: ReactNode;
}) {
  return (
    <header className="border border-border rounded-lg bg-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            {Icon && <Icon className="w-6 h-6 text-[hsl(var(--kuja-clay))] shrink-0 self-center" />}
            <h1 className="kuja-display text-2xl">{title}</h1>
            {status && (
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize',
                TONE_PILL[status.tone],
              )}>
                {status.label}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
          {meta && meta.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              {meta.map((item, i) => {
                const MetaIcon = item.icon;
                return (
                  <span key={i} className="inline-flex items-center gap-1">
                    {MetaIcon && <MetaIcon className="w-3 h-3" />}
                    {item.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {(primaryAction || secondaryAction) && (
          <div className="flex items-center gap-2 shrink-0">
            {secondaryAction}
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// PageAttention — blockers / overdue / next required action
// ---------------------------------------------------------------------------

export interface AttentionItem {
  tone: Tone;
  label: string;
  /** Optional secondary description, smaller line under the label. */
  hint?: string;
  /** Optional inline action button on the right of the item. */
  action?: ReactNode;
}

export function PageAttention({ items }: { items: AttentionItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="space-y-2" aria-label="What needs your attention">
      {items.map((item, i) => {
        const ToneIcon = TONE_ICON[item.tone];
        return (
          <div
            key={i}
            className={cn(
              'border rounded-md px-3 py-2 flex items-start justify-between gap-3 text-xs',
              TONE_BANNER[item.tone],
            )}
          >
            <div className="flex items-start gap-2 min-w-0">
              <ToneIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold">{item.label}</div>
                {item.hint && (
                  <div className="opacity-80 mt-0.5">{item.hint}</div>
                )}
              </div>
            </div>
            {item.action && <div className="shrink-0">{item.action}</div>}
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PageMain — children container with consistent vertical spacing
// ---------------------------------------------------------------------------

export function PageMain({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-5', className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// PageDetail / PageDetailSection — supporting detail, collapsed by default
// ---------------------------------------------------------------------------

export function PageDetail({
  children,
  title = 'Supporting detail',
}: {
  children: ReactNode;
  /** Optional outer label (e.g. "Audit & history") — rendered if provided. */
  title?: string;
}) {
  return (
    <section className="space-y-2" aria-label={title}>
      {children}
    </section>
  );
}

export function PageDetailSection({
  title,
  defaultOpen = false,
  icon: Icon,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="border border-border rounded-lg bg-card overflow-hidden group"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
        <span className="font-semibold text-sm flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          {title}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground transition-transform',
          open && 'rotate-180',
        )} />
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-border">
        {children}
      </div>
    </details>
  );
}
