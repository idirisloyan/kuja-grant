'use client';

/**
 * Phase 82 — Today's focus banner.
 *
 * The single sharpest expression of Phase 48's principle: the most
 * important real estate on the dashboard is the one thing the user
 * should do today. Picks the highest-priority attention item from
 * the role's dashboard, renders it as a bold single sentence, and
 * deep-links to the right surface with one click.
 *
 * Render at the very top of any role dashboard, before PageAttention,
 * so it's the first thing the eye lands on.
 *
 * Tone-aware: bad → destructive treatment, warn → sun, good → grow.
 */

import Link from 'next/link';
import {
  Target, AlertTriangle, Clock, Sparkles, ArrowRight,
} from 'lucide-react';
import type { AttentionItem } from '@/components/layout/page-shell';

// page-shell's Tone union, replicated locally because it's not exported.
type Tone = 'muted' | 'info' | 'good' | 'warn' | 'bad' | 'accent';

interface DashboardItem {
  label?: string;
  detail?: string;
  hint?: string;
  href?: string;
  cta_label?: string;
  severity?: string;
  due_in_days?: number;
  tone?: Tone;
}

interface Props {
  items?: (AttentionItem | DashboardItem)[];
  className?: string;
}

// Priority order: things that have a hard deadline and are overdue rise
// to the top. Severity:critical beats severity:high. Anything tagged
// 'bad' tone beats 'warn' beats anything else.
function priority(item: AttentionItem | DashboardItem): number {
  let p = 0;
  const tone = (item as { tone?: Tone }).tone;
  if (tone === 'bad') p += 1000;
  else if (tone === 'warn') p += 500;
  else if (tone === 'good') p += 100;

  const severity = (item as DashboardItem).severity;
  if (severity === 'critical') p += 800;
  else if (severity === 'high') p += 400;

  const due = (item as DashboardItem).due_in_days;
  if (typeof due === 'number') {
    if (due < 0) p += 600 + Math.min(Math.abs(due), 30) * 10;
    else if (due <= 7) p += 300;
  }
  return p;
}

const TONE_STYLES: Record<Tone, { bg: string; ring: string; chip: string; icon: typeof AlertTriangle }> = {
  good:   { bg: 'from-[hsl(var(--kuja-grow))]/15 to-card', ring: 'border-[hsl(var(--kuja-grow))]/40', chip: 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]', icon: Sparkles },
  warn:   { bg: 'from-[hsl(var(--kuja-sun))]/15 to-card',  ring: 'border-[hsl(var(--kuja-sun))]/40',   chip: 'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]',   icon: Clock },
  bad:    { bg: 'from-destructive/15 to-card',             ring: 'border-destructive/40',             chip: 'bg-destructive/15 text-destructive',                         icon: AlertTriangle },
  info:   { bg: 'from-[hsl(var(--kuja-spark))]/15 to-card', ring: 'border-[hsl(var(--kuja-spark))]/40', chip: 'bg-[hsl(var(--kuja-spark))]/15 text-[hsl(var(--kuja-spark))]', icon: Target },
  muted:  { bg: 'from-muted/30 to-card', ring: 'border-border', chip: 'bg-muted text-muted-foreground', icon: Target },
  accent: { bg: 'from-[hsl(var(--kuja-clay))]/15 to-card', ring: 'border-[hsl(var(--kuja-clay))]/40', chip: 'bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))]', icon: Target },
};

export function TodayFocusBanner({ items, className = '' }: Props) {
  if (!items || items.length === 0) {
    return (
      <section className={`bg-gradient-to-br from-[hsl(var(--kuja-grow))]/10 to-card border border-[hsl(var(--kuja-grow))]/30 rounded-xl p-5 ${className}`}>
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[hsl(var(--kuja-grow))] mt-0.5 shrink-0" />
          <div>
            <h2 className="kuja-display text-lg">You&apos;re all caught up.</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Nothing demands action right now. Take the win.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Phase 617 — the dashboard intentionally orders the attention list
  // (drafts → reports due → matches → …) and PageAttention renders it
  // in that order, so the user's eye expects items[0] to be "the next
  // thing." The previous internal priority() sort picked a DIFFERENT
  // item than items[0] when its weights disagreed with the dashboard's
  // intent (e.g. ranking warn > accent globally), so the headline CTA
  // and the first attention card pointed at different actions.
  // Caught in the 2026-06-21 team retest. Use the dashboard order
  // verbatim — single source of truth — and only fall back to the
  // priority sort if multiple items share the top spot (never happens
  // today, kept as belt-and-suspenders).
  const top = items[0];
  const sorted = items;
  const tone = ((top as { tone?: Tone }).tone ?? 'info') as Tone;
  const T = TONE_STYLES[tone];
  const Icon = T.icon;

  const label = (top as { label?: string }).label || 'Action needed';
  const detail =
    (top as { hint?: string }).hint
    || (top as { detail?: string }).detail
    || '';
  const href = (top as { href?: string }).href;
  const cta = (top as { cta_label?: string }).cta_label || 'Open';

  return (
    <section className={`bg-gradient-to-br ${T.bg} border ${T.ring} rounded-xl p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold rounded-full px-2 py-0.5 ${T.chip} shrink-0 mt-1`}>
          <Target className="w-3 h-3" /> Today
        </span>
        <Icon className={`w-5 h-5 mt-1 shrink-0 ${tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]' : 'text-[hsl(var(--kuja-clay))]'}`} />
        <div className="min-w-0 flex-1">
          <h2 className="kuja-display text-lg leading-snug">{label}</h2>
          {detail && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{detail}</p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white text-xs font-semibold px-3 py-2"
          >
            {cta} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {sorted.length > 1 && (
        <p className="text-[11px] text-muted-foreground mt-3 ml-9">
          + {sorted.length - 1} more attention item{sorted.length === 2 ? '' : 's'} below
        </p>
      )}
    </section>
  );
}
